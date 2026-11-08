# ARCHITECTURE — Upload history (stockUpload tab)

Companion to [SPEC](SPEC.md) · implementation order in [STEPS](STEPS.md).
No code in this change; everything below is the integration contract.

## 1. What exists today (the seams to reuse)

| Concern | Owner today | What it means for this feature |
|---|---|---|
| The run | `src/stockupload/runupload.ts` `executeStockUploadBatch(plan, deps)` | One call = one run. It already loops targets and returns `UploadBatchSummary`. |
| Per-file result | `src/stockupload/statusflush.ts` `recordTaskResult(task, res, state)` | The **only** place every protocol (FTPS/SFTP/ESP/Getty web) passes through, with `PlannedTransfer` in hand. This is the capture hook. |
| Latest status per (item, stock) | `src/stockupload/historystore.ts` (`iconSplitter.stockUpload.history.v1`) | Stays exactly as it is. The new archive is additive; row status is not re-derived from it. |
| Crash journal | `src/stockupload/journal.ts` (`…journal.v1`) | Already marks unfinished items `interrupted` at boot. The batch index needs the same treatment (status `running` → `interrupted`). |
| Start/confirm | `src/stockupload/panelops.ts` `performConfirmUpload` → `depsFor` | The run id and root handle are here: the place to open and close a recorder. |
| Root full path | `src/lib/knownroots.ts` `boundRootPathInfo(root)` + `src/lib/rootpath.ts` | Read **once at run start** and freeze it into the batch. Never re-derive a past upload's path later. |
| Item identity | `ExportedItem.id` = `pair_<hash(dirPath/base+suffix)>` (`src/lib/pairing.ts`) | Stable only **within the same scanned root**; a different root or a scan starting lower gives new ids. Hence the 3-tier matcher in §6. |
| Selection | `src/stockupload/selectionactions.ts` (`stockUploadChecked`) | The batch selection must go through the same `commitSelection` path to land in undo. |
| List model | `src/stockupload/useStockUpload.ts` `items`, `visible`, `checked`, `header` | The dialog receives the API object (`StockUploadApi`) — no second source of rows. |
| Dialog slot | `src/stockupload/model.ts` (`StockDialog`) + `StockUploadDialogs.tsx` | Add one union member and one render branch; no new modal primitive. |
| Modal styles | `src/index.css` `.svg-backdrop`, `.svg-modal wide` | Reuse; only the 30 px row and thumb rules are new. |
| IDB plumbing | `src/batch/store.ts` (`DB_VERSION`, `idbGet/Put/Delete`, `preview`/`rootpaths` stores) | One new object store ⇒ **DB_VERSION 4 → 5** (same version never runs `onupgradeneeded`). |

## 2. Why an archive and not "extend the existing history map"

`StockHistoryMap` is `itemId → targetId → {status, formats, uploadedAt, error}`
— one slot per pair. Writing runs into it would destroy the previous answer,
which is the very thing being asked for. A batch also needs data that has no
place there: run id, counts, status per **file**, the root snapshot, and the
chunk. Two stores, two questions:

* *"Where does this row stand with each stock?"* → `historystore.ts` (unchanged).
* *"What did I upload, when, and from where?"* → the new batch archive.

## 3. Data model

Schema version `1` for both halves. Field names are frozen here; JSON is shown
instead of TypeScript so this stays a contract.

### 3.1 Batch index record (small, localStorage, read synchronously at boot)

```json
{
  "id": "8f1c…-stock-1",           // `${runId}::${targetId}` — idempotent per run+stock
  "runId": "8f1c…",
  "targetId": "preset-shutterstock",
  "targetName": "Shutterstock",
  "protocol": "ftps-explicit",
  "startedAt": "2026-11-08T14:22:07.114Z",
  "finishedAt": "2026-11-08T14:24:51.902Z",   // null while running
  "status": "running",             // running | complete | partial | failed | stopped | interrupted
  "rootName": "_split_output",
  "rootPath": "F:\\Stocks 2026\\…\\split_03", // frozen snapshot, "" when not captured
  "pathMissing": false,
  "counts": { "planned": 212, "attempted": 212, "uploaded": 209, "failed": 3, "icons": 106, "chunks": 3 },
  "limit": { "limit": 106, "of": 300 },        // omitted unless the Limit chip drew the run
  "files": 212,                                // how many file records were stored
  "truncated": false,                          // true when > MAX_FILES_PER_BATCH existed
  "error": "550 quota exceeded"                // last error, ≤300 chars, or null
}
```

