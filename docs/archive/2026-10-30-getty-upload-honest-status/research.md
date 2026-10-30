# Research — Getty web upload reports success it does not have

**Date:** 2026-10-30 · **Scope:** `getty-web` upload only (`Upload` tab → Getty
Images (web upload)) · **Status:** research + fix plan, **no code changed** in this
change. Fix design: `docs/archive/2026-10-30-getty-upload-honest-status/design.md`.

## 1. What the user reported

A finished Getty run showed these two facts on the contributor page at the same
time as a "successful, fully uploaded" progress bar:

1. **Two of the batch's cards were clearly not uploaded.** The user's captured
   markup has seven contribution cards, five of them wearing Getty's own
   `data-cy="pending-icon" aria-label="Ready to submit"` chip:
   - `icon-map-pin_5_02.eps` (id 514607869, ID 2302700698): card contains
     `data-cy="invalid-file-media"` reading **"Upload failed"** **and**
     `data-cy="not-ready-icon" aria-label="not_ready_to_submit"`.
   - `icon-map-pin_6_03_v4.eps` (id 514607873, ID 2302700733): card has a
     thumbnail but `data-cy="not-ready-icon"` — no Ready-to-submit chip.
   - The other five carry `pending-icon` / "Ready to submit".

   Yet the progress bar had reached 100 % and read as a finished, successful
   upload ("all pairs … marked as success / fully uploaded").
2. **The last uploaded file was never re-submitted/re-saved afterwards**, so its
   card never turned "Ready to submit" either. Nothing later in the run (or after
   it) went back to that card.

Both are honest-accounting bugs, not Getty quirks: the card markup is exactly what
the helper's selectors expect, and the Ready icon is already treated as the only
proof of an upload everywhere else in the code base.

## 2. What the run does today (the intended contract)

One `POST /getty-web/upload` carries **every** icon (`src/stockupload/gettywebtransfer.ts:140`).
The helper attaches all files in one `DOM.setFileInputFiles`
(`tools/bridge/gettyweb/contribute.mjs:407-420`), waits until every file is listed and
every card shows a **picture** (`contribute.mjs:364`), then fills each
contribution's metadata drawer, presses **Save metadata** once for the whole grid,
and finally waits for every card's **`Ready to submit`** chip
(`contribute.mjs:576`), re-pressing Save metadata for cards that lag
(`contribute.mjs:600`). The run then submits the one batch once
(`src/stockupload/runupload.ts:180`).

The ready chip is meant to be the single success truth:
`tools/bridge/gettyweb/contribute.mjs:550-560` (`notReadyContributions`),
`tools/bridge/gettyweb/driver.mjs:127-138` (selectors),
`docs/current/sor/stock-upload-getty-web.md` §6 ("a thumbnail proves nothing at
all"). The defects below are the places where that truth is dropped, inverted, or
counted too early.

## 3. Findings

### F1 — The bar counts *pictures and failures* as "settled", so it reaches 100 % before anything is verified

`src/stockupload/gettywebtransfer.ts:180-182`:

```ts
export function settledFiles(progress: GettyWebProgress): number {
  return Math.max(progress.uploaded, progress.ready ?? 0) + progress.failed;
}
```

`uploaded` is *the card's picture rendered* (`tools/bridge/gettyweb/session.mjs:27-43`
→ `driver.mjs:191-196` `fileStatus`), i.e. bytes arrived, not accepted. `failed` is
added on top, so a **rejection also advances the bar**.

`src/stockupload/runupload.ts:139-143` feeds that into `done` and clamps it to the
file count. With the user's run (7 contributions = 14 file names: the five ready
pairs contribute 10 names to `ready`; the rejected card's pair contributes 2 names
to `failed`; the remaining card still has a picture, so 12 names are `uploaded`)
the arithmetic is literally `min(14, max(12, 10) + 2) = 14` → **100 %**, while only
5 of 7 contributions were ready. This is the exact mechanism behind complaint 1:
the two problem cards are what completes the bar.

### F2 — A bar that touches its total is treated as a *finished* run, mid-flight

