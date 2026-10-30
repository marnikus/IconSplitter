# Getty Images web upload — the 100-upload batch limit, sequential batches and the re-upload list

Date: 2026-10-30
Branch: `arena/02f71097-iconsplitter`
Status: **Problem analysis and step-by-step plan only — no production or test code changed.**

Current owner page for the shipped behaviour: [stock-upload-getty-web](../../current/sor/stock-upload-getty-web.md).

---

## 1. Problem understanding

### 1.1 What the user reported

> Getty takes a maximum of **100 uploads per batch** — the number is 100, not 200. A
> JPEG + EPS pair is **one** upload (Getty lists the pair once, under the EPS name), so a
> batch holds at most **100 pairs** however many physical files that is. If the user
> selected more than 100 pairs, only the first 100 should be uploaded, then the run must
> **close that batch on the web and start the next one**, repeating as many times as
> needed until every selected icon has been uploaded into its own batch. Icons that failed
> inside a batch go on a **re-upload list** and are added to a later / the last batch to
> be uploaded a **second time**.

In other words: a run is no longer "one session → one batch → every icon". A run becomes
**N batches of at most 100 icons, sent one after another, each one completed before the next
is created**, plus **one bounded retry pass** for the icons that did not land.

The counting unit is the **icon (contribution), never the file**: one icon is its JPEG plus
its optional matching EPS, and Getty counts that as one upload. A batch therefore carries
100 icons — 100 physical files when none has an EPS, up to 200 when all do — and the number
that must never pass 100 is the icon count.

### 1.2 What the code does today (measured, not assumed)

| Fact | Owner (as it is today) |
|---|---|
| One GETTY web run = **one** helper request carrying **every** icon | `runGettyWebIcons` — `src/stockupload/runupload.ts:152`, `uploadGettyWebRun` — `src/stockupload/gettywebtransfer.ts:139` |
| One batch for the whole session; the batch id is cached forever | `ensureBatch` — `tools/bridge/gettyweb/session.mjs:193` (`if (state.batchId !== null) return …`) |
| Completion is deferred once, at the end of the run | `submitGettyBatch` — `src/stockupload/runupload.ts:179`, `finishGettyWebRun` — `src/stockupload/gettywebfinish.ts` |
| The helper accepts up to **200 icons = 200 counted uploads** per request — twice the cap (and up to 400 physical files) | `MAX_ICONS = 200`, `MAX_FILES_PER_ICON = 2` — `tools/bridge/gettyweb/routes.mjs:20-21`, checked at `:158`, `:163` |
| A request-level failure marks **every** icon of the request failed | `failed()` — `src/stockupload/gettywebtransfer.ts` (used by `uploadGettyWebRun` when `!res.ok`) |
| A failed upload answers `{code, reason, state}` only — no accepted/failed name lists | `handleGettyWebUpload` — `tools/bridge/gettyweb/routes.mjs:207` |
| Batch name = date + total icon count, capped at 60 chars, no index | `gettyWebBatchName` — `src/lib/stockupload/gettyweb.ts` |
| A pooled session is dropped after 5 idle minutes, and the idle timer is armed **once, at request start** | `SESSION_IDLE_MS` — `tools/bridge/gettyweb/routes.mjs:14`; `touch()` — `:107`, called once at `performUpload` (`:192`) |
| The current SOR states "one batch, all pairs in one attach, up to 200" | `docs/current/sor/stock-upload-getty-web.md:21` |

So today the app is **doubly wrong against the limit**: the helper accepts twice a
batch's worth of icons in one request, and the app happily builds that request.

### 1.3 Why that fails above 100 pairs

1. **Over-limit request.** 240 selected icons = 240 counted uploads (up to 480 physical
   files) in one `DOM.setFileInputFiles` call. Getty takes at most 100 uploads per batch;
   the surplus is either refused or silently dropped, and the run then reports a timeout
   with no usable per-icon truth.
2. **No second batch.** `ensureBatch` returns the cached batch id for the life of the
   session, so even if the app wanted a second batch it would upload into the first one.
