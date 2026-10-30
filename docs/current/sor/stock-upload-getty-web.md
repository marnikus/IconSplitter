# Getty Images web upload (`getty-web`) — background browser automation

Parent: [stock-upload](stock-upload.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. Why this exists and why it is a bridge job

Getty's ESP **API** preset (`esp-https`) needs a Partner API key; a website login
uploads through `esp.gettyimages.com/contribute`, which the app cannot drive (no
CORS-enabled login), so the **loopback helper** (`tools/bridge/gettyweb/`) drives
a real browser.

## 2. Flow

1. The user saves the contributor **numeric ID** (or e-mail) and password in the
   vault, then presses **Test connection** or **Upload**.
2. `panelops.ts` probes `/health` (`gettyWeb.ready`, `gettyWeb.browser`); a missing
   browser or old helper fails with a hint.
3. `runupload.ts` groups tasks **per icon** — a JPEG/EPS pair is **one**
   contribution, matched by **stem** — one `sessionKey` per target, and
   `uploadGettyWebRun` posts every icon together.
4. `/getty-web/upload` takes the run (`icons: [{files, metadata}]`, up to 200):
   the helper stages it, signs in once, creates **one** batch and hands **all**
   files to the uploader in one `DOM.setFileInputFiles`; a stray dialog (one
   blocks the uploader) is dismissed first.
5. Getty's uploader transfers. **If nothing new appears for 30 s** the helper
   reloads the batch page and re-attaches only the missing files (twice, then
   fails honestly); a timed-out read is that same stall, retried. It waits until
   every file is listed, then for each card's **picture** (or its
   `data-cy="pending-icon"` / `aria-label="Ready to submit"` chip) — that is when
   the metadata step starts, because Getty shows the chip **only after** a save.
   `invalid-file-media` ("Upload failed") is a rejection named with Getty's id; a
   file with neither after the bound (300 s) is reported, not claimed.
   `GET /getty-web/progress` feeds the counts (1 s poll): this phase counts
   **arrivals**, so the bar says "uploaded" and is never "complete".
6. **Metadata:** per contribution it selects the card by stem (twice if Getty
   drops the first click), waits for the drawer to unlock (disabled fields drop
   typed text), types title and description and writes **today's date** into Date
   Created as Getty renders it — `MM/DD/YYYY 00:00:00 +0000`. Prefilled prose is
   kept, the date always replaced, but **tags are never touched**: only the
   keyword field ever gets Enter. Every drawer saved, it selects **all** cards and
   presses **Save metadata** once (`bulkSave`; nothing claimed if nothing could be
   selected).
   **Then it verifies the icons:** every card must show `data-cy="pending-icon"` /
   `aria-label="Ready to submit"` before the run is done, and the bar's line
   climbs with them ("N of M file(s) ready to submit"). A card still showing
   `not-ready-icon` gets **Save metadata pressed again after 30 s** (twice at
   most) and only those files are re-checked. If the chip still does not come, the
   run **re-uploads that file** from its staged copy (`reattachFiles`), saves its
   metadata again and re-checks — a third save changes nothing, a second attach
   does. Only a file unvalidated after that is named (`timeout`). The verifying
   phase counts **chips**, so the bar reaches 100 % only when the batch is
   submittable. Report `readiness`: `ok`, `notReady`, `resaves`, `repairs`.
7. **Complete once:** after the last icon the run posts `/getty-web/finish`. It
   refuses (inline tail too) while a contribution is missing **or still says
   "Upload failed"** — after re-uploading the rejected files once, since a rejected
   card has no drawer to save — then waits (bounded) for Getty to enable Complete,
   clicks it and accepts the confirmation. **A page with no Complete/Submit control is not an error:** every
   card carrying "Ready to submit" *is* the finished state, so the answer is
   `ok: true`, `ready: true`, `completed: false` and the run logs `batch-ready`
   (info). Only a card that never validates, or a page with no cards, is a
   refusal, named. `accepted` is the chip list, so the app badges only what Getty
   validated.
8. `/getty-web/close` releases the browser, deletes staged files; an idle session
   closes after 5 min.

**Sign-in is typed, not assigned.** Each poll focuses the identifier (then the
password), inserts the saved text with real input events (`Input.insertText`) and
writes through `angular.element(el)`: the page is `ng-app="SignInApp"` and
AngularJS ignores `.value =`. It presses submit or Enter, takes an SSO "sign in
with password" option and lands on `/contribute`. A stalled run names the step.