`src/stockupload/progressmodel.ts:27-45`:

```ts
const finished = step.complete === true || done >= step.total;
return { percent: finished ? 100 : percent, finished, failed, title: … };
```

`finished` forces 100 %, swaps the Cancel button for the ✕ close control
(`src/stockupload/StockUploadDialogs.tsx:96-137`) and, while the run has not
returned (`complete` unset), titles itself **"Upload complete"** — the `failed`
counter is only ever rendered in the title once `complete === true`. So during the
entire metadata/readiness phase the panel says the job is done, and a failed file
never changes that sentence.

### F3 — "Arrived" is written into the app as "uploaded": wrong per-file status and badges

`tools/bridge/gettyweb/session.mjs:45-48`:

```ts
export function acceptedOf(done, attachResult) {
  const settled = done?.report?.readiness?.state ?? attachResult?.state ?? null;
  return Array.isArray(settled?.uploaded) ? settled.uploaded : [];   // pictures!
}
```

`uploaded` again means "picture present" (`driver.mjs:436-441`). The route then
publishes it as `accepted` (`tools/bridge/gettyweb/routes.mjs:229-232`) — while
both the client type and the route comment promise it is *"names whose card
carries Getty's Ready to submit icon"* (`src/lib/stockupload/gettywebclient.ts:38-39`,
`routes.mjs:230`). The app trusts it:
`src/stockupload/gettywebtransfer.ts:104-116` returns `ok: true` for any icon whose
stem is in `accepted`, and `src/stockupload/statusflush.ts:38-55` then records
`uploaded`, assigns the Getty row badge and logs `… uploaded`. A card that still
shows `not_ready-icon` (and may turn "Upload failed" a minute later) is therefore
stored, logged and badged as a success.

### F4 — One unreadable readiness page is silently "fine"; one bad file turns the *whole* batch into failures

Two opposite lies live in the same path:

- **Unverifiable = success.** `tools/bridge/gettyweb/contribute.mjs:585-592`: if the
  first readiness read fails (`readStateSafe` → `ok:false`, a frozen/slow tab right
  after the bulk save) or the page renders no cards, the function returns
  `{ ok: true, verified: false }`. `finalizeBatch` continues, the route answers
  `ok: true`, and `accepted` = every picture → **all pairs success** even though
  nothing was verified. This is a matching explanation for the reported screenshot
  when the readiness read happened to fail.
- **One rejection = every icon failed.** `src/stockupload/gettywebtransfer.ts:56-58`
  `failed()` maps *all* icons to `ok:false` whenever the single call returns
  `ok:false`. So one rejected card (or one readiness timeout) wipes the success of
  the pairs that *did* reach "Ready to submit": no status, no badge, no per-file
  reason. The truth is per contribution; the code has no per-contribution channel
  on the failure path.

### F5 — A rejected card stops the readiness/resave pass for *everybody*, so the last file never flips

`tools/bridge/gettyweb/contribute.mjs:794-808`:

```js
if (anyDrawerSaved(filled.report)) report.bulkSave = await saveEverySelected(...);
const rejected = namesOf(options.failed);
if (rejected.length > 0) {
  return { ok: false, code: "page", report, reason: `Getty reports "Upload failed" …` };
}
const readiness = await waitForReadyToSubmit(...);   // never reached
```

As soon as any card says "Upload failed", `finalizeBatch` returns **before** the
readiness loop runs. No re-save is pressed, no card is re-checked. Cards that only
needed the second Save to turn ready (the documented behaviour at
`contribute.mjs:600`) stay `not_ready` for the rest of the run, and nothing later
revisits them (`submitGettyBatch` only calls `/getty-web/finish`, which refuses a
batch that holds a failed card and never re-saves). This alone explains "the last
uploaded file was not resubmitted later and its status never changed".

### F6 — Metadata that never landed is never retried; only "press Save again" is

