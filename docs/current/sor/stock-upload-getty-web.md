# Getty Images web upload (`getty-web`) — background browser automation

Parent: [stock-upload](stock-upload.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. Why this is a bridge job

Getty's ESP **API** preset (`esp-https`) needs a Partner key; a website login
uploads through `esp.gettyimages.com/contribute`, which the app cannot drive
(CORS), so the **loopback helper** (`tools/bridge/gettyweb/`) drives a real
browser.

## 2. Flow

1. The user saves the contributor **numeric ID** (or e-mail) and password in the
   vault, then presses **Test connection** or **Upload**; `panelops.ts` probes
   `/health` (`ready`, `browser`, `maxBytes`): a missing browser or an old helper
   fails with a hint.
2. `runupload.ts` groups tasks **per icon** — a JPEG/EPS pair is **one**
   contribution, matched by **stem** — one `sessionKey` per target, then hands them to
   `uploadGettyWebRun`.
3. **The run is N batches of ≤ 100 icons** (`planGettyWebBatches`, mirrored by
   the helper's `MAX_ICONS`): one icon is one upload (JPEG plus EPS) — Getty lists
   a pair once under the EPS name — so 100 pairs (200 files) are one batch, 101
   icons two. A batch also ends early at the request budget:
   `gettyWeb.maxBytes` (`GETTY_WEB_MAX_BYTES`, 256 MB) capped at 64 MB here, or
   16 MB for a helper that reports none. A batch name is the date, place and size
   — `2026-10-30 2/3 (100 icons)` — no product name. The opt-in `Random batches`
   (`stock-random-batches`, persisted) draws each batch from the icons not yet
   sent: `randomBatchOrder` shuffles once, so every icon still goes once.
4. `/getty-web/upload` runs **once per batch** with `newBatch: true`: the helper
   stages that chunk, signs in once per run, returns to the contributor page,
   creates the batch (`session.startBatch` resets its id, names and counts)
   and hands its files to the uploader in one `DOM.setFileInputFiles`; one stray
   dialog blocks it, so dialogs are dismissed first. The per-icon manifest is the
   **body's tail** (`manifestBytes` in the header), never a header: Node answers
   431 above 16 KB, before any route runs (I-83).
5. An oversized body is drained and answered 413; a request never answered is
   retried **in halves** (twice), since it carried nothing. **If nothing new appears for 30 s** the helper
   reloads the page and re-attaches the missing files; a timed-out read, or a
   listed card with no **picture** for that window, is the same stall (per batch,
   twice, then it fails honestly). It waits until every file is listed, then for
   each card's picture or `pending-icon` chip — a thumbnail arms the metadata
   step; the chip appears **only after** a save. `invalid-file-media` ("Upload
   failed") is a rejection named with Getty's id. `GET /getty-web/progress`
   (1 s poll) counts **arrivals**, so the bar says "uploaded", never "complete".
6. **Metadata, timestamps and verification:** every pictured contribution's
   drawer gets title, description and **today's Date Created**; prefilled prose
   stays, tags are never touched, and a drawer Getty leaves on its loading
   skeletons triggers an immediate reload and a walk of the batch from its first
   pictured file — see [metadata and repair](stock-upload-getty-web-metadata.md)
   (the readiness ladder and `report.sweeps` live there too).
7. **Complete each batch, then start the next:** after its last card carries
   "Ready to submit" the run posts `/getty-web/finish` **for that batch only**. It
   refuses, naming what is wrong, while one of *that* batch's contributions is
   missing or says "Upload failed" (rejected files are re-uploaded once).
   **A page with no Complete/Submit control is not an error:** every card carrying
   "Ready to submit" *is* the finished state (`ok: true`, `ready: true`,
   `completed: false`). `accepted` is the chip list, so the app
   badges only what Getty validated. The next batch follows in that session.
8. **The re-upload list:** an icon whose card showed no thumbnail, was never
   listed or read "Upload failed" is queued and retried **exactly once**
   (`GETTY_WEB_MAX_ATTEMPTS = 2`). Queued icons fill a later batch's room, so a
   250-icon run carries them in batch 3; the rest becomes the final
   `… retry 1/1 (7 icons)` batch, and only a terminal outcome reaches the row.
   A sign-out, dead browser or dead helper stops the run; what it never reached
   fails with that reason.
9. `/getty-web/close` releases the browser, deletes staged files; an idle
    session closes after 5 min, but one **with a request in flight is never swept**
    (`mayReleaseSession`): a batch outlives five minutes.

## 3. Browser, profile and self-check

- Default `chrome --headless=new`, throwaway profile; `--getty-headed`
  (`GETTY_WEB_HEADED=1`) shows the window; a visible window is never killed.
- `--getty-profile <folder>` (`GETTY_WEB_PROFILE`) keeps the browser between runs
  so the sign-in survives (ten idle minutes close it), `--restore-last-session`
  revives a session-only login, and cookies live in `iconsplitter-session.json`
  (0600, never logged), so a killed window starts signed in.
- `--getty-check` shows `browser:`, `launch:`, `socket:`; `--getty-reset
  --getty-profile <folder>` ends that browser; `--getty-cdp` (`GETTY_WEB_CDP`)
  attaches to `--remote-debugging-port=9222`. `GETTY_WEB_BROWSER` overrides the
  executable; `GETTY_WEB_UPLOAD_TIMEOUT_MS` (180 s),
  `GETTY_WEB_READY_TIMEOUT_MS` (300 s) bound the waits.

**One profile, one browser, freed by the helper.** A browser answering on the
folder's port is attached to; a locked folder without one is freed by ending its
browsers, clearing locks and relaunching.

## 4. What is sent

- One JPEG per icon plus its matching-stem EPS; SVG, PNG, ZIP are refused.
- Title, description and keywords travel inside the JPEG/EPS (IPTC/XMP/RDF)
  *and* as a capped `metadata` field (title 200, description 2000, keywords
  49 × 64, deduped); the file's tags are kept.
- Type `iStock creative illustration`; the run completes each batch via
  `/getty-web/finish` and reports `completed`/`completion`/`ready`;
  `GETTY_WEB_COMPLETE=0` stops after upload. A failed upload also
  answers `accepted`/`failed`/`notReady`/`seen` (`failurePayload`), so a timed-out
  chunk is never re-sent.

## 5. Page contract and failure codes

`driver.mjs` keeps each DOM decision self-contained (own constants and IIFEs, so
it can be re-injected); handles, cards and drawer rules live in
[selectors/stock-upload](../selectors/stock-upload.md). Sign-in has no captured
handles: `fillLoginForm`/`inspectSignIn`/`submitLogin` match behaviour, and the
text is typed (`Input.insertText` plus `angular.element(el)`, since
`ng-app="SignInApp"` ignores `.value =`). Codes: `bad-request` 400, `auth` 401,
`browser` 503, `timeout` 504 (no batch page, a name missing, control never ready,
an unvalidated file), `cancelled` 499, `page` 502. No credentials in a reason.

## 6. Honest limits

- Built against captured markup, **not** a live account:
  drift is a `page` failure naming the step; editor/Complete selectors are
  guesses **not** seen live.
- A picture proves nothing: Getty draws one for rejected and unvalidated cards,
  so a card left `not_ready_to_submit` fails that file by name.
- Arkose/funCaptcha **cannot** be automated: solve it once headed (it then lives
  in the profile); typing is proven against a fake CDP.

## 7. Invariants and tests

- Credentials live only in the vault ([I-81](invariants/upload.md#i-81)), go only
  to the loopback helper, and are never logged or echoed. Only
  `https://<…>.gettyimages.com` contributor paths are contacted (`..`, queries and
  other hosts refused by `contributeUrlOf`); staged files use sanitized names,
  deleted on close.
- Tests (`tests/`): `getty_web_chunk` (budgets, batch names), `getty_web_driver`
  (arrival vs ready, skeleton drawer, pictured cards, read-back values),
  `getty_web_signin`, `getty_web_browser` (locks, launch, reset, kept window),
  `getty_web_batch` (dialog, batch id, uploader), `getty_web_upload` (sizes,
  failure reasons), `getty_web_cdp`, `bridge_getty_web` (routes, flags, 413,
  cap), `getty_web_finalize` (metadata, re-save, re-upload, skeleton reload and
  the repair walk, complete), `stockupload_getty_web` (grouping, chunking, random
  order, half-split retry, folding, sign-out, cancel).
