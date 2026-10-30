# Getty Images web upload (`getty-web`) — background browser automation

Parent: [stock-upload](stock-upload.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. Why this is a bridge job

Getty's ESP **API** preset (`esp-https`) needs a Partner key; a website login
uploads through `esp.gettyimages.com/contribute`, which the app cannot drive (no
CORS login), so the **loopback helper** (`tools/bridge/gettyweb/`) drives a real
browser.

## 2. Flow

1. The user saves the contributor **numeric ID** (or e-mail) and password in the
   vault, then presses **Test connection** or **Upload**; `panelops.ts` probes
   `/health` (`gettyWeb.ready`, `gettyWeb.browser`) and a missing browser or old
   helper fails with a hint.
3. `runupload.ts` groups tasks **per icon** — a JPEG/EPS pair is **one**
   contribution, matched by **stem** — one `sessionKey` per target, then hands the
   icons to `uploadGettyWebRun`.
4. **The run is N batches of at most 100 icons** (`planGettyWebBatches`,
   `GETTY_WEB_MAX_BATCH_ICONS = 100`, helper `MAX_ICONS = 100`): one icon is one
   upload — its JPEG plus its EPS — since Getty lists a pair once under the EPS
   name, so 100 pairs (200 files) are one batch and 101 icons are two. A batch
   also ends early once its bytes would cross `GETTY_WEB_MAX_BATCH_BYTES` (64 MB),
   so one request never outgrows the helper (`GETTY_WEB_MAX_BYTES`, 256 MB), which
   drains an oversized body and answers 413 rather than resetting. Names carry
   their place: `IconSplitter 2026-10-30 2/3 (100 icons)`, 60-char cap.
5. `/getty-web/upload` runs **once per batch** with `newBatch: true`: the helper
   stages that chunk, signs in once per run, returns to the contributor page,
   creates the batch (`session.startBatch` resets the last id, names and counts)
   and hands its files to the uploader in one `DOM.setFileInputFiles` after
   dismissing stray dialogs (one blocks the uploader).
6. Getty's uploader transfers. **If nothing new appears for 30 s** the helper
   reloads the page and re-attaches only the missing files (twice, then it fails
   honestly); a timed-out read is that stall, retried. It waits until every file
   is listed, then for each card's **picture** or its `pending-icon` "Ready to
   submit" chip — a thumbnail arms the metadata step, since the chip appears
   **only after** a save. `invalid-file-media` ("Upload failed") is a rejection
   named with Getty's id. `GET /getty-web/progress` (1 s poll) counts **arrivals**
   here, so the bar says "uploaded", never "complete".
7. **Metadata:** per contribution it selects the card by stem (twice if Getty
   drops the click), types title and description and writes **today's date** into
   Date Created as Getty renders it (`MM/DD/YYYY 00:00:00 +0000`). Prefilled prose
   stays, the date is always replaced, but **tags are never touched** (only the
   keyword field gets Enter). Every drawer saved, it selects **all** cards and
   presses **Save metadata** once (`bulkSave`).
   **Then it verifies:** every card must show `pending-icon` /
   `aria-label="Ready to submit"`, and the bar's line climbs with them. A card
   still showing `not-ready-icon` gets **Save metadata again after 30 s** (twice)
   with only those files re-checked; if the chip still does not come, the run
   **re-uploads that file from its staged copy** (`reattachFiles`) and re-checks —
   a third save changes nothing, a second attach does. A file still unvalidated is
   named (`timeout`); the verifying phase counts **chips**, so 100 % means
   submittable. `readiness`: `ok`, `notReady`, `resaves`, `repairs`.
8. **Complete each batch, then start the next:** after its last card carries
   "Ready to submit" the run posts `/getty-web/finish` **for that batch only**. It
   refuses, naming what is wrong, while one of *that* batch's contributions is
   missing or says "Upload failed" (after re-uploading the rejected files once),
   and a refused finish leaves the batch open. **A page with no Complete/Submit control is not an error:** every
   card carrying "Ready to submit" *is* the finished state (`ok: true`,
   `ready: true`, `completed: false`, log `batch-ready`). `accepted` is the chip
   list, so the app badges only what Getty validated. The next batch follows in
   the same browser session: no second sign-in.
9. **The re-upload list:** an icon whose card showed no thumbnail, was never
   listed or read "Upload failed" is queued and retried **exactly once**
   (`GETTY_WEB_MAX_ATTEMPTS = 2`). Queued icons fill a later batch's room, so a
   250-icon run carries rejections in batch 3; the rest becomes the final
   `… retry 1/1 (7 icons)` batch(es), and only a terminal outcome reaches the row.
   A sign-out (`auth`), dead browser or dead helper stops the run instead, and
   every unreached icon fails with that reason.
10. `/getty-web/close` releases the browser and deletes staged files; an idle
    session closes after 5 min, but one **with a request in flight is never
    swept** (`mayReleaseSession`): a 100-icon batch outlives five minutes.

## 3. Browser, profile and self-check

- Default `chrome --headless=new`, throwaway profile; `--getty-headed`
  (`GETTY_WEB_HEADED=1`) shows the window; a visible window is never killed.
- `--getty-profile <folder>` (`GETTY_WEB_PROFILE`) keeps the browser between runs
  so Getty's sign-in survives (ten idle minutes close it),
  `--restore-last-session` revives a session-only login, and cookies are kept in
  `iconsplitter-session.json` (0600, never logged) so a killed window starts
  signed in; only missing cookies are put back.
- `--getty-check` prints `browser:`, `launch:`, `socket:`; `--getty-reset
  --getty-profile <folder>` ends that browser; `--getty-cdp` (`GETTY_WEB_CDP`)
  attaches to `--remote-debugging-port=9222`. `GETTY_WEB_BROWSER` overrides the
  executable; `GETTY_WEB_UPLOAD_TIMEOUT_MS` (180 s),
  `GETTY_WEB_READY_TIMEOUT_MS` (300 s) bound the waits.

**One profile, one browser, freed by the helper.** A browser answering on the
folder's port is attached to; a locked folder without one is freed by ending its
browsers, clearing stale locks and relaunching.

## 4. What is sent

- One JPEG per icon plus its matching-stem EPS; SVG, PNG, ZIP are refused first.
- Title, description and keywords travel inside the JPEG/EPS (IPTC/XMP/RDF)
  *and* as a `metadata` field, capped (title 200, description 2000, keywords
  49 × 64, deduped); the file's tags are kept.
- Type `iStock creative illustration`; the run completes each batch via
  `/getty-web/finish` and reports `completed`/`completion`/`ready`;
  `GETTY_WEB_COMPLETE=0` stops after upload. A failed `/getty-web/upload` also
  answers `accepted`/`failed`/`notReady`/`seen` (`failurePayload`), so a timed-out
  chunk is never re-sent.

## 5. Page contract and failure codes

`driver.mjs` keeps each DOM decision self-contained (own constants, each step in
an IIFE, so it can be re-injected); handles, cards and drawer rules are in
[selectors/stock-upload](../selectors/stock-upload.md). Sign-in has no captured
handles: `fillLoginForm`/`inspectSignIn`/`submitLogin` match behaviour, and the
text is typed (`Input.insertText` plus `angular.element(el)`, since
`ng-app="SignInApp"` ignores `.value =`). Codes: `bad-request` 400, `auth` 401,
`browser` 503, `timeout` 504 (no batch page, a name missing, control never ready,
a file absent or unvalidated), `cancelled` 499, `page` 502. No credentials in a
reason.

## 6. Honest limits

- Built against captured markup plus a local helper, **not** a live account:
  drift is a `page` failure naming the step, and editor/Complete selectors are
  guesses (`data-cy`, label keywords) **not** seen live.
- A picture proves nothing: Getty draws one for rejected files and unvalidated
  cards, so a card left `not_ready_to_submit` fails that file by name.
- Arkose/funCaptcha **cannot** be automated: solve it once headed (it then lives
  in the profile); typing is proven against a fake CDP. `completed: true` means
  the control was clicked, `ready: true` that every card showed Getty's icon.

## 7. Invariants and tests

- Credentials live only in the vault ([I-81](invariants/upload.md#i-81)), go only
  to the loopback helper, and are never logged or echoed. Only
  `https://<…>.gettyimages.com` contributor paths are contacted (`..`, queries and
  other hosts are refused by `contributeUrlOf`); staged files use sanitized names,
  deleted on close.
- Tests (`tests/`): `getty_web_chunk` (the 100-icon and byte budgets, names),
  `getty_web_driver` (arrival vs ready), `getty_web_signin`, `getty_web_browser`
  (locks, launch, reset, kept window), `getty_web_batch` (dialog, batch id,
  uploader, re-upload), `getty_web_upload` (header, sizes, failure reasons),
  `getty_web_cdp`, `bridge_getty_web` (routes, flags, the 413 answer),
  `getty_web_finalize` (metadata, re-save, re-upload, complete),
  `stockupload_getty_web` (grouping, chunking, retry folding, sign-out, cancel,
  no creds).
