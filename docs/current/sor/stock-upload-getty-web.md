# Getty Images web upload (`getty-web`) — background browser automation

Parent: [stock-upload](stock-upload.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. Why this exists and why it is a bridge job

Getty's ESP **API** preset (`esp-https`) needs a Partner API key; the website
login (`esp.gettyimages.com/contribute`) cannot be driven from the app (no
CORS-enabled login), so the **loopback helper** (`tools/bridge/gettyweb/`) drives
a real browser.

## 2. Flow

1. The contributor **numeric ID** (or e-mail) and password are saved in the vault,
   then **Test connection** / **Upload**.
2. `panelops.ts` probes `/health` (`gettyWeb.ready`, `gettyWeb.browser`); a missing
   browser or old helper fails with a hint.
3. `runupload.ts` groups tasks **per icon** — a JPEG/EPS pair is **one**
   contribution, by **stem** — with one `sessionKey` per target;
   `uploadGettyWebRun` posts every icon together.
4. `/getty-web/upload` stages the run (`icons: [{files, metadata}]`, up to 200),
   signs in once, creates **one** batch and hands **all** files to the uploader in
   one `DOM.setFileInputFiles`; stray dialogs are dismissed first.
5. Getty transfers. **30 s without progress** reloads the page and re-attaches the
   missing files (twice, then fails honestly); a timed-out read is that stall. It
   waits until every file is listed, then for each card's **picture** — the
   metadata step starts there, because Getty shows the chip only **after** the
   save. `invalid-file-media` ("Upload failed") is a rejection named with Getty's
   id; a file with neither picture nor chip after 300 s is reported, not claimed.
   `GET /getty-web/progress` feeds the live counts (1 s poll).
6. **Metadata:** per contribution it clicks the card by stem (again if Getty drops
   the click), waits for the drawer to unlock (disabled fields drop typed text),
   types title/description and **today's date** as Getty renders it
   (`MM/DD/YYYY 00:00:00 +0000`) — prefilled prose kept, date replaced, **tags
   never touched**. Then it selects **all** cards and presses **Save metadata**
   once (`bulkSave`; nothing claimed if nothing was selected).
7. **Verification:** every card must show `data-cy="pending-icon"` /
   `aria-label="Ready to submit"`, and only those names are `accepted`. A card
   still on `not-ready-icon` is **pursued**: after 30 s its drawer is **re-filled**
   (a pass that could not open it left the metadata untyped) and the grid saved
   again — twice at most — and each card that turns ready **extends the window**
   (capped at 2× the 75 s budget, inside `uploadTimeoutFor`), so the last file gets
   a real chance. What stays unvalidated is named in a partial report (`accepted`,
   `failed`, `pending`, `verified`, `outcomes`), never a blanket failure; a page
   with no cards is `page` (unreadable ≠ pass).
8. **Complete once:** after the last icon the run posts `/getty-web/finish`. It
   refuses (inline tail too) while a contribution is missing **or says "Upload
   failed"**, then waits (bounded) for Getty to enable Complete, clicks it and
   accepts the confirmation. **No Complete/Submit control at all** is not an
   error: every card carrying "Ready to submit" *is* finished (`ok`, `ready: true`,
   `completed: false`, log `batch-ready`). Only a card that never validates, or no
   cards at all, is a refusal.
9. **Retry in place:** a run leaving files `pending`/`unverified` keeps the batch
   open and hands the app `retry: {sessionKey, names}`; **Retry not-ready files**
   posts `/getty-web/retry` with just those names — same session, no new attach,
   drawers re-filled, grid saved, cards re-read. No session → 409 ("re-run these
   icons into a new batch"), never a silent second batch. `/getty-web/close` lets
   the browser go and deletes staged files; an idle session closes after 5 min.

**Sign-in is typed, not assigned.** Each poll focuses the identifier (then the
password), inserts the saved text with real input events (`Input.insertText`) and
writes through `angular.element(el)`: the page is `ng-app="SignInApp"` and
AngularJS ignores `.value =`. It presses submit or Enter, takes an SSO "sign in
with password" option and returns to `/contribute`; a stalled run names the step,
never a value.

## 3. Background, headed, attach, profile and self-check

- Default: `chrome --headless=new`, throwaway profile (never steals focus).
- `--getty-headed` (env `GETTY_WEB_HEADED=1`) shows the window; a visible window
  is never killed, so a failed run leaves it up.
- `--getty-profile <folder>` (env `GETTY_WEB_PROFILE`) remembers the sign-in: the
  browser is kept between runs, `--restore-last-session` revives a session-only
  login, and cookies are snapshotted into `iconsplitter-session.json` (0600,
  never logged) so a killed window still starts signed in.
- `--getty-check` prints `browser:`, `launch:`, `socket:`; `--getty-reset
  --getty-profile <folder>` ends that browser; `--getty-cdp` (= `GETTY_WEB_CDP`)
  attaches to one started with `--remote-debugging-port=9222`.
- `GETTY_WEB_BROWSER` overrides the executable; `GETTY_WEB_UPLOAD_TIMEOUT_MS`
  (180 s), `GETTY_WEB_READY_TIMEOUT_MS` (300 s) bound the waits.

**One profile, one browser.** A browser answering on the folder's port is attached
to; a locked folder without a port has a leftover window, so the helper ends the
browsers with that exact `--user-data-dir`, clears stale locks and relaunches.

## 4. What is sent

- One JPEG per icon plus its matching-stem EPS; SVG, PNG, ZIP are refused.
- Title, description and keywords travel inside the exported JPEG/EPS
  (IPTC/XMP/RDF) *and* as a `metadata` field. Only `accepted` icons are sent
  (`gettyWebMetadataOf`), capped (title 200, description 2000, keywords 49 × 64,
  deduped); the file's own tags are kept.
- Batch name `IconSplitter <UTC date> (<n> icons)`, type `iStock creative
  illustration`. Completion is attempted (`complete: true`) and reported as
  `completed`/`completion`/`ready`; `GETTY_WEB_COMPLETE=0` stops after upload.

## 5. Page contract and failure codes

`driver.mjs` keeps each DOM decision self-contained (own constants, each step in
an IIFE, so it can be re-injected); handles, cards, drawer and wait rules are in
[selectors/stock-upload](../selectors/stock-upload.md). Sign-in has no captured
handles: `fillLoginForm` … `submitLogin` match behaviour instead.

Codes map to HTTP: `bad-request` 400 (config, host, file rules, no open batch),
`auth` 401 (rejected sign-in, signed out mid-run), `browser` 503 (no executable,
launch failure, busy profile, refused socket), `timeout` 504 (control never ready
/ a file absent or unvalidated at `finish`), `cancelled` 499, `page` 502 (selector
not found). A refused socket names its port; reasons never carry credentials. `/getty-web/upload` and
`/getty-web/retry` answer **200** whenever the page was read, even partially:
`accepted`, `failed` (with Getty's id), `pending`, `outcomes` (per-card
`pending|arrived|ready|failed`), `verified`, `partial`, `batchNote`, and
`ready` only when every card carries the chip and nothing is open.

## 6. Honest limits

- Built against captured markup plus a local helper, **not** a live account:
  drift is a `page` failure naming the step.
- A thumbnail proves nothing — Getty renders one for files it rejects; only the
  "Ready to submit" icon says a file was uploaded.
- Arkose/funCaptcha **cannot** be automated: solve it once headed (it then lives
  in the profile); typing is proven against a fake CDP.
- Metadata editors and Complete use **label keywords** and `data-cy` — guesses
  **not** seen live; a missing one is reported.
- `completed: true` means the control was clicked, not that Getty took them;
  `ready: true` means every card showed Getty's validation icon **and** nothing is
  pending (the run's own success condition when there is no control).
- A retry cannot rescue a closed session: it says so; those icons need a new run.

## 7. Invariants and tests

- Credentials live only in the vault ([I-81](invariants/upload.md#i-81)), go only
  to the loopback helper, and are never logged or echoed.
- Only `https://<…>.gettyimages.com` contributor paths are contacted; `..`, query
  strings and non-GETTY hosts are refused (`contributeUrlOf`). Staged files get
  sanitized names and are deleted on close.
- Tests (`tests/`): `getty_web_driver` (page steps, per-card truth),
  `getty_web_signin` (typing order, SSO, reasons), `getty_web_browser` (locks,
  launch, reset, stale port, kept window), `getty_web_batch` (dialog, batch id,
  uploader input, readiness settle), `getty_web_upload` (rules + client),
  `getty_web_cdp` (framing, prelude), `bridge_getty_web` (routes, partial payload,
  retry 409), `getty_web_finalize` (metadata, re-fill, partial reports),
  `getty_retry` (retry reading + rows), `stockupload_getty_web` (grouping, partial
  summary), `stockupload_progress_model`/-`_ui` (bar contract).
