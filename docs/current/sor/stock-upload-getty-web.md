# Getty Images web upload (`getty-web`) — background browser automation

Parent: [stock-upload](stock-upload.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. Why this exists and why it is a bridge job

Getty's ESP **API** preset (`esp-https`) needs a Partner API key Getty provisions
per contributor; anyone with only a website login can still upload through
`esp.gettyimages.com/contribute`. The app cannot drive it: the session is a
first-party cookie on `gettyimages.com`, the app runs on `file://`/`localhost`,
and no CORS-enabled login or upload endpoint exists. So the **loopback helper**
(`tools/bridge/gettyweb/`) drives a real Chrome/Edge here.

## 2. Flow

1. The user saves the contributor **e-mail or numeric contributor ID** plus the
   password in the local vault and presses **Test connection** or **Upload**.
   Getty takes either identifier in one field, so what is saved is typed there.
2. `panelops.ts` probes `/health` (`gettyWeb.ready`, `gettyWeb.browser`); a
   missing browser or older helper fails the run with a fix hint.
3. `runupload.ts` groups tasks **per icon** (JPEG + optional matching EPS), the
   same rule as ESP, and passes one `sessionKey` for the whole target.
4. `uploadBridgeGettyWeb` posts the bytes to `/getty-web/upload`; the helper
   stages them in a temp folder, signs in (once per session), creates **one**
   batch, and hands every staged file to the page's own file input with
   `DOM.setFileInputFiles`.
5. Getty's uploader does the transfer; the helper waits for the batch page to
   list the file names (or times out) and returns the batch id.
6. **Metadata:** per listed file it opens the row's editor, types the accepted
   title, description and keywords, and saves — never overwriting values Getty
   prefilled from the file's embedded XMP/IPTC.
7. **Complete:** it clicks the batch's Complete/Submit control and accepts the
   confirmation dialog, so the run ends submitted with no manual click.
8. `/getty-web/close` shuts the browser and deletes the staged files when the
   target finishes; an idle session closes after five minutes.

One session = one sign-in = one batch; nothing is reused across runs, except the
optional profile folder in §3.

**Sign-in is typed, not assigned.** Each poll focuses the identifier (then the
password on the next screen) and inserts the saved text with real input events
(`Input.insertText`), also writing through `angular.element(el)`: the ESP
sign-in is `ng-app="SignInApp"` and AngularJS ignores a plain `.value =`, which
is how a filled form submits empty. It then presses the form's submit control or
Enter / `form.requestSubmit()`, takes a "sign in with password" option on an
SSO/phone screen, and returns to `/contribute` when sign-in lands elsewhere. A
stalled run names the step (challenge, unsent form, identifier step, rejected
password) and summarizes the screen — `page "Sign in - ESP"; 2 input(s):
text#username, password#password; buttons: Sign in; angular-js` — never a value.

## 3. Background, headed, attach and profile modes

- Default: `chrome --headless=new` with a throwaway `--user-data-dir`, so an
  upload runs in the background without stealing focus.
- `run_ftp_bridge.bat --getty-headed` (env `GETTY_WEB_HEADED=1`) shows the
  window — needed to watch a run or to clear an interactive verification.
- `run_ftp_bridge.bat --getty-profile <folder>` (env `GETTY_WEB_PROFILE`) reuses
  one profile between runs, so a first sign-in's cookies survive and Getty stops
  treating each run as a new device. That folder holds Getty cookies on this
  machine; the helper never deletes it.
- `--getty-cdp http://127.0.0.1:9222` (= `GETTY_WEB_CDP`) attaches to a browser
  started with `--remote-debugging-port=9222` (loopback only).
- `GETTY_WEB_BROWSER` overrides the executable; `GETTY_WEB_UPLOAD_TIMEOUT_MS`
  overrides the 180 s per-icon wait.

## 4. What is sent

- Exactly one JPEG per icon plus its matching-stem EPS when selected; SVG, PNG
  and ZIP are refused before the browser starts.
- Title, description and keywords also travel inside the exported JPEG/EPS
  (IPTC/XMP/RDF); the runner sends the same accepted text as a separate `metadata`
  field so the helper can type it where an editor exists — an empty editor gets
  the value, a prefilled one is left alone. The optional in-memory **Title +
  description** copy still applies to the uploaded copy.
- Metadata is sent only for `accepted` icons (`gettyWebMetadataOf`), trimmed and
  capped (title 200, description 2000, keywords 49 × 64 chars, deduped).
- Batch name `IconSplitter <UTC date> (<n> icons)`; submission type
  `iStock creative illustration` — fixed by `gettyweb.ts`/`runupload.ts`.
- Completion is attempted (`complete: true`) and reported as
  `completed`/`completion`. `GETTY_WEB_COMPLETE=0` stops after the upload.

## 5. Page contract and failure codes

`driver.mjs` keeps every DOM decision self-contained, serialized into the page
with a helper prelude. Captured Batches handles: `[data-cy="create-batch-button"]`,
`[data-cy="create-batch-dialog"]`, `[data-cy="create-batch-submission-type"]` +
`role=option`, `input[name="submission_name"]`, `input[name="event_id"]`,
`[data-cy="create-batch-confirm-button"]`, `input[type="file"]`, batch id from
`/contribute/batches/<id>`.

Sign-in has no captured handles, so it matches behaviour: steps are
`fillLoginForm`, `focusLoginField`, `inspectSignIn`, `choosePasswordOption`,
`submitLogin`; the identifier is the visible e-mail/username/account input (else
the first text input beside the password field), the submit is the form's
`[type=submit]` or a control labelled `Sign in|Log in|Continue|Next|Submit`, with
Enter and `form.requestSubmit()` as fallback. Disabled fields stay candidates
(frameworks enable them after hydration). `signInFailure()` turns what the page
showed into the reason.

Failure codes map to HTTP: `bad-request` 400 (config, host, file rules), `auth`
401 (sign-in rejected or signed out mid-run), `browser` 503 (no executable,
launch failure, unreachable `GETTY_WEB_CDP`), `timeout` 504 (no batch page / file
names not listed), `cancelled` 499, `page` 502 (selector not found). Every reason
is scrubbed of the saved identifier and password.

## 6. Honest limits

- Built against captured Batches/Create Batch markup plus a local helper;
  **not** a live Getty account. Selector drift is a `page` failure with the step
  named, never a silent half-upload.
- The batch-detail upload input is matched generically (`input[type="file"]`);
  its markup was not captured.
- Per-file status is best-effort scraping of the pipeline chips; a `namesSeen`
  hit means Getty listed the file, not that it was accepted.
- An interrupted run can leave a batch short of icons; a duplicate batch is the
  only automatic recovery.
- Getty runs Arkose/funCaptcha fraud detection on its sign-in. A human check
  **cannot** be automated by design: solve it once in the headed window with
  `--getty-profile`, then later runs reuse that cookie. The fraud script sits on
  every sign-in page, so it is only context (`inspectSignIn().arkose`); a failure
  becomes "interactive check" on captcha wording or a 2-factor request alone.
- Typing with real key events and the Angular bridge is proven against fake CDP
  and a DOM, not the live page; the failure summary is what pins down a mismatch.
- The helper types the saved string into the identifier field and guesses
  nothing; a saved e-mail on an ID-only account fails on the identifier step.
- Metadata editors and the Complete control use **label keywords**
  (`title|headline`, `description|caption`, `keyword|tags`; `Save|Apply|Done`;
  `Complete|Submit|Finish`) plus row proximity — guesses **not** seen live. A
  missing editor is reported per file (`row-not-found`, `filled-unsaved`,
  `embedded-only`); a missing Complete control fails with `page` + the step.
- `completed: true` means the control was clicked and confirmed, not that Getty
  passed the files. A run that uploads without completing says `files uploaded
  but the batch was not completed — submit it on the Getty contributor page`.

## 7. Invariants and tests

- Credentials live only in the local vault ([I-81](invariants/upload.md#i-81)),
  go only to the loopback helper, and are never logged or echoed.
- Only `https://<…>.gettyimages.com` contributor paths are contacted; `..`,
  query strings and non-GETTY hosts are refused (`contributeUrlOf`).
- The helper stages files under a temp folder with sanitized leaf names and
  deletes them on close.
- Tests: `getty_web_driver` (page steps in a DOM), `getty_web_signin` (typing
  order, SSO choice, return to `/contribute`, reasons), `getty_web_upload`
  (rules + client), `getty_web_cdp` (framing), `bridge_getty_web` (spawned
  routes, `--getty-headed`, profile), `getty_web_finalize` (metadata + complete,
  opt-out), `stockupload_getty_web` (grouping, cancel, no creds) — all under
  `tests/`.