## 3. Background, headed, attach, profile and self-check

- Default: `chrome --headless=new`, throwaway profile (never steals focus).
- `--getty-headed` (env `GETTY_WEB_HEADED=1`) shows the window; a visible window
  is never killed, so a failed run leaves it up.
- `--getty-profile <folder>` (env `GETTY_WEB_PROFILE`) remembers the sign-in: the
  browser is kept between runs (the next upload attaches; ten idle minutes close
  it), `--restore-last-session` revives a session-only login, and cookies
  are snapshotted into `iconsplitter-session.json` (0600, never logged) so a
  killed window starts signed in — only missing cookies are put back.
- `--getty-check` prints `browser:`, `launch:`, `socket:`; `--getty-reset
  --getty-profile <folder>` ends that browser; `--getty-cdp` (= `GETTY_WEB_CDP`)
  attaches to a browser started with `--remote-debugging-port=9222`.
- `GETTY_WEB_BROWSER` overrides the executable; `GETTY_WEB_UPLOAD_TIMEOUT_MS`
  (180 s), `GETTY_WEB_READY_TIMEOUT_MS` (300 s) bound the waits.

**One profile, one browser, freed by the helper.** A browser answering on the
folder's port is attached to; a locked folder without a port means a leftover
window owns it, so the helper ends the browsers carrying that exact
`--user-data-dir`, clears stale locks and relaunches — no "close every window"
step. Closing kills the tree, never a visible window.

## 4. What is sent

- One JPEG per icon plus its matching-stem EPS; SVG, PNG, ZIP are refused first.
- Title, description and keywords travel inside the exported JPEG/EPS
  (IPTC/XMP/RDF) *and* as a `metadata` field. Only `accepted` icons are sent
  (`gettyWebMetadataOf`), capped (title 200, description 2000, keywords 49 × 64,
  deduped); the file's own tags are kept.
- Batch name `IconSplitter <UTC date> (<n> icons)`, type `iStock creative
  illustration`. Completion is attempted (`complete: true`) and reported as
  `completed`/`completion`/`ready`; `GETTY_WEB_COMPLETE=0` stops after upload.

## 5. Page contract and failure codes

`driver.mjs` keeps each DOM decision self-contained (own constants, each step in
an IIFE, so it can be re-injected). Handles, cards, drawer and wait/dismiss rules
are in [selectors/stock-upload](../selectors/stock-upload.md). Sign-in has no
captured handles: `fillLoginForm`, `focusLoginField`, `inspectSignIn`,
`choosePasswordOption`, `submitLogin` match behaviour.

Codes map to HTTP: `bad-request` 400 (config, host, file rules, no open batch),
`auth` 401 (rejected sign-in, signed out mid-run), `browser` 503 (no executable,
launch failure, busy profile, refused socket), `timeout` 504 (no batch page / a
name missing / control never ready / a file absent or unvalidated at `finish`),
`cancelled` 499, `page` 502 (selector not found). Reasons never carry
credentials.

## 6. Honest limits

- Built against captured markup plus a local helper, **not** a live account:
  drift is a `page` failure naming the step.
- A picture proves nothing: Getty draws one for files it rejects and for cards it
  never validates, so cards left `not_ready_to_submit` fail those files by name.
- Arkose/funCaptcha **cannot** be automated: solve it once headed (it then lives
  in the profile). Typing is proven against a fake CDP.
- Editors and Complete use **label keywords**, `data-cy` and row proximity —
  guesses **not** seen live; a missing one is reported.
- `completed: true` means the control was clicked; `ready: true` means every card
  showed Getty's validation icon.

## 7. Invariants and tests

- Credentials live only in the vault ([I-81](invariants/upload.md#i-81)), go only
  to the loopback helper, and are never logged or echoed. Only
  `https://<…>.gettyimages.com` contributor paths are contacted (`..`, query
  strings and other hosts are refused by `contributeUrlOf`); staged files use
  sanitized names and are deleted on close.
- Tests (`tests/`): `getty_web_driver` (page steps, arrival vs ready),
  `getty_web_signin` (typing, SSO, reasons), `getty_web_browser` (locks, launch,
  reset, stale port), `getty_web_batch` (dialog, batch id, uploader, re-upload),
  `getty_web_upload` (rules + client), `getty_web_cdp` (framing, prelude),
  `bridge_getty_web` (routes, flags), `getty_web_finalize` (metadata, re-save,
  re-upload, complete), `stockupload_getty_web` (grouping, cancel, no creds).