### 3.2 File record (per batch, IndexedDB, loaded on demand)

```json
{
  "v": 1,
  "batchId": "8f1c…-stock-1",
  "files": [
    {
      "itemId": "pair_1a2b3c4d",
      "stem": "download-icon-06",
      "format": "raster",                     // raster | svg | eps | zip
      "fileName": "download-icon-06.jpg",
      "relPath": "…/split_03/export/download-icon-06.jpg", // relative to the scanned root
      "exportDir": "…/split_03/export",       // folder of the icon inside the root
      "bytes": 184320,                        // 0 when unknown (ZIP built in memory)
      "status": "uploaded",                   // uploaded | failed
      "error": null,
      "chunk": 2,                             // 1-based 100-icon batch, optional
      "at": "2026-11-08T14:23:10.001Z"
    }
  ]
}
```

Absolute path is **derived**, never stored twice:
`batch.rootPath + "\\" + relPath.replace(/\//g, "\\")`. That keeps a 2000-file
batch ~300 KB instead of ~600 KB and makes the "frozen at upload time" rule a
property of one field.

### 3.3 Envelope for the localStorage index

```json
{ "v": 1, "batches": [ /* newest last, §3.1 records */ ] }
```

## 4. Storage layout and lifecycle

### 4.1 Keys

| Where | Key | Size per unit | Cap |
|---|---|---|---|
| localStorage | `iconSplitter.stockUpload.batchHistory.v1` | ~450 B per batch | 300 batches (100 per stock) |
| IndexedDB `iconSplitter` store `stockUploadBatchFiles` (new, DB v5) | `<batchId>` | ~150 B per file | 2000 files/batch, 300 batch records |

`DB_VERSION` becomes `5`; `upgrade()` creates `stockUploadBatchFiles` if absent.
No existing store, key or record is touched — pure addition (RULE 13: everything
read is validated, junk drops to `{}`).

### 4.2 Validation rules (both directions)

* batch `id`, `targetId`, `targetName`, `status` ∈ known enumerations, ISO-parseable
  `startedAt`; unknown status ⇒ `interrupted`; unknown format ⇒ file skipped.
* `counts` clamped to `0…100000`; inconsistent counts recomputed from `files` on
  read when the list is present.
* `rootPath` passes `isFolderPathText()` after `normalizeRootPath()`; anything
  else becomes `""` + `pathMissing: true`. **Never invent a path** (RULE 4/I-39).
* error strings ≤300 chars, control characters stripped.
* an unreadable index ⇒ empty archive, one toast on first open, app unaffected.
* file record with a different `v` or a mismatched `batchId` ⇒ ignored.

### 4.3 Retention

Prune on every finalize, cheapest first:

1. drop batch metas beyond **100 per target**, oldest `startedAt` first;
2. then beyond **300 total**;
3. delete the matching IDB file records for every dropped id (fire-and-forget);
4. never prune `running` batches — they become `interrupted` first.

A stock whose preset was deleted keeps its history (the dialog shows
`(preset removed)`) until retention removes it.

## 5. Capture lifecycle (the only write path)

```
performConfirmUpload
  ├─ rootPath = boundRootPathInfo(root)        ← sync read, no clipboard/permission
  ├─ recorder = openBatchRun({ runId, plan, root, rootPath, startedAt })
  ├─ deps.onFileResult = recorder.fileResult   ← new optional dep
  ├─ executeStockUploadBatch(plan, deps)
  └─ recorder.finish({ cancelled, summary })
```

Per target, inside the runner, nothing new is needed **except** one line in
`recordTaskResult` calling `state.deps.onFileResult?.(event)` with
`{ target, task, ok, reason, chunk: state.batch, at }`. That single hook covers
FTPS, SFTP, ESP and Getty web (Getty's `recordIconOutcomes` already funnels every
icon through `recordTaskResult`).

Cases the recorder must own (each one is a test):