3. **No per-batch completion.** `gettywebfinish.ts` submits once, after the last icon. A
   limit-split run must complete batch *k* before batch *k+1* exists at all.
4. **Failures are unrecoverable and over-broad.** One timeout inside a 100-icon request
   collapses to "all 100 icons failed" (`failed()`), which both hides the ~95 icons Getty
   already accepted *and* invites re-uploading them into the next batch as duplicates.
5. **No retry path.** A rejected card is reported in `counters.lastError` and dropped; the
   only "retry" is the user selecting and uploading everything again by hand.
6. **Long-request hazard.** A single 100-icon attach plus metadata typing easily exceeds
   five minutes; the idle sweep at `routes.mjs:107` does not know a request is in flight
   and can release (close) the browser mid-batch. Splitting into batches does not fix this
   by itself — each batch is still a long request.

### 1.4 Acceptance criteria

| # | Criterion |
|---|---|
| A1 | No helper request and no batch ever carries more than **100 icons**. One icon counts once, whether it is a JPEG alone or a JPEG + EPS pair (so at most 200 physical files). |
| A2 | A pair counts as one upload and is never split across batches — the chunk unit is the icon, so this cannot break. |
| A3 | Batch 1 holds the **first 100 pairs** in the plan's existing deterministic order, batch 2 the next 100, and so on. |
| A4 | Each batch is **completed on the web** (Complete clicked, or every card carrying Getty's "Ready to submit" icon when the page offers no control) **before** the next batch is created. A batch that cannot be completed is reported with its refusal reason and its icons are not claimed as uploaded. |
| A5 | The whole run signs in **once** and reuses one browser session; only the batch is new per chunk. |
| A6 | Every icon that did not land is retried **exactly once**, in a later batch or in the final retry batch(es), obeying A1/A2. |
| A7 | An icon is claimed uploaded only when the page proved it (thumbnail or "Ready to submit"); an icon is never written as failed while a retry is still pending. |
| A8 | After the run, the re-upload list is visible (a count and a filter) and contains exactly the icons that never landed, each with Getty's own reason. |
| A9 | Cancel stops at the next **batch boundary**: finished batches stay finished, an open batch is named with its id, and nothing half-done is claimed as success. |

### 1.5 Vocabulary

- **Icon / pair** — one exported item: its JPEG plus an optional matching-stem EPS. The
  unit the user selects and the unit a row shows.
- **Batch** — one Getty submission batch (`/contribute/batches/<id>`), created in the
  Create Batch dialog, holding at most 100 icons (100–200 physical files).
- **Chunk** — the icons the app hands to one batch in one request.
- **Re-upload list** — icons of this run that Getty did not accept, eligible for the one
  retry attempt.

---

## 2. Facts and constraints that shape the design

1. **The limit belongs to Getty, not to the helper.** It is **100 counted uploads per
   batch**. One icon — its JPEG, plus its EPS when it has one — is one upload, because
   Getty lists a pair once (under the EPS name). So the number that must never exceed 100
   is the **icon** count, not the file count: 100 icons means 100 files when no icon has an
   EPS and 200 files when every one does, and both are legal. The limit lives as one
   constant in the app (`GETTY_WEB_MAX_BATCH_ICONS = 100`) mirrored in the helper
   (`MAX_ICONS = 100`); a bridge test asserts both copies agree.
2. **The count is icons, not files and not bytes.** A JPEG-only icon and a JPEG + EPS icon
   both cost 1. 100 JPEG-only icons, 100 pairs and 50 pairs + 50 JPEG-only icons are all
   legal; 101 icons of any shape is not. The planner therefore chunks by **icon count**,
   which is also why a pair can never be split across two batches.
3. **If Getty ever counts physical files instead**, the same constant halves the chunk to
   50 pairs — one number, one test, no other change.
4. **A batch is the only thing that can be completed.** There is no "append to a completed
   batch", so retries cannot go back into batch *k* once it has been submitted. They go
   forward.
5. **Sign-in is expensive and rate-limited.** Arkose/funCaptcha can only be solved by a
   human once; the run must not create a new browser or a new login per batch. The pooled
   session (`/getty-web/close`, 5-minute idle) already gives us one sign-in — it just has
   to survive N batch creations.
6. **Metadata typing is per card.** Each batch still pays one drawer open + one bulk
   "Save metadata" for its own cards; that cost scales with icons, not with batches, so
   splitting does not make the run slower overall.
7. **The run is long.** 300 icons ≈ 3 batches ≈ hours, not minutes. Every wait
   (`uploadTimeoutFor`, `readyTimeoutMs`) must be **per batch**, and the UI must be
   truthful about batch progress rather than pretending a single bar will finish soon.
8. **Rules that cannot bend**: no credential or page text in logs (RULE 20), one owner per
   fact (RULE 17), new functions ≤ 30 lines / ≤ 4 params / CC ≤ 10 (RULE 16), no live
   provider calls in tests.

---

## 3. Design decisions

### D1 — One pure planner decides the chunks (`src/lib/stockupload/gettyweb.ts`)

```ts
export const GETTY_WEB_MAX_BATCH_ICONS = 100;  // one icon = one counted upload (JPEG ± EPS)
export const GETTY_WEB_MAX_ATTEMPTS = 2;      // one upload + one retry

export function planGettyWebBatches(
  icons: readonly GettyWebIconRef[],
  maxIcons = GETTY_WEB_MAX_BATCH_ICONS,
): GettyWebIconRef[][];   // batches of 1 … maxIcons icons, order preserved
```

- Greedy pack in the plan's existing order, **100 icons per batch**, so the first 100 pairs
  of the selection are batch 1.
- The unit is the icon, so a JPEG/EPS pair can never be split and an icon can never be
  half-sent; a JPEG-only icon and a pair cost the same 1.
- Pure, no I/O, ≤ 30 lines, one job — the whole chunking contract is testable without a
  browser.

### D2 — Retries are folded forward, never backward

- A finished batch yields three sets per icon: **accepted** (thumbnail or ready icon),
  **rejected** (`invalid-file-media`, Getty's id), **unproven** (never listed, or listed
  without a thumbnail).
- Rejected + unproven icons enter the re-upload list with their reason and attempt count.
- Before every batch after the first, the run fills that batch's **remaining room**
  (100 − its own icons) from the re-upload list, oldest failure first. Whatever is still
  queued after the last primary batch becomes the **final retry batch(es)**, named
  `… retry 1/1 (7 icons)`.
- This is exactly the user's "later / last batch": a 250-icon selection chunks as
  `[100, 100, 50]`, so batch 3 has 50 icons of room and failures from batches 1–2 can ride
  along in it; only what is left over forms a retry batch.
- An icon is attempted at most `GETTY_WEB_MAX_ATTEMPTS` (2) times, which makes an infinite
  retry loop structurally impossible.

### D3 — One helper request per batch, with an explicit "start a new batch"

The app sends the same `POST /getty-web/upload` once **per chunk**, with a new config flag:

```jsonc
{ "newBatch": true, "batchName": "IconSplitter 2026-10-30 2/3 (100 icons)", … "icons": [ … ≤ 100 icons … ] }
```

- `newBatch: true` → `session.startBatch({batchName, submissionType})`: navigate back to
  the contributor page when the previous batch is still on screen, dismiss dialogs, create
  the batch, then **reset** `state.batchId`, `state.expected`, `state.progress`,
  `state.reloads`.
- `newBatch` absent/false keeps today's `ensureBatch` behaviour, so the single-batch path
  (and its tests) stay valid.
- `state.expected` must be per batch: `finish` refuses while a card of *its* batch is
  missing, and a stale name from batch 1 would otherwise block batch 2's completion.

### D4 — The batch is completed between batches, through the existing finish route

- After the last icon of chunk *k*: type/save metadata, wait for "Ready to submit" (all
  existing `finalizeBatch` rules), then call the **existing** `POST /getty-web/finish`.
- The refusal rules stay where they are (a missing contribution, or one reading
  "Upload failed", refuses the completion and names it). A refused finish leaves the batch
  open, is reported with its id, and its icons are **not** claimed as uploaded.
- No change to the "no Complete control at all → `ready: true` is finished" rule; that
  closes the batch too.
- Only after that answer does the run create the next batch. This preserves the reason the
  single-run design deferred completion in the first place (completing early locks the
  batch and drops the remaining icons) — here "early" would mean *before* the chunk's own
  last card, which never happens.

### D5 — A failed chunk must still report what it accepted

Today `failed(input, reason)` marks every icon failed. With 100-icon chunks that is a
100-file lie. Fix, on both sides:

- **Helper** (`routes.mjs`): a non-OK answer keeps the last page reading:
  `{ ok: false, code, reason, accepted: [...], failed: [{name,id}], seen: [...] }` — names
  only, exactly the data it already builds for the success body (`state.uploaded`,
  `state.failures`, `state.namesSeen`), never page text.
- **Client** (`gettywebclient.ts`): `parseFailure` carries those lists on the failure
  shape; `uploadGettyWebRun` maps accepted names to uploaded icons, and only the rest to
  re-upload candidates.

Without this, a timeout after 95 of a 100-icon batch would re-upload those 95 into the
next batch as duplicate contributions.

### D6 — One terminal outcome per icon (this is what makes A7 true)

- `recordTaskResult` keeps its current contract (one call = one file's fate, badges, row
  status, log line) but is now called **once per icon, when that icon is terminal**:
  accepted in a batch, or rejected twice.
- A first-attempt failure is not terminal: it logs `retry-queued` and waits.
- Consequence: the progress bar's `done` counts terminal icons only, and a row never
  flashes "failed" for something that lands in the retry batch. `total` stays the selected
  icons' file count — retries do not inflate it.

### D7 — Batch names carry their place in the queue

```ts
gettyWebBatchName(now, count, { index, total, retry })  // ≤ 60 chars
// "IconSplitter 2026-10-30 1/3 (100 icons)"
// "IconSplitter 2026-10-30 2/3 (100 icons)"
// "IconSplitter 2026-10-30 retry 1/1 (7 icons)"
```

Deterministic, no personal data, and the batches page itself then tells the contributor
which batch is which.

### D8 — The idle sweep must not close a browser with a request in flight

`touch()` arms a 5-minute timer at request start; a 100-icon batch (attach + metadata +
readiness + Complete) outlives it. Decision: the session entry gets `busy = true` for the
duration of `/getty-web/upload` and `/getty-web/finish`, and the idle sweep skips busy
entries (re-armed when the request returns). One small function, one test — and without it
every long batch is a coin flip.

### D9 — Cancellation and stop are per batch

- `signal.aborted` is checked **before creating each batch** and inside the existing waits.
- Stopping leaves finished batches finished (they were completed on the web), names the
  open batch id if one is mid-flight, and puts every not-yet-accepted icon on the
  re-upload list. Nothing is claimed that did not land.

### D10 — A session-level failure stops the run, a file-level failure does not

- `auth` (signed out), `browser` (no executable / died / locked profile), `helper-down`:
  **stop the run**. Retrying cannot fix them, and continuing would create empty batches
  and burn the sign-in.
- `timeout`, `page`, `bad-request` scoped to one chunk: fold the chunk's unaccepted icons
  into the re-upload list and continue with the next batch. A chunk that fails twice never
  causes a third attempt.
- Either way the report says which batch id each failure belongs to.

### D11 — The re-upload list is derived, not stored

- After the run, "needs re-upload" = the selected Getty web target's per-item status in
  `historystore` is `failed`, `partial` or `interrupted` (`StockSiteStatus`, single owner
  today), or the icon is in this run's unaccepted set.
- Exposed as: a count beside `stock-upload-start` ("7 need re-upload"), and a
  `stock-filter-status` select (`All / Uploaded / Failed / Re-upload`) over the same
  derived predicate.
- No new storage key: a fact gets one owner (RULE 17), and the crash journal already
  records `interrupted` honestly.

### D12 — The helper's cap becomes a file cap

`MAX_ICONS = 200` → `MAX_ICONS = 100` (one counted upload per icon, still ≤ 2 files
each), rejected with `400 bad-request` naming the 100-upload cap. The app's
`GETTY_WEB_MAX_BATCH_ICONS` and the helper's `MAX_ICONS` are asserted equal in the bridge
test, so the app can never be "one config away" from sending two batches' worth.

---

## 4. Target flow

```
buildStockUploadPlan → plan.tasks (JPEG + EPS per icon, deterministic order)
        │ groupEspTasks(): one icon per item, JPEG first
        ▼
planGettyWebBatches(icons, 100) → chunk[0] … chunk[n-1]
        │  one sign-in, one browser session, one staged temp folder
        ▼
for k in 0 … n-1:
    icons_k = chunk[k] + queued retries that fit in this batch's room
    POST /getty-web/upload { newBatch: true, batchName: "… k+1/n", icons: icons_k }
        → per-icon outcome: accepted / rejected / unproven
    metadata typed & saved → wait for "Ready to submit" on this batch's cards
    POST /getty-web/finish   (this batch only)
        → completed | ready (no Complete control) | refused (batch stays open, named)
    rejected + unproven icons → re-upload queue (attempt 1)
        ▼
after chunk[n-1]: retry batch(es) built from the queue (attempt 2, same rules)
        ▼
one terminal outcome per icon → summary: batches, completed, re-upload list
```

Example, 250 icons (500 files):

| Batch | Name | Icons | Files | Notes |
|---|---|---|---|---|
| 1 | `… 1/3 (100 icons)` | 100 | 200 | 3 rejected → 3 queued |
| 2 | `… 2/3 (100 icons)` | 100 | 200 | 2 more rejected → 5 queued |
| 3 | `… 3/3 (55 icons)` | 50 + 5 retries | 110 | 250 icons = 100 + 100 + 50, so the last chunk has 50 icons of room |
| 4 | `… retry 1/1 (n icons)` | whatever is still queued (≤ 100) | ≤ 200 | attempt 2; created only when the queue is non-empty after batch 3 |

(Retry batches are created **only** when the queue is non-empty after the last primary
batch.)

---

## 5. Module ownership and contracts

| New / changed | File | Responsibility | Gate |
|---|---|---|---|
| `GETTY_WEB_MAX_BATCH_ICONS`, `GETTY_WEB_MAX_ATTEMPTS`, `planGettyWebBatches`, `gettyWebBatchName(now, count, meta)` | `src/lib/stockupload/gettyweb.ts` | pure chunking + naming | ≤30 lines each |
| `uploadGettyWebBatch` (one chunk, one request), `runGettyWebBatches` (ordering), `nextRetryIcons(queue, room)` | `src/stockupload/gettywebtransfer.ts` | the run's state machine, no DOM | ≤30 lines, ≤4 params |
| `startBatch()` — navigate, create, reset `batchId/expected/progress/reloads` | `tools/bridge/gettyweb/session.mjs` | per-batch lifecycle | — |
| `MAX_ICONS = 100`, failure body with `accepted/failed/seen` | `tools/bridge/gettyweb/routes.mjs` | caps + honest failures | — |
| `newBatch?: boolean` in the config, failure-shape parsing | `src/lib/stockupload/gettywebclient.ts` | request/response contract | — |
| batch loop wiring, per-batch progress label | `src/stockupload/runupload.ts` | replaces the single `runGettyWebIcons` + `submitGettyBatch` pair | ≤30 lines |
| re-upload count, `stock-filter-status`, confirm-dialog batch line | `src/stockupload/{rowlist,StockUploadControls,StockUploadDialogs,StockUploadBulkBar}.tsx` | UI | RULE 16 |
| `batchStartedSpec`, `batchCompletedSpec`, `retryQueuedSpec`, `retryStartedSpec` | `src/stockupload/stockuploadlog.ts` | log trail (no names beyond the file stem already logged) | — |

`executeStockUploadBatch` keeps its signature: the Getty web target remains one target,
one `counters` object, one `finally` close. The difference is entirely inside
`runGettyWebIcons` → the batch orchestrator.

---

## 6. Failure taxonomy

| Situation | Code | What the run does | What the user sees |
|---|---|---|---|
| Create Batch control never enabled (batch *k*) | `timeout` | retry the batch creation once; then stop, naming k | "batch 2/3 could not be created — …" |
| Uploader input never ready | `page` | retry the chunk once in a fresh page; then treat as chunk failure | reason + re-upload count |
| Page listed fewer than the chunk's files | `timeout` + `seen` | accepted icons kept, the rest queued | "batch 2/3: 94 of 100 listed" |
| Card listed without a thumbnail | `timeout` + `accepted` | accepted kept, rest queued | same |
| `invalid-file-media` ("Upload failed") with Getty id | `rejected` | one retry; a second rejection is terminal | "Getty rejected `<stem>` (id) — still failed after retry" |
| Two reloads and still stopped | `page` | queue the rest once, continue; a second stop ends the target | "the Getty batch page stopped answering" |
| Signed out mid-run | `auth` | **stop**; pending icons stay queued | "Getty signed the browser out — re-open the run" |
| Browser missing / profile locked / helper down | `browser`, `helper-down` | **stop**, claim nothing | helper hint |
| Complete refused (missing card / Upload failed) | `timeout`, `bad-request` | batch stays open, reported with id | "batch 2/3 uploaded but not completed — finish it on the contributor page" |
| Cancelled | `cancelled` | stop at the boundary | "cancelled — 2 of 3 batches completed" |
| Icon still queued after attempt 2 | — | terminal failure, row status `failed` | re-upload list |

---

## 7. UI, progress and log contract

**Confirm dialog** (`stock-upload-confirm-dialog`) gains one line for the Getty web target:

> `250 icons → 3 batches (Getty takes 100 uploads per batch; a JPEG + EPS pair counts once)`

**Progress bar** (`stock-upload-progress-*`, `uploadBar`): `done/total` still counts files
of the selection, so the bar keeps its meaning and retries do not inflate it. The label
carries the batch:

> `Getty Images: batch 2/3 · 100 of 100 icons ready · 3 to re-upload`
> `Getty Images: retry batch 1/1 · 5 icons`

`complete` is set only when every icon is terminal (uploaded or failed after retry), so the
bar cannot claim "Upload complete" while a retry batch is still running.

**Re-upload list**: count chip next to `stock-upload-start` ("7 need re-upload") and the
`stock-filter-status` select (`All / Uploaded / Failed / Re-upload`), driven by the derived
predicate from D11. Selecting the filter and pressing Upload is the manual "second attempt"
path for a later run.

**Log** (`logFn`, RULE 20 — no page text, no credentials, file stems only as today):

- `batch-started` — `Getty Images: batch 2/3 (100 icons)`
- `batch-completed` — `Getty Images: batch 2/3 completed (94 uploaded, 3 rejected)`
- `batch-open` — refusal reason + batch id
- `retry-queued` — `3 icon(s) queued for re-upload (Getty rejected …)`
- `retry-started` / `retry-finished`

---

## 8. Ordered implementation steps (TDD: failing test → implement → green)

Each step is a coherent commit; a step is not done until its focused test is green and
`npx tsc --noEmit` + `npm run lint` pass.

### Step 1 — The cap is 100 icons (helper + app)

- Test (failing): `tests/bridge_getty_web.test.ts` — 100 icons are accepted (100 pairs =
  200 physical files, and 100 JPEG-only icons); 101 icons are refused with `400 bad-request`
  naming the 100-upload cap, whatever their file count.
- Implement: `MAX_ICONS = 100` in `routes.mjs` (the per-icon ≤ 2 files rule stays);
  `GETTY_WEB_MAX_BATCH_ICONS = 100` in `src/lib/stockupload/gettyweb.ts` with a test
  asserting both constants agree.
- Done: no request can carry more than one batch's worth.

### Step 2 — The pure chunk planner

- Test (failing): new `tests/getty_web_chunk.test.ts`
  - 250 icons → `[100, 100, 50]`, each chunk ≤ 100 icons (≤ 200 files);
  - 150 JPEG-only icons → `[100, 50]` (a JPEG-only icon still costs 1 of the 100);
  - 50 pairs + 50 JPEG-only icons → one batch of 100 icons / 150 files;
  - a JPEG/EPS pair never lands in two chunks; order is preserved (first icon of the
    selection is the first icon of batch 1);
  - empty selection → no batches;
  - 101 icons → `[100, 1]`, never `[101]`;
  - `gettyWebBatchName` stays ≤ 60 chars for `1/3`, `2/3`, `retry 1/1`.
- Implement: `planGettyWebBatches`, `gettyWebBatchName(now, count, meta)`.
- Done: chunking is fully specified without touching the browser.

### Step 3 — A pooled session can start a second batch

- Test (failing): `tests/getty_web_session.test.ts` — after `startBatch`, `batchId`
  changes, `expected`/`progress` are empty again, the old names can no longer block a
  `finish`; a request without `newBatch` still reuses the open batch (regression guard for
  today's behaviour).
- Implement: `startBatch()` in `session.mjs` (reuse `openContributePage` +
  `dismissPageDialogs` + `createBatch`), `newBatch` in `routes.mjs:performUpload`.
- Done: N batches per session, one sign-in.

### Step 4 — Complete each batch, through the existing route

- Test (failing): `tests/getty_web_finalize.test.ts` / `tests/getty_web_batch.test.ts` —
  `finish` after batch 1 refuses on batch 1's names only; after batch 2, batch 1's names are
  irrelevant; a refused finish leaves the batch open and reports its id.
- Implement: nothing new in `contribute.mjs`; only the per-batch `expected` reset and the
  app calling `finish` per chunk instead of once per run.
- Done: A4 holds, refusal reasons still name the offending contribution.

### Step 5 — A failed chunk reports what it accepted

- Test (failing): `tests/getty_web_upload.test.ts` — a 504 from the helper with
  `accepted: ["a.jpg", "a.eps"]`, `failed: [{name: "b.jpg", id: "123"}]`,
  `seen: [...]` parses into `{ ok: false, code, reason, accepted, failed, seen }`;
  `uploadGettyWebRun` then maps `a` to uploaded and only `b` to the re-upload list.
- Implement: failure body in `routes.mjs`, `parseFailure` in `gettywebclient.ts`, outcome
  mapping in `gettywebtransfer.ts` (replaces the blanket `failed()`).
- Done: a timeout no longer re-uploads accepted files.

### Step 6 — The run-level batch orchestrator

- Test (failing): `tests/stockupload_getty_web.test.ts` with injected `uploadFn` /
  `finishFn` recording the call order:
  - 3 chunks → exactly 3 uploads and 3 finishes, in order, never overlapping;
  - batch 1's rejected icon rides along in batch 3 when it has room;
  - a rejected icon with no room forms `retry 1/1`, attempted twice at most;
  - an icon accepted in the retry batch is reported `uploaded` once, never `failed` first;
  - `auth`/`browser`/`helper-down` stop the loop; `timeout`/`page` do not;
  - cancel before batch 3 → batch 3 never started, batches 1–2 remain completed.
- Implement: `runGettyWebBatches`, `uploadGettyWebBatch`, `nextRetryIcons` in
  `gettywebtransfer.ts`.
- Done: A1–A3, A6, A7, A9 proven without a browser.

### Step 7 — Wire it into `runupload.ts`

- Test (failing): extends `tests/stockupload_getty_web.test.ts` — `recordTaskResult` is
  called once per file and only for terminal icons; `counters.done/total` never exceed the
  selection; the summary names the batch count and the re-upload count.
- Implement: `runGettyWebIcons` delegates to the orchestrator; `submitGettyBatch` is
  deleted (completion now lives per batch inside the orchestrator); progress labels pass
  the batch index.
- Done: the run's summary is the single source of truth the panel shows.

### Step 8 — UI: batch line, batch progress, re-upload list

- Test (failing): `tests/stockupload_getty_web_ui.test.tsx` — the confirm dialog shows
  `3 batches`; the progress label reads `batch 2/3`; the finish state keeps `complete`
  false until retries are terminal; the re-upload chip/filter shows the derived count and
  filters the list; the `.bat`/helper path is unchanged.
- Implement: `StockUploadDialogs.tsx` line, `progressLabel` batch form,
  `StockUploadControls.tsx` `stock-filter-status`, `rowlist.ts` predicate,
  `StockUploadBulkBar.tsx` count.
- Done: A8, and the run is legible while it works for hours.

### Step 9 — The idle sweep must not kill a long batch

- Test (failing): `tests/bridge_getty_web.test.ts` — a session whose upload request is in
  flight is not released when the 5-minute timer would have fired; after the request
  returns, the timer is armed again; a truly idle session still closes.
- Implement: `busy` flag in `routes.mjs` (`performUpload`, `handleGettyWebFinish`), sweep
  guard.
- Done: long batches cannot lose their browser.

### Step 10 — Docs and gates

- Update `docs/current/sor/stock-upload-getty-web.md` (§2 flow: N batches, retry pass; §4
  the 100-upload cap; §5 codes; §6 limits), `docs/current/selectors/stock-upload.md`
  (`stock-filter-status`, re-upload chip, batch label), `docs/current/sor/invariants/upload.md`
  (new invariant: *a Getty web run never sends more than one batch's file cap, completes a
  batch only after its own cards are ready, and never claims an icon whose retry is still
  pending*), `docs/current/sor/TESTS.md` + `sor/tests/<area>.md`, `sor/OWNERS.md`.
- Append one measured entry to `docs/current/QUALITY_RECHECK.md` (append without reading).
- Run: focused tests → `npx tsc --noEmit` → `npm run lint` → `npm run quality:changed` →
  `npm run verify:fast` → `npm run verify`.

---

## 9. Open questions and risks

1. **Is the cap counted in uploads or in physical files?** The plan counts **uploads**
   (100 icons, ≤ 200 files), which is what the report says. If Getty turns out to count
   physical files, the single constant drops the chunk to 50 pairs and nothing else
   changes. It is per batch, not per session.
2. **Batch-creation rate limit.** Unknown how fast Getty allows Create Batch after Complete.
   The helper keeps its 60 s control wait and one retry per batch; if this bites, the next
   lever is a short pause between batches, not a bigger chunk.
3. **Duplicates from an "unproven" retry.** An icon whose card appeared after the last page
   reading would be uploaded twice. Mitigated by the finish step's own final reading (a
   late card is then part of the completed batch and is removed from the queue) and by
   D5; not eliminated. The run says when an icon was retried as "unproven".
4. **One Complete per batch, then a new batch** — needs confirmation against a live account:
   does the contributor page return to the batches list, and is Create Batch immediately
   available? The helper is written against captured markup, so this is a `page` failure
   with a named step, not a silent hang.
5. **Run length.** 3 batches of 100 icons is hours of a background browser. Expectations
   must be set in the UI (batch i/n + cancel at the boundary); there is no parallel-batch
   plan here, because one browser + one session is what keeps the sign-in safe.
6. **Non-goals**: no change to Getty ESP API (`esp-https`), Adobe, Shutterstock paths; no
   cross-restart resume of the re-upload list beyond the honest `interrupted` journal
   status; no automatic re-run without the user pressing Upload.

---

## 10. What this document deliberately does not do

- It changes no `src/` or `tools/` file: the feature is planned, not implemented.
- It does not update the current SOR pages, because today's behaviour is still "one batch
  per run" — those pages change in Step 10, when the behaviour changes (RULE 17).
