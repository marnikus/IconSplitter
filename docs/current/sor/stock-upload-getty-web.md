# Getty Images web upload (`getty-web`) — background browser automation

Parent: [stock-upload](stock-upload.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. Why this exists and why it is a bridge job

Getty's ESP **API** preset (`esp-https`) needs a Partner API key; a website login
uploads through `esp.gettyimages.com/contribute`, which the app cannot drive (no
CORS-enabled login), so the **loopback helper** (`tools/bridge/gettyweb/`) drives a
real browser.

## 2. Flow

1. The user saves the contributor **numeric ID** (or e-mail) and password in the
   vault, then presses **Test connection** or **Upload**.
2. `panelops.ts` probes `/health` (`gettyWeb.ready`, `gettyWeb.browser`); a missing
   browser or old helper fails with a hint.
3. `runupload.ts` groups tasks **per icon** — a JPEG/EPS pair is **one**
   contribution, matched by **stem** — with one `sessionKey` per target, then
   hands the ordered icons to `uploadGettyWebRun`.
4. That run is **N batches of at most 100 icons**, each batch crossing the
   loopback in **parts** of bounded bytes: the counting rule, the lifecycle, the
   byte budget and the re-upload list are
   [their own page](stock-upload-getty-web-batches.md). One icon (JPEG + its EPS)
   is one upload and is never split; no request is big enough to be dropped.
5. Each part is one `POST /getty-web/upload` (`newBatch` true only for the
   batch's first part); the helper signs in once for the whole run, stages that
   part and hands it to the uploader in one `DOM.setFileInputFiles`, after
   dismissing the dialogs that block it.
6. **Inside a batch:** the part's files transfer, every card must prove its
   outcome (a thumbnail, or Getty's "Ready to submit"), a stalled page is
   reloaded once, and each icon's metadata is typed before the batch is finished
   — the waits, the reload rule and the metadata order are in
   [the batch page](stock-upload-getty-web-batches.md#4-what-happens-inside-a-batch).
8. **Complete each batch, then start the next:** after the batch's last card
   carries "Ready to submit" the run posts `/getty-web/finish` **for that batch
   only**. It refuses while a contribution of *that* batch is missing or says
   "Upload failed", naming what is wrong; a refused finish leaves the batch open
   and claims nothing. **A page with no Complete/Submit control at all** is not
   an error: every card carrying "Ready to submit" *is* the finished state
   (`ok: true`, `ready: true`, `completed: false`, log `batch-ready`). Only once
   the batch is closed is the next one created — same session, no second sign-in.
9. **Icons Getty did not take are retried once** before they are reported
   (`GETTY_WEB_MAX_ATTEMPTS = 2`): [the re-upload list](stock-upload-getty-web-batches.md#2-the-re-upload-list).
   A sign-out (`auth`), a missing/dead browser (`browser`) or a dead helper
   (`helper-down`) stops the run instead — another batch cannot fix those — and
   every icon the run never reached is reported failed with that reason.
10. `/getty-web/close` lets the browser go and deletes staged files; an idle
   session closes after 5 min, but a session **with a request in flight is never
   swept** (`mayReleaseSession`): a 100-icon batch outlives five minutes.

**Sign-in is typed, not assigned.** Each poll focuses the identifier (then the
password), inserts the saved text with real input events (`Input.insertText`) and
writes through `angular.element(el)`: the page is `ng-app="SignInApp"` and
AngularJS ignores `.value =`. It presses submit or Enter, takes an SSO "sign in
with password" option and returns to `/contribute`. A stalled run names the step,
never a value.

## 3. Background, headed, attach, profile and self-check

- Default: `chrome --headless=new`, throwaway profile (never steals focus).
- `--getty-headed` (env `GETTY_WEB_HEADED=1`) shows the window; a visible window
  is never killed, so a failed run leaves it up.
- `--getty-profile <folder>` (env `GETTY_WEB_PROFILE`) remembers the sign-in: the
  browser is kept between runs (the next upload attaches; ten idle minutes close
  it politely), every close is a real `Browser.close`, `--restore-last-session`
  revives a session-only login, and cookies are snapshotted into
  `iconsplitter-session.json` there (mode 0600, never logged) so a killed window
  still starts signed in — only missing cookies are put back.
- `--getty-check` prints `browser:`, `launch:`, `socket:`; `--getty-reset
  --getty-profile <folder>` ends that browser; `--getty-cdp` (= `GETTY_WEB_CDP`)
  attaches to one started with `--remote-debugging-port=9222` (loopback only).
- `GETTY_WEB_BROWSER` overrides the executable; `GETTY_WEB_UPLOAD_TIMEOUT_MS`
  (180 s), `GETTY_WEB_READY_TIMEOUT_MS` (300 s) bound the waits.

**One profile, one browser — freed by the helper.** A browser answering on the
folder's port is attached to; a locked folder without a port means a leftover
window owns it, so the helper ends the browsers carrying that exact
`--user-data-dir`, clears stale locks and relaunches — no "close every window"
step, no other browser touched. Closing kills the tree, never a visible window.

## 4. What is sent

- One JPEG per icon plus its matching-stem EPS; SVG, PNG, ZIP are refused first.
- Title, description and keywords travel inside the exported JPEG/EPS
  (IPTC/XMP/RDF) *and* as a `metadata` field. Only `accepted` icons are sent
  (`gettyWebMetadataOf`), capped (title 200, description 2000, keywords 49 × 64,
  deduped); the file's own tags are kept.
- Type `iStock creative illustration`; every batch is named
  `IconSplitter <UTC date> [<i>/<n>|retry <i>/<n>] (<count> icons)`, capped at 60
  characters. Each batch is completed by the run through `/getty-web/finish` (a
  request never completes one itself: `complete: false`) and reported as
  `completed`/`completion`/`ready`; `GETTY_WEB_COMPLETE=0` stops after upload.
- A failed upload answers `accepted`/`failed`/`seen` besides its code and reason
  (`failurePayload`): what the page already took, rejected or listed, so a
  timed-out part is never re-sent whole.

## 5. Page contract and failure codes

`driver.mjs` keeps each DOM decision self-contained (own constants, each step in
an IIFE, so it can be re-injected). Batches handles, the
cards, the drawer and the wait/dismiss rules are in
[selectors/stock-upload](../selectors/stock-upload.md). Sign-in has no captured
handles: `fillLoginForm`, `focusLoginField`, `inspectSignIn`,
`choosePasswordOption`, `submitLogin` match behaviour instead.

Codes map to HTTP: `bad-request` 400 (config, host, file rules, no open batch),
`auth` 401 (rejected sign-in, signed out mid-run), `browser` 503 (no executable,
launch failure, busy profile, refused socket), `timeout` 504 (no batch page /
names missing / control never ready / a file absent or unvalidated at `finish`),
`cancelled` 499, `page` 502 (selector not found). A refused socket names its port
and says to retry; reasons never carry identifier or password.

## 6. Honest limits

- Built against captured markup plus a local helper, **not** a live account:
  drift is a `page` failure naming the step.
- A thumbnail means Getty took the file, not that it accepted it; only the
  "Ready to submit" icon says so.
- Arkose/funCaptcha **cannot** be automated: solve it once headed (it then lives
  in the profile). Typing is proven against a fake CDP; only the saved identifier
  is typed.
- Metadata editors and Complete use **label keywords**, `data-cy` and row
  proximity — guesses **not** seen live; a missing one is reported.
- `completed: true` means the control was clicked, not that Getty took them;
  `ready: true` means every card showed Getty's validation icon (the run's own
  success condition when there is no control).

## 7. Invariants and tests

- Credentials live only in the vault ([I-81](invariants/upload.md#i-81)), go only
  to the loopback helper, and are never logged or echoed.
- Only `https://<…>.gettyimages.com` contributor paths are contacted; `..`, query
  strings and non-GETTY hosts are refused (`contributeUrlOf`). Staged files use
  sanitized names and are deleted on close.
- Tests (`tests/`): `getty_web_chunk` (the 100-upload cap, chunk order, batch
  names/labels), `getty_web_driver` (page steps, ready icon),
  `getty_web_signin` (typing order, SSO, reasons), `getty_web_browser` (locks,
  launch, reset, stale port, kept window), `getty_web_batch` (dialog, batch id,
  uploader input, readiness settle), `getty_web_upload` (rules + client),
  `getty_web_cdp` (framing, prelude), `bridge_getty_web` (routes, helper flags),
  `getty_web_finalize` (metadata, readiness resave, complete),
  `stockupload_getty_web` (grouping, one batch per chunk, the parts of a batch,
  retry folding, the two-attempt cap, a sign-out stopping the run, cancel at a
  boundary, no creds).
