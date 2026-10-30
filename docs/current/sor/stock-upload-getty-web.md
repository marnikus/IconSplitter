# Getty Images web upload (`getty-web`) — background browser automation

Parent: [stock-upload](stock-upload.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. Why this is a bridge job

Getty's ESP **API** preset (`esp-https`) needs a Partner key; a website login
uploads through `esp.gettyimages.com/contribute`, which the app cannot drive
(CORS), so the **loopback helper** (`tools/bridge/gettyweb/`) drives a browser.

## 2. Flow

1. The user saves the contributor **numeric ID** (or e-mail) and password in the
   vault, then presses **Test connection** or **Upload**; `panelops.ts` probes
   `/health` (`gettyWeb.ready`, `gettyWeb.browser`, `gettyWeb.maxBytes`), so a
   missing browser or an outdated helper fails with a hint.
2. `runupload.ts` groups tasks **per icon** — a JPEG/EPS pair is **one**
   contribution, matched by **stem** — one `sessionKey` per target, then hands the
   icons to `uploadGettyWebRun`.
3. **The run is N batches of ≤ 100 icons** (`planGettyWebBatches`, mirrored by the
   helper's `MAX_ICONS`): one icon is one upload, and Getty lists a pair once under
   the EPS name, so 100 pairs (200 files) are one batch and 101 icons are two. A
   batch also ends early at the request budget: `gettyWeb.maxBytes`
   (`GETTY_WEB_MAX_BYTES`, 256 MB) capped at this build's 64 MB, or 16 MB for a
   helper that reports none. Names carry their place:
   `IconSplitter 2026-10-30 2/3 (100 icons)`.
4. `/getty-web/upload` runs **once per batch** with `newBatch: true`: the helper
   stages that chunk, signs in once per run, returns to the contributor page,
   creates the batch (`session.startBatch` resets the last id, names and counts)
   and hands its files to the uploader in one `DOM.setFileInputFiles` after
   dismissing dialogs (one blocks the uploader). The per-icon manifest is the
   **body's tail** (`manifestBytes` header), never a header: Node answers 431
   above 16 KB, before any route runs (I-83).
5. Getty's uploader transfers; an oversized body is drained and answered 413, and
   a request the helper never answered is retried **in halves** (twice), since it
   carried nothing. **Both waits reload a stuck page**, sharing two reloads per
   attach: the listing wait after 30 s with no new name (re-attaching the missing
   files, then it fails honestly; a timed-out read is that stall, retried), the
   picture wait after 30 s with no new picture — or at once when the cards read
   "Upload failed", the state a reload clears — attaching the files without a
   picture again. It waits for each card's **picture** or its `pending-icon`
   "Ready to submit" chip — a thumbnail arms the metadata step, since the chip
   appears **only after** a save. `invalid-file-media` ("Upload failed") is a
   rejection named with Getty's id. `GET /getty-web/progress` (1 s poll) counts
   **arrivals** here, so the bar says "uploaded", never "complete".
6. **Metadata:** per contribution it clicks the card by stem (twice if Getty drops
   it), types title/description and writes **today's date** into Date Created as
   Getty renders it (`MM/DD/YYYY 00:00:00 +0000`): prefilled prose stays, the date
   is always replaced, **tags are never touched** (only the keyword field gets
   Enter). Every drawer saved, it selects **all** cards and presses **Save
   metadata** once (`bulkSave`).
   **Then it verifies:** every card must show `pending-icon` /
   `aria-label="Ready to submit"`, and the bar's line climbs with them. A card
   still showing `not-ready-icon` gets **Save metadata again after 30 s** (twice)
   with only those files re-checked; if the chip still does not come, the run
   **re-uploads that file from its staged copy** (`reattachFiles`) and re-checks —
   a third save changes nothing, a second attach does. **Last, it reloads the page
   once and applies the metadata again** (each pending drawer typed again, then one
   grid-wide save), which a grid that stopped flipping its own icon answers; the
   reload buys its own 30 s window. So every batch gets at least one page reload
   when its verification drags, **before** the next 100 — even when the wait has no
   window left — and a file still unvalidated is named (`timeout`). The verifying
   phase counts **chips**, so 100 % means submittable. `readiness`: `ok`,
   `notReady`, `resaves`, `repairs`, `reloads`.
7. **Complete each batch, then start the next:** once its last card carries
   "Ready to submit" the run posts `/getty-web/finish` **for that batch only**,
   refusing — naming what is wrong — while one of *that* batch's contributions is
   missing or says "Upload failed" (after one re-upload of the rejected files).
   **No Complete/Submit control is not an error:** every card "Ready to submit"
   *is* the finished state (`ok`, `ready`, `completed: false`), and `accepted` is
   the chip list, so the app badges only what Getty validated. The next batch
   follows in the same session.
8. **The re-upload list:** an icon whose card showed no thumbnail, was never
   listed or still read "Upload failed" after that reload is queued and retried
   **exactly once**
   (`GETTY_WEB_MAX_ATTEMPTS = 2`). Queued icons fill a later batch's room, so a
   250-icon run carries rejections in batch 3; the rest becomes the final
   `… retry 1/1 (7 icons)` batch(es), and only a terminal outcome reaches the row.
   A sign-out, dead browser or dead helper stops the run, failing what it never
   reached with that reason.
9. `/getty-web/close` releases the browser and deletes staged files; an idle
    session closes after 5 min, but one **with a request in flight is never
    swept** (`mayReleaseSession`) — a 100-icon batch outlives five minutes.

## 3. Browser, profile and self-check

Launch flags, the kept profile, cookies and the self-check commands have their
own page: [browser and profile](stock-upload-getty-web-browser.md).

## 4. What is sent

- One JPEG per icon plus its matching-stem EPS; SVG, PNG, ZIP are refused first.
- Title, description and keywords travel inside the JPEG/EPS (IPTC/XMP/RDF)
  *and* as a capped `metadata` field (title 200, description 2000, keywords 49 ×
  64, deduped; carriers: [file metadata](upload-file-metadata.md)); tags are kept.
- Type `iStock creative illustration`; each batch completes via
  `/getty-web/finish` and reports `completed`/`completion`/`ready` (plus
  `GETTY_WEB_COMPLETE=0` to stop after upload). A failed `/getty-web/upload` still
  answers `accepted`/`failed`/`notReady`/`seen` (`failurePayload`), so a timed-out
  chunk is never re-sent.

## 5. Page contract and failure codes

`driver.mjs` keeps each DOM decision self-contained (own constants and IIFEs, so
it can be re-injected); handles, cards and drawer rules are in
[selectors/stock-upload](../selectors/stock-upload.md). Sign-in has no captured
handles: `fillLoginForm`/`inspectSignIn`/`submitLogin` match behaviour and the
text is typed (`Input.insertText` plus `angular.element(el)`, since
`ng-app="SignInApp"` ignores `.value =`). Codes: `bad-request` 400, `auth` 401,
`browser` 503, `timeout` 504 (no batch page, a name missing, control never ready,
an unvalidated file), `cancelled` 499, `page` 502. No credentials in a reason.

## 6. Honest limits

- Built against captured markup, **not** a live account: drift is a `page`
  failure naming the step; editor/Complete selectors are guesses **not** seen live.
- A picture proves nothing: Getty draws one for rejected files and unvalidated
  cards, so a card left `not_ready_to_submit` fails that file by name.
- Arkose/funCaptcha **cannot** be automated: solve it once headed (it then lives
  in the profile); typing is proven against a fake CDP. `completed` means the
  control was clicked, `ready` that every card showed Getty's icon.

## 7. Invariants and tests

- Credentials live only in the vault ([I-81](invariants/upload.md#i-81)), go only
  to the loopback helper and are never logged or echoed. Only
  `https://<…>.gettyimages.com` contributor paths are contacted (`..`, queries and
  other hosts are refused by `contributeUrlOf`); staged files get sanitized names
  and are deleted on close.
- Tests (`tests/`): `getty_web_chunk` (icon and byte budgets, names),
  `getty_web_driver` (arrival vs ready), `getty_web_signin`, `getty_web_browser`
  (locks, launch, reset, kept window), `getty_web_batch` (dialog, batch id,
  uploader, stall and rejected-batch reloads), `getty_web_upload` (header, sizes,
  failure reasons),
  `getty_web_cdp`, `bridge_getty_web` (routes, flags, 413, advertised cap),
  `getty_web_finalize` (metadata, re-save, re-upload, reload-and-reapply, complete),
  `stockupload_getty_web` (grouping, chunking, half-split retry, retry folding,
  sign-out, cancel, no creds).