`fillEveryFileMetadata` (`contribute.mjs:503-530`) records `row-not-found` /
`editor-not-ready` / `filled-unsaved` and moves on. Those statuses are returned in
`report.metadata` but **never acted upon**: the readiness loop only re-clicks
*Save metadata* on the current selection (`saveEverySelected`, `contribute.mjs:491-500`),
which cannot give a contribution the metadata its drawer never received. The file
that arrives last is the likeliest victim: its card/drawer can still be missing
when the sequential fill reaches it, and from then on it can never become ready.

### F7 — The readiness budget is a fixed clock, and nothing retries after the run

`contribute.mjs:26-28`: `READY_RETRY_MS = 30 s`, `READY_RESAVES = 2`,
`READY_TIMEOUT_MS = 75 s`, measured from the start of the readiness wait
(`contribute.mjs:577-579`). The last-arrived contribution gets the same 75 s as the
first one, consumes the most ingestion time, and the two re-saves are spent
regardless of whether anything moved. When the deadline hits, the run ends with
`timeout`; there is **no post-run re-check, no targeted re-save, and no app-level
retry of the not-ready/failed item** — the only way is a full new run, which
creates a second batch and duplicate contributions.

Related, same family: `reloadAndRetry` re-attaches only files the page *never
listed* (`contribute.mjs:311-330`), so a card Getty answered with "Upload failed"
is never re-attached either; `finishRefusal`
(`contribute.mjs:711-724`) correctly refuses to submit such a batch, but by then
the bar has already claimed success.

### F8 — Nothing in the pipeline can tell "arrived" from "verified"

`GettyWebProgress` drops `ready` when it is 0
(`src/lib/stockupload/gettyprogress.ts:32-38`), so the app cannot distinguish
"zero ready" from "this helper cannot report readiness", and falls back to the
picture count (F1). `progressLabel` (`gettywebtransfer.ts:161-172`) also calls the
picture count "uploaded" and, in the metadata phase with nothing ready yet,
prints `saving metadata <listed> of <total> file(s)` — the *listed* count, not a
saved/verified one.

## 4. Why the current documented contract cannot stay

`docs/current/sor/stock-upload.md` §2 (progress bullet) states, as the contract:
"the percentage reaches 100 % on arrival, the bar's line then reports `N of M
file(s) ready to submit`". That sentence blesses F1–F2 (100 % before verification)
and is exactly what the user saw. It must be replaced by the honest contract in the
fix design, together with the `accepted`-means-ready promise in
`src/lib/stockupload/gettywebclient.ts:38-39`, which the implementation already
contradicts.

## 5. Ruled out (so the fix does not chase ghosts)

- **Selectors.** `not-ready-icon`, `pending-icon`, `invalid-file-media` and
  `contribution-file-name` match the captured page exactly (`driver.mjs:124-138`),
  including the case observed here. The page was read correctly; the app discarded
  the reading.
- **Cancellation / abort.** The run was not stopped (`counters.done` reached the
  total, the batch was created and files were listed).
- **The helper's per-card `ready` accounting.** `notReadyContributions` and
  `readinessReport` are correct; they are simply not consulted before success is
  published (F4) and are skipped entirely when a rejection exists (F5).
- **Multiple page reads of the ready chip.** Not involved: the failing symptom is
  reproducible from the single final reading plus the arithmetic in F1.

## 6. How to reproduce without a live Getty account

The whole failure is reproducible in the existing test harness (no provider calls):

1. `tests/getty_web_finalize.test.ts` — a queue where `readUploadState` answers
   `cardsPresent: true, readyToSubmit: [5 of 7], awaitingReady: [1], failures: [1]`
   must **not** produce `ok: true`, and `readUploadState` returning nothing must
   not be treated as verified.
2. `tests/stockupload_getty_web.test.ts` — a live progress reading
   `{ total: 14, uploaded: 12, ready: 10, failed: 2 }` already yields
   `done === 14` today (the user's 100 %); the fixed model must yield
   `done === 12` (10 ready + 2 failed) and a percent below 100 with a run still in
   flight.
3. `tests/getty_web_batch.test.ts` — a captured page with one
   `invalid-file-media` card must still resave/verify the remaining cards.

Evidence for the fix design and its acceptance criteria:
`docs/archive/2026-10-30-getty-upload-honest-status/design.md`.
