# Getty Images web upload (`getty-web`) — background browser automation

Parent: [stock-upload](stock-upload.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. Why this exists and why it is a bridge job

Getty's ESP **API** preset (`esp-https`) needs a Partner API key; a website login
uploads through `esp.gettyimages.com/contribute`. The app cannot drive it —
first-party cookie on `gettyimages.com`, no CORS-enabled login or upload
endpoint — so the **loopback helper** (`tools/bridge/gettyweb/`) drives a real
browser.

## 2. Flow

1. The user saves the contributor **numeric ID** (Getty also takes an e-mail) and
   password in the vault, then presses **Test connection** or **Upload**.
2. `panelops.ts` probes `/health` (`gettyWeb.ready`, `gettyWeb.browser`); a
   missing browser or an old helper fails with a hint.
3. `runupload.ts` groups tasks **per icon** (JPEG + optional EPS) and passes one
   `sessionKey` per target.
4. `uploadBridgeGettyWeb` posts the bytes to `/getty-web/upload`; the helper
   stages them, signs in once, creates **one** batch and hands every file to the
   page's own uploader (`DOM.setFileInputFiles`).
5. Getty's uploader transfers; the helper waits until the batch page lists the
   names (or times out) and returns the batch id.
6. **Metadata:** per listed file it opens the row's editor, types the accepted
   title, description and keywords and saves — never overwriting Getty's IPTC/XMP
   prefill.
7. **Complete:** it clicks the batch's Complete/Submit control and accepts the
   confirmation, so the run ends submitted.
8. `/getty-web/close` shuts the browser and deletes the staged files; an idle
   session closes after five minutes. A visible window is only let go.

**Sign-in is typed, not assigned.** Each poll focuses the identifier (then the
password), inserts the saved text with real input events (`Input.insertText`) and
writes through `angular.element(el)` too: the page is `ng-app="SignInApp"` and
AngularJS ignores a plain `.value =`, which submits an empty form. It then presses
submit or Enter / `form.requestSubmit()`, takes a "sign in with password" option
on an SSO screen and returns to `/contribute`. A stalled run names the step and
summarizes the screen — `page "Sign in - ESP"; 2 input(s): text#username,
password#password; buttons: Sign in; angular-js` — never a value.

## 3. Background, headed, attach, profile and self-check

- Default: `chrome --headless=new` with a throwaway `--user-data-dir`, so a run
  never steals focus.
- `--getty-headed` (env `GETTY_WEB_HEADED=1`) shows the window — needed to watch
  a run or clear an interactive verification. A visible window is never killed: a
  failed run leaves the page up, with the reason saying so.
- `--getty-profile <folder>` (env `GETTY_WEB_PROFILE`) reuses one profile between
  runs, so a first sign-in's cookies survive and Getty stops treating each run as
  a new device. It holds Getty cookies; the helper never deletes it.
- `--getty-check` launches once, verifies the DevTools socket and exits with
  `browser:`/`launch:`/`devtools:`/`socket:` lines.
- `--getty-reset --getty-profile <folder>` ends the browser holding that folder
  (only that one), clears its stale locks, exits.
- `--getty-cdp` (= `GETTY_WEB_CDP`) attaches to a browser started with
  `--remote-debugging-port=9222` (loopback only).
- `GETTY_WEB_BROWSER` overrides the executable, `GETTY_WEB_UPLOAD_TIMEOUT_MS` the
  180 s wait.

**One profile, one browser — freed by the helper.** A browser answering on the
folder's port is attached to. A locked folder without a port means a leftover
window owns it, so the helper ends the browsers whose command line carries that
exact `--user-data-dir`, clears the stale locks and launches again — no manual
"close every window" step, no other browser touched. Only a failed reset stops the
run, naming the folder. Stale `DevToolsActivePort` files go first and every port
is verified over HTTP. Closing kills the browser tree; a visible window is only let
go, and its throwaway profile goes when Chrome exits.

## 4. What is sent

- One JPEG per icon plus its matching-stem EPS; SVG, PNG, ZIP are refused before
  the browser starts.
- Title, description and keywords travel inside the exported JPEG/EPS
  (IPTC/XMP/RDF) *and* as a `metadata` field, so the helper can type them where an
  editor exists (an empty editor gets the value, a prefilled one is left alone).
  Only `accepted` icons are sent (`gettyWebMetadataOf`), capped (title 200,
  description 2000, keywords 49 × 64, deduped). The **Title + description** copy
  still applies to the uploaded copy.
- Batch name `IconSplitter <UTC date> (<n> icons)`; submission type
  `iStock creative illustration`. Completion is attempted (`complete: true`) and
  reported as `completed`/`completion`; `GETTY_WEB_COMPLETE=0` stops after upload.

## 5. Page contract and failure codes

`driver.mjs` keeps each DOM decision self-contained (serialized with a prelude).
The prelude declares its own constants and each step runs inside an IIFE, so it
can be re-injected without redeclaring globals. A helper that named a module
constant once arrived as a bare `hidden,checkbox,…` list.
Captured Batches handles — `create-batch-button`, the dialog
(`[role=dialog][aria-labelledby=create-batch-dialog]` or `data-cy`),
`create-batch-submission-type` (MUI: mousedown, portal `role=listbox`),
`submission_name`, `event_id`, `create-batch-confirm-button`,
the contribution uploader `input[type="file"][data-cy="upload-button-file-input"]`,
batch id from `/contribute/batches/<id>` — and the wait-before-click rules (nothing
is clicked twice) are in [selectors/stock-upload](../selectors/stock-upload.md).

Sign-in has no captured handles, so it matches behaviour: `fillLoginForm`,
`focusLoginField`, `inspectSignIn`, `choosePasswordOption`, `submitLogin`; the
identifier is the visible username/account input (else the first text input beside
the password), the submit the form's `[type=submit]` or a control labelled
`Sign in|Log in|Continue|Next|Submit`, else Enter / `form.requestSubmit()`.
Disabled fields stay candidates.

Codes map to HTTP: `bad-request` 400 (config, host, file rules), `auth` 401
(rejected sign-in, signed out mid-run), `browser` 503 (no executable, launch
failure, busy profile, refused socket, unreachable `GETTY_WEB_CDP`), `timeout` 504
(no batch page / names missing / control never ready), `cancelled` 499, `page` 502
(selector not found). A refused socket names its port and says to retry (the
helper frees its own folder). Reasons are scrubbed of identifier and password.

## 6. Honest limits

- Built against captured markup plus a local helper, **not** a live account:
  selector drift is a `page` failure naming the step. Only the hidden
  contribution uploader is targeted: release inputs are never used, so a missing
  uploader fails instead of attaching to the wrong control.
- Per-file status scrapes the pipeline chips: `namesSeen` means Getty listed the
  file, not accepted it.
- An interrupted run can leave a batch short; a duplicate is the only recovery.
- Arkose/funCaptcha **cannot** be automated: solve it once headed with
  `--getty-profile`, then runs reuse the cookie. The fraud script is context only
  (`inspectSignIn().arkose`); typing and the Angular bridge are proven against a
  fake CDP and a DOM, not the live page.
- The helper types the saved identifier, guessing nothing.
- Metadata editors and Complete use **label keywords** (`title|headline`,
  `description|caption`, `keyword|tags`; `Save|Apply|Done`; `Complete|Submit|
  Finish`) and row proximity — guesses **not** seen live. A missing editor is
  reported per file (`row-not-found`, `filled-unsaved`, `embedded-only`); a
  missing Complete control fails as `page`.
- `completed: true` means the control was clicked and confirmed, not that Getty
  passed the files. An incomplete run says `files uploaded but the batch was not
  completed — submit it on the Getty contributor page`.

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
