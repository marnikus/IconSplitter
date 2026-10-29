# Getty Images web upload (`getty-web`) — background browser automation

Parent: [stock-upload](stock-upload.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. Why this exists and why it is a bridge job

Getty's ESP **API** preset (`esp-https`) needs a Partner API key that Getty
provisions per contributor. Contributors who only have a website login can still
upload through the contributor site (`esp.gettyimages.com/contribute`): sign in,
**Create Batch**, then add files.

The browser app cannot do that itself: the Getty session is a first-party cookie
on `gettyimages.com`, the app runs on `file://`/`localhost`, and the site exposes
no CORS-enabled login or upload endpoint. Cross-origin scripting would either
fail or require the app to impersonate the site. So the **loopback helper**
(`tools/bridge/gettyweb/`) drives a real Chrome/Edge it launches on the same
machine, and the app talks to it on `127.0.0.1` like every other stock transport.

## 2. Flow

1. The user saves the Getty contributor e-mail + password in the local vault
   (same card and store as every other stock preset) and presses **Test
   connection** or **Upload**.
2. `panelops.ts` probes `/health` (`gettyWeb.ready`, `gettyWeb.browser`) before
   anything is sent; a missing browser or an older helper fails the run with a
   fix hint.
3. `runupload.ts` groups tasks **per icon** (JPEG + optional matching EPS), the
   same grouping rule as ESP, and passes one `sessionKey` for the whole target.
4. `uploadBridgeGettyWeb` posts the bytes to `/getty-web/upload`; the helper
   stages them in a private temp folder, signs in (once per session), creates
   **one** batch, and hands every staged file to the page's own file input with
   `DOM.setFileInputFiles`.
5. Getty's own uploader performs the transfer. The helper waits until the batch
   page lists the file names (or the wait times out) and returns the batch id.
6. **Metadata:** for every listed file the helper opens the row's metadata
   editor, types the accepted title, description and keywords that travelled in
   the upload payload, and saves. Fields Getty already prefilled from the file's
   embedded XMP/IPTC are never overwritten.
7. **Complete:** the helper then clicks the batch's Complete/Submit control and
   accepts its confirmation dialog, so the run ends with the batch submitted
   instead of waiting for a manual click.
8. `/getty-web/close` shuts the browser and deletes the staged files when the
   target finishes; an idle session is closed after five minutes.

One session = one sign-in = one batch. A second target or a second run signs in
again; nothing is reused across runs.

## 3. Background, headed and attach modes

- Default: `chrome --headless=new` with a throwaway `--user-data-dir`, so an
  upload runs in the background without stealing focus.
- `GETTY_WEB_HEADED=1` (helper env) shows the window — needed to watch a run or
  to clear an interactive verification Getty may insert.
- `GETTY_WEB_CDP=http://127.0.0.1:9222` attaches to a browser the user already
  started with `--remote-debugging-port=9222` (loopback only; any other host is
  refused).
- `GETTY_WEB_BROWSER` overrides the executable; `GETTY_WEB_UPLOAD_TIMEOUT_MS`
  overrides the 180 s per-icon wait.

## 4. What is sent

- Exactly one JPEG per icon plus its matching-stem EPS when selected; SVG, PNG
  and ZIP are refused before the browser starts.
- Title, description and keywords also travel inside the exported JPEG/EPS
  (IPTC/XMP/RDF) from `export/`, and the runner sends the same accepted text as a
  separate `metadata` field so the helper can type it where an editable editor
  exists. Empty editors get the value; a prefilled editor is left alone. The
  optional in-memory **Title + description** copy still applies to the uploaded
  copy.
- Metadata is only sent for icons whose review state is `accepted`
  (`gettyWebMetadataOf`), trimmed and capped (title 200, description 2000,
  keywords 49 × 64 chars); keywords are deduped case-insensitively.
- Batch name: `IconSplitter <UTC date> (<n> icons)`; submission type:
  `iStock creative illustration` — both fixed by `gettyweb.ts`/`runupload.ts`.
- Submission is attempted automatically (`complete: true`): clicking Complete is
  best-effort and reports `completed`/`completion` so the panel can tell the user
  whether the batch was actually submitted. Set `GETTY_WEB_COMPLETE=0` on the
  helper to stop after the upload and leave the batch for manual review.

## 5. Page contract and failure codes

`driver.mjs` holds every DOM decision as a self-contained function, serialized
into the page with a helper prelude. Selectors come from the captured Batches
page: `[data-cy="create-batch-button"]`, `[data-cy="create-batch-dialog"]`,
`[data-cy="create-batch-submission-type"]` + `role=option`,
`input[name="submission_name"]`, `input[name="event_id"]`,
`[data-cy="create-batch-confirm-button"]`, `input[type="file"]`, and the batch
id in `/contribute/batches/<id>`.

Failure codes map to HTTP: `bad-request` 400 (config, host, file rules),
`auth` 401 (sign-in rejected or signed out mid-run), `browser` 503 (no
executable, launch failure, unreachable `GETTY_WEB_CDP`), `timeout` 504 (no
batch page / file names not listed), `cancelled` 499, `page` 502 (selector not
found). Every reason is scrubbed of the saved e-mail and password.

## 6. Honest limits

- Verified against the captured Batches page and Create Batch dialog markup and
  with a local helper; **not** against a live Getty account. Selector drift on
  Getty's SPA shows up as a `page` failure with the step named, not as a silent
  half-upload.
- The batch-detail upload input is matched generically (`input[type="file"]`);
  its exact markup was not part of the capture.
- Per-file status is best-effort text scraping of the pipeline chips; a
  `namesSeen` hit means Getty listed the file, not that it was accepted.
- An interrupted run can leave a batch with fewer icons than planned; creating a
  duplicate batch is the only automatic recovery.
- Login may require an interactive challenge; that is a `auth` failure with the
  headed-mode hint.
- Metadata editors and the Complete control are matched by **label keywords**
  (`title|headline`, `description|caption`, `keyword|tags`; `Save|Save and close|
  Apply|Done`; `Complete|Submit|Finish`) plus row proximity — generic guesses
  that were **not** seen live. A missing editor is reported per file
  (`row-not-found`, `filled-unsaved`, `embedded-only`) and a missing Complete
  control fails the run with `page` + the step name instead of submitting
  something unexpected.
- The helper never claims the outcome of Getty's review: `completed: true` means
  the control was clicked and the dialog accepted, not that the files passed.
- When the helper uploads but does not complete (opt-out or older helper), the
  run summary says so — `files uploaded but the batch was not completed — submit
  it on the Getty contributor page` — instead of reporting a plain success.

## 7. Invariants and tests

- Credentials live only in the local vault ([I-81](invariants/upload.md#i-81)),
  are sent only to the loopback helper, and are never logged or echoed.
- Only `https://<…>.gettyimages.com` contributor paths are contacted; `..`,
  query strings and non-GETTY hosts are refused (`contributeUrlOf`).
- The helper stages files under a temp folder with sanitized leaf names and
  deletes it on close.
- Tests: `tests/getty_web_driver.test.ts` (real page steps in a DOM),
  `tests/getty_web_upload.test.ts` (rules + loopback client),
  `tests/getty_web_cdp.test.ts` (protocol framing with a stand-in socket),
  `tests/bridge_getty_web.test.ts` (spawned helper routes),
  `tests/getty_web_finalize.test.ts` (metadata fill + auto complete step order,
  embedded-only and opt-out paths), and `tests/stockupload_getty_web.test.ts`
  (runner grouping, cancellation, missing credentials).
