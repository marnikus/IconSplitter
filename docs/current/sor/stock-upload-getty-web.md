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
4. **The run is N batches of at most 100 icons** (`planGettyWebBatches`,
   `GETTY_WEB_MAX_BATCH_ICONS = 100`, helper `MAX_ICONS = 100`). One icon is one
   upload — its JPEG plus its optional matching EPS — because Getty lists a pair
   once, under the EPS name; so 100 pairs (up to 200 physical files) are one
   batch and 101 icons are two. The pair is the chunk unit, so it can never be
   split. Batch names carry their place: `IconSplitter 2026-10-30 2/3 (100 icons)`
   (`gettyWebBatchName`; a single-batch run keeps the plain name, 60-char cap).
5. `/getty-web/upload` is called **once per batch** with `newBatch: true`: the
   helper stages that chunk, signs in once for the whole run, navigates back to
   the contributor page, creates the batch (`session.startBatch` resets the batch
   id, the expected names and the counts of the previous one) and hands its files
   to the uploader in one `DOM.setFileInputFiles`; stray dialogs (one blocks
   Getty's uploader) are dismissed first.
6. Getty's uploader transfers. **If nothing new appears for 30 s** the helper
   reloads the batch page and re-attaches only the missing files (twice, then it
   fails honestly); a read that times out is that same stall, retried, not a
   socket error. It waits until every file is listed, then until each card proves
   its outcome: **Getty's `pending-icon` "Ready to submit"** is the final
   proof, a **thumbnail** the earlier one (a validated card counts before its
   picture renders), `invalid-file-media` ("Upload failed") is not — a listed row
   proves nothing, and a card with neither proof fails the wait (300 s). A
   rejected file is named with Getty's id. `GET /getty-web/progress` feeds the
   live counts, so **the bar moves with each thumbnail and validated card**
   (1 s poll).
7. **Metadata:** per contribution it selects the card by stem (clicking twice if
   Getty drops the first), waits for the drawer to unlock (disabled fields drop
   typed text), types title and description and writes **today's date** into Date
   Created as Getty renders it — `MM/DD/YYYY 00:00:00 +0000`.
   Prefilled prose is kept, the date always replaced, but **tags are never
   touched**: keywords Getty lists are left alone and only the keyword field ever
   gets Enter. Every drawer saved, it selects **all** cards and presses **Save
   metadata** once (`bulkSave`; nothing is claimed if nothing could be selected).
   **Then it waits for the icons, not the thumbnails:** every card must show `data-cy="pending-icon"` /
   `aria-label="Ready to submit"` before the run is done. A card still showing
   `not-ready-icon` gets **Save metadata pressed again after 30 s** (twice at
   most) and only the not-ready files are re-checked; one that stays unvalidated
   is named and the run does not claim success (`timeout`, "Ready to submit" in
   the reason). Report `readiness` says `ok`, `notReady`, `resaves`.
8. **Complete each batch, then start the next:** after the batch's last card
   carries "Ready to submit" the run posts `/getty-web/finish` **for that batch
   only**. It refuses while a contribution of *that* batch is missing or says
   "Upload failed", naming what is wrong; a refused finish leaves the batch open
   and is reported with its reason, and nothing is claimed uploaded. **A page
   with no Complete/Submit control at all** is not an error: every card carrying
   "Ready to submit" *is* the finished state (`ok: true`, `ready: true`,
   `completed: false`, log `batch-ready`). Only once the batch is closed does the
   next one get created — in the same browser session, never a second sign-in.
9. **The re-upload list:** an icon whose card showed no thumbnail, was never
   listed, or read "Upload failed" is queued and retried **exactly once**
   (`GETTY_WEB_MAX_ATTEMPTS = 2`). Queued icons fill the remaining room of a later
   primary batch (`100 −` its icons), so a 250-icon run `[100, 100, 50]` can carry
   its rejections in batch 3; whatever is left becomes the run's final
   `… retry 1/1 (7 icons)` batch(es). Only a terminal outcome is written to the
   row: an icon accepted on retry is never first reported failed. A sign-out
   (`auth`), a missing/dead browser (`browser`) or a dead helper (`helper-down`)
   stops the run instead — another batch cannot fix those — and every icon the
   run never reached is reported failed with that reason.
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
- A failed `/getty-web/upload` answers `accepted`/`failed`/`seen` besides its
  code and reason (`failurePayload`): the names the page had already taken,
  rejected or listed, so a timed-out chunk is never re-sent whole.

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
  `stockupload_getty_web` (grouping, one batch per chunk, retry folding, the
  two-attempt cap, a sign-out stopping the run, cancel at a boundary, no creds).