| Case | Behaviour |
|---|---|
| normal end | every target's batch → `complete` / `partial` / `failed` from its own counters |
| `Limit` / random batches | `limit` block copied from `plan.limit`; files carry no special flag |
| user cancel | `stopped`; attempted files kept; `planned` stays the plan size |
| missing credentials | `recordMissingCreds` must receive `targetTasks` (small signature change) so it can emit one `failed` file per planned transfer with the reason |
| crash mid-run | meta written as `running` at open; `recoverOpenBatches()` at boot flips it to `interrupted`, `finishedAt: null` |
| run with 0 files | never opened (preflight already refuses, but guard anyway) |
| storage blocked | recorder degrades to in-memory; one toast; the upload is never blocked or slowed |

Flush cadence (persistence must never sit in the transfer path):

* meta write on open, on each chunk boundary, on target end, on finish;
* file list write on chunk boundary, every 25 results, on target end, on finish;
* every IDB write is `void`-launched with a catch; failures only set
  `recorder.degraded = true`.

Ordering guarantee: file records are appended in transfer order, so the list the
user sees is the order the site received them (matters for `Random batches`).

## 6. Matching a batch file to the current list (pure, tested)

`src/lib/stockupload/batchmatch.ts` answers one question: *which rows of the
current scan are these files?* It returns a plan, not side effects:

```json
{
  "matchedItemIds": ["pair_…"],
  "matchedFiles": 118,
  "missing": 82,
  "hiddenByFilter": 14,
  "allChecked": false
}
```

Three tiers, first hit wins, ambiguity refuses:

1. **Identity** — `itemId` equal. Only valid when the scan graph is the same
   (same root picked the same way).
2. **Anchored path** — both the batch `rootPath` and the current root's captured
   path are non-empty and equal (case-insensitive, `normalizeRootPath`), and
   `exportDir` + `stem` are equal.
3. **Tail path** — same `rootName` and the batch's `exportDir/stem` is a path
   suffix of the current item's `exportDir/stem` (or vice versa) — covers
   "scanned a parent" / "scanned the `export` folder itself". Two candidates ⇒
   no match (never guess).

Never matched by `stem` alone. Items matched twice by different files collapse
into one id. `hiddenByFilter` = matched ids present in `g.items` but absent from
`g.visible`; they are **still selected** (SPEC §6).

## 7. Modules, responsibilities and RULE 16 budget

| New file | Owns | Est. lines | Notes |
|---|---|---|---|
| `src/lib/stockupload/batchschema.ts` | types, enums, `parseBatchIndex`, `parseBatchFiles`, serialize, prune | ~220 | pure, no storage, no React |
| `src/lib/stockupload/batchpath.ts` | root snapshot + `relPath` → folder path / full file path text; `isUsablePath` | ~80 | wraps `normalizeRootPath`, no new rules |
| `src/lib/stockupload/batchmatch.ts` | §6 matcher + `planBatchSelection` (toggle, counts, dedupe) | ~150 | pure |
| `src/stockupload/batchstore.ts` | localStorage index + IDB file lists, in-memory cache, `subscribeBatchHistory`, `loadBatchFiles`, `pruneBatches`, `recoverOpenBatches` | ~200 | async reads, sync index |
| `src/stockupload/batchrecorder.ts` | §5 recorder: `openBatchRun`, `fileResult`, `targetEnd`, `finish`, degradation | ~200 | no React, injectable clock/id |
| `src/stockupload/historyview.ts` | view model: grouped stock options, batch rows, counts, date/outcome labels, `truncated` note | ~140 | pure formatting, unit-tested |
| `src/stockupload/UploadHistoryDialog.tsx` | modal shell, Esc/backdrop, level routing | ~130 | ≤15 hooks |
| `src/stockupload/UploadHistoryTargetSelect.tsx` | dropdown | ~60 | |
| `src/stockupload/UploadHistoryBatchList.tsx` | level 1 list + row | ~130 | |
| `src/stockupload/UploadHistoryBatchDetail.tsx` | level 2 header, select-all, file list | ~160 | |
| `src/stockupload/UploadHistoryFileRow.tsx` | one 30 px row | ~110 | memoized |
| `src/stockupload/UploadHistoryThumb.tsx` | 22 px thumb + preview popover + live resolution | ~140 | reuses `readBytesAt`/`createObjectURL`, revokes on unmount |
| `src/index.css` (edit) | `.stock-history-*` rules, `--history-row: 30px` | ~120 | additive |

