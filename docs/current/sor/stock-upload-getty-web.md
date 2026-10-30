# Getty Images web upload (`getty-web`) — background browser automation

Parent: [stock-upload](stock-upload.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. Why this exists and why it is a bridge job

Getty's ESP **API** preset (`esp-https`) needs a Partner API key; a website login
uploads through `esp.gettyimages.com/contribute`. The app cannot drive it — no
CORS-enabled login — so the **loopback helper** (`tools/bridge/gettyweb/`) drives
a real browser.

## 2. Flow

1. The user saves the contributor **numeric ID** (Getty also takes an e-mail) and
   password in the vault, then presses **Test connection** or **Upload**.
2. `panelops.ts` probes `/health` (`gettyWeb.ready`, `gettyWeb.browser`); a
   missing browser or an old helper fails with a hint.
3. `runupload.ts` groups tasks **per icon** (JPEG + optional EPS), one `sessionKey`
   per target. `getty-web` is the one protocol that does not send one request per
   icon: `uploadGettyWebRun` posts every icon together.
4. `/getty-web/upload` takes the whole run (`icons: [{files, metadata}]`, up to
   200 icons); the
   helper stages it, signs in once, creates **one** batch and hands **all** files
   to the page uploader in a single `DOM.setFileInputFiles`. Stray dialogs and
   snackbars are dismissed first — one blocks Getty's uploader.
5. Getty's uploader transfers. The helper waits until every file is listed, then
   until each card proves its own outcome: **a thumbnail means uploaded**,
   `invalid-file-media` ("Upload failed") means not — a listed row proves nothing.
   The app marks an icon uploaded only when the response lists its stem, and names
   a rejected file with Getty's id. `GET /getty-web/progress` feeds the panel the
   live counts while the one request is in flight, so **the bar moves with each
   thumbnail** (1 s poll; the helper's 404 before its session exists is retried).
6. **Metadata:** per contribution it selects the card by stem, types the accepted
   title, description, keywords and **today's date** into Date Created, and saves —
   never overwriting Getty's IPTC/XMP prefill.
7. **Complete once:** after the last icon the run posts `/getty-web/finish`. It
   refuses while a contribution is missing **or says "Upload failed"**, then waits
   (bounded) for Getty to enable Complete — every card carries
   `not_ready_to_submit` while ingesting — clicks it and accepts the confirmation.
8. `/getty-web/close` shuts the browser and deletes the staged files; an idle
   session closes after five minutes. A visible window is only let go.

**Sign-in is typed, not assigned.** Each poll focuses the identifier (then the
password), inserts the saved text with real input events (`Input.insertText`) and
writes through `angular.element(el)` too: the page is `ng-app="SignInApp"` and
AngularJS ignores `.value =`, which submits an empty form. It then presses submit
or Enter / `form.requestSubmit()`, takes a "sign in with password" option on an
SSO screen and returns to `/contribute`. A stalled run names the step and
summarizes the screen (`page "Sign in - ESP"; 2 input(s)`), never a value.

## 3. Background, headed, attach, profile and self-check

- Default: `chrome --headless=new` with a throwaway profile (never steals focus).
- `--getty-headed` (env `GETTY_WEB_HEADED=1`) shows the window for watching a run
  or clearing a verification. A visible window is never killed: a failed run
  leaves the page up and says so.
- `--getty-profile <folder>` (env `GETTY_WEB_PROFILE`) reuses one profile between
  runs, so a first sign-in's cookies survive. It holds Getty cookies and is never
  deleted by the helper.
- `--getty-check` launches once, verifies the DevTools socket, prints
  `browser:`, `launch:`, `devtools:`, `socket:`.
- `--getty-reset --getty-profile <folder>` ends the browser holding that folder.
- `--getty-cdp` (= `GETTY_WEB_CDP`) attaches to a browser started with
  `--remote-debugging-port=9222` (loopback only).
- `GETTY_WEB_BROWSER` overrides the executable; `GETTY_WEB_UPLOAD_TIMEOUT_MS`
  (180 s) and `GETTY_WEB_READY_TIMEOUT_MS` (120 s) bound the two waits.

**A vector pair is one contribution.** Getty lists the EPS name only, so files are
matched by **stem** (`.jpg` + `.eps` = one card, one drawer).

**One profile, one browser — freed by the helper.** A browser answering on the
folder's port is attached to. A locked folder without a port means a leftover
window owns it, so the helper ends the browsers whose command line carries that
exact `--user-data-dir`, clears the stale locks and launches again — no manual
"close every window" step, no other browser touched. Only a failed reset stops the
run, naming the folder. Stale `DevToolsActivePort` files go first and every port
is verified over HTTP. Closing kills the browser tree; a visible window is only let
go, and its throwaway profile goes when Chrome exits.

## 4. What is sent

- One JPEG per icon plus its matching-stem EPS; SVG, PNG, ZIP are refused first.
- Title, description and keywords travel inside the exported JPEG/EPS
  (IPTC/XMP/RDF) *and* as a `metadata` field, so the helper can type them where an
  editor exists (an empty editor gets the value, a prefilled one is left alone).
  Only `accepted` icons are sent (`gettyWebMetadataOf`), capped (title 200,
  description 2000, keywords 49 × 64, deduped). The **Title + description** copy
  still applies to the uploaded copy; Date Created is today unless one is given.
- Batch name `IconSplitter <UTC date> (<n> icons)`; submission type
  `iStock creative illustration`. Completion is attempted (`complete: true`) and
  reported as `completed`/`completion`; `GETTY_WEB_COMPLETE=0` stops after upload.

## 5. Page contract and failure codes

`driver.mjs` keeps each DOM decision self-contained (serialized with a prelude).
The prelude declares its own constants and each step runs inside an IIFE, so it
can be re-injected without redeclaring globals. A helper that named a module
constant once arrived as a bare `hidden,checkbox,…` list.
Captured Batches handles — `create-batch-button`, the dialog,
`create-batch-submission-type` (MUI: mousedown, portal `role=listbox`),
`submission_name`, `event_id`, `create-batch-confirm-button`, the contribution
uploader, the cards and the metadata drawer — and the wait/dismiss rules are in
[selectors/stock-upload](../selectors/stock-upload.md).

Sign-in has no captured handles: `fillLoginForm`, `focusLoginField`,
`inspectSignIn`, `choosePasswordOption`, `submitLogin` match behaviour, as
described in the selectors page.

Codes map to HTTP: `bad-request` 400 (config, host, file rules; 409 for a finish
with no open batch), `auth` 401 (rejected sign-in, signed out mid-run), `browser`
503 (no executable, launch failure, busy profile, refused socket), `timeout` 504
(no batch page / names missing / control never ready / a contribution absent at
`finish`), `cancelled` 499, `page` 502 (selector not found). A refused socket names
its port and says to retry (the helper frees its own folder). Reasons are scrubbed
of identifier and password.

## 6. Honest limits

- Built against captured markup plus a local helper, **not** a live account:
  selector drift is a `page` failure naming the step. Only the hidden contribution
  uploader is targeted — release inputs are never used.
- A thumbnail means Getty took the file, not that it accepted it for review.
- An interrupted run can leave a batch short; a duplicate is the recovery.
- Arkose/funCaptcha **cannot** be automated: solve it once headed with
  `--getty-profile`, then runs reuse the cookie. Typing and the Angular bridge are
  proven against a fake CDP and a DOM.
- The helper types the saved identifier, guessing nothing.
- Metadata editors and Complete use **label keywords** and row proximity — guesses
  **not** seen live; a missing editor is reported per file.
- `completed: true` means the control was clicked and confirmed, not that Getty
  passed the files; an incomplete run says so and leaves the batch to finish.

## 7. Invariants and tests

- Credentials live only in the vault ([I-81](invariants/upload.md#i-81)), go only
  to the loopback helper and are never logged or echoed.
- Only `https://<…>.gettyimages.com` contributor paths are contacted; `..`,
  query strings and non-GETTY hosts are refused (`contributeUrlOf`).
- Files are staged in a temp folder as sanitized names, deleted on close.
- Tests (`tests/`): `getty_web_driver` (page steps in a DOM), `getty_web_signin`
  (typing order, SSO choice, reasons), `getty_web_browser` (locks, launch, reset,
  stale port, socket reasons, kept window), `getty_web_batch` (MUI dialog, portal
  options, new batch id, uploader input), `getty_web_upload` (rules + client),
  `getty_web_cdp` (framing, repeated prelude), `bridge_getty_web` (routes,
  `--getty-headed`, `--getty-check`, `--getty-reset`), `getty_web_finalize`
  (metadata + complete), `stockupload_getty_web` (grouping, cancel, no creds).