Touched files (small edits): `model.ts` (+1 dialog kind, +1 session field
`historyTargetId`, +1 `historyOpenBatchId`), `panelops.ts` (+5 ops: `openHistory`,
`openHistoryBatch`, `backToHistory`, `selectHistoryTarget`, `selectHistoryFiles`),
`selectionactions.ts` (+`selectBatchFiles(ids)` via the existing
`commitSelection`), `useStockUpload.ts` (expose ops + `items`), `batchtypes.ts`
(+`onFileResult`), `statusflush.ts` (+1 call, +`targetTasks` on
`recordMissingCreds`), `runupload.ts` (pass `targetTasks`), `StockUploadControls.tsx`
(+button), `StockUploadDialogs.tsx` (+branch), `batch/store.ts` (DB v5 + store
constant).

Every callback stays under 30 body lines; the dialog splits by level rather than
by line count.

## 8. UI wiring

```
StockUploadPanel
└─ StockUploadControls            + <button data-testid="stock-history-open">
└─ StockUploadDialogs
   └─ model.dialog.kind === "uploadHistory"
      └─ UploadHistoryDialog  (receives { api, targetId, openBatchId, ops })
         ├─ UploadHistoryTargetSelect   ← historyview.stockOptions()
         ├─ UploadHistoryBatchList      ← batchstore index (subscribed)
         └─ UploadHistoryBatchDetail    ← loadBatchFiles(openBatchId)
            ├─ select-all → lib/batchmatch.planBatchSelection → ops.selectHistoryFiles
            └─ UploadHistoryFileRow → UploadHistoryThumb (+ popover)
```

State ownership:

* **Archive** → `batchstore` module state + `useSyncExternalStore` (same pattern
  as `historystore`/preset stores).
* **Which batch is open, which stock filter** → `model` (`dialog` payload +
  session fields), so Esc/back/close are reducer actions and testable.
* **File list of the open batch** → local `useEffect` fetch + `{loading, files,
  failed}`; loading shows a 3-line skeleton, failure shows
  `This batch's file list could not be read.` (never an empty list lie).
* **Preview popover** → local to `UploadHistoryThumb`; only one open because the
  detail passes the open row id down. No portal needed (the modal scrolls).

## 9. Selection integration (RULE 25)

`selectHistoryFiles(batchId)` lives in `panelops` and does:

1. `planBatchSelection(files, g.items, g.visible, g.checked)` → ids + counts (pure);
2. `commitSelection(hist, { …current, checked: setChecked(cur, ids, !allChecked) }, "Select batch files")`;
3. `say(...)`/inline note with the counts from SPEC §6.

Because it reuses `commitSelection`, the entry is a normal `stockUploadChecked`
record: Q/E, arrows, filters and undo/redo keep working, and eligibility gates
of the tab are unchanged (the tab has no per-row eligibility beyond discovery).

## 10. Privacy, honesty and failure rules

* No credentials, no API keys, no metadata text, no prompts, no image bytes enter
  the archive (RULE 20 / I-24). Paths are user-local paths, same class of data as
  `rootpaths` (already stored).
* A path that is not a folder path is not stored; a run without a captured path
  is labelled `pathMissing`, not guessed (I-39/I-46).
* Empty ≠ broken: no history, no batch, no files, and unreadable store are four
  distinct messages (RULE 4).
* History writes never fail an upload: all persistence is detached and degraded
  mode is surfaced once.
* `interrupted` is a first-class outcome and is never retried automatically
  (same contract as `journal.ts`).
* No live provider calls, no new network traffic: the feature is 100 % local.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| localStorage quota shared with log/presets | index capped at 300 × ~450 B ≈ 135 KB; file lists in IDB |
| IDB upgrade blocked by another tab | existing `openDb` behaviour: degrade in memory, retry next call; recorder degrades with one toast |
| 2000-row list jank | 30 px rows, memoized row, thumbnails via existing `LazyPreview`/IntersectionObserver, cap + truncation note |
| item ids unstable across roots | tier 2/3 matcher by path + stem, ambiguity refuses |
| users expect "batch" = 100 icons | chunk number shown per file; Q2 open |
| path snapshot changes because user re-captures | frozen at run start; old history never rewritten |
| stale preview after Rescan | thumb keyed by `rootToken` + `batchId`, effect re-runs |
| feature creep into "re-upload this batch" | out of scope v1; the archive's file records already carry everything a re-upload needs — note it as a follow-up, not silently |
