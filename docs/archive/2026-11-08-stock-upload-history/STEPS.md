# STEPS — implementation plan (Upload history)

Order matters: data first, capture second, UI third, docs last. Every step is
TDD (RULE 8): witness the failing focused test, implement, run it green. No step
may exceed the batch cap or RULE 16 gates.

Read pack for a step: [AGENTS](../../AGENTS.md) → [router](../../current/README.md)
row **Upload (FTPS)** → [sor/stock-upload](../../current/sor/stock-upload.md)
→ [selectors/stock-upload](../../current/selectors/stock-upload.md).

## Step 0 — confirm the five open decisions

Answer SPEC §8 (location payload, batch granularity, preview memory, `All stocks`
option, keep failed runs). Every later step assumes the recommended answers, so
changing one later costs a rewrite of a component, not a refactor.

**Done when:** the answers are recorded at the top of `SPEC.md`.

## Step 1 — pure schema (`lib/stockupload/batchschema.ts`)

* Tests first: `tests/stockupload_batch_schema.test.ts`
  * valid index round-trips; `v` mismatch ⇒ empty; corrupt JSON ⇒ empty;
  * unknown `status` ⇒ `interrupted`; unknown `format` ⇒ file dropped;
  * counts clamped; `truncated` respected; ISO dates validated;
  * retention: 101 batches for one target ⇒ oldest dropped;
  * 301 batches total ⇒ oldest dropped; `running` never dropped;
  * file-list record with wrong `batchId`/`v` ⇒ ignored.
* Exports: `BATCH_INDEX_KEY`, `BATCH_DB_STORE`, `MAX_*` constants,
  `parseBatchIndex/serializeBatchIndex/parseBatchFiles/serializeBatchFiles/pruneBatches`.

**Gate:** focused test green, `npx tsc --noEmit`.

## Step 2 — path rules (`lib/stockupload/batchpath.ts`)

* Tests: `tests/stockupload_batch_path.test.ts`
  * `F:\a\b` + `x/y/export/icon.jpg` ⇒ folder `F:\a\b\x\y\export`,
    full file `…\icon.jpg`;
  * forward slashes normalised, no doubled separators, UNC preserved;
  * empty/invalid snapshot ⇒ `null` + `pathMissing`, never a made-up path;
  * a relative `relPath` alone never yields an absolute path.
* Reuse `normalizeRootPath`/`isFolderPathText` — do not add a second normaliser.

## Step 3 — persistence (`stockupload/batchstore.ts` + DB v5)

* `src/batch/store.ts`: `DB_VERSION = 5`, `createObjectStore("stockUploadBatchFiles")`
  in `upgrade()`, export the store name. Tests exist for older stores — extend
  `tests/batch_preview_restart.test.tsx` style coverage to assert v5 creates the
  store on an existing v4 database.
* Tests: `tests/stockupload_batch_store.test.ts` (fake-indexeddb)
  * boot with an empty store ⇒ `[]`, no throw;
  * `appendBatch` then `loadBatches` returns it newest-last; subscribe fires once;
  * `loadBatchFiles(id)` reads only that record, caches it, second call does not
    hit IDB;
  * quota/`indexedDB === undefined` ⇒ in-memory only, `degraded` true, no throw;
  * prune deletes file records of dropped batches;
  * `recoverOpenBatches()` flips `running` → `interrupted`, returns the count,
    is idempotent per boot.

**Gate:** focused tests green; `npm run quality:changed` on the new files.

## Step 4 — recorder (`stockupload/batchrecorder.ts`)

* Tests: `tests/stockupload_batch_recorder.test.ts` (injectable clock + fake store)
  * one run × three targets ⇒ three batches with the right names/counts;
  * per-file events append in order, format/status/error preserved;
  * chunk label reaches `chunk`; missing chunk ⇒ field absent;
  * cancel ⇒ `stopped`, `planned` unchanged, attempted files kept;
  * `recordMissingCreds` path ⇒ every planned transfer `failed` with its reason;
  * flush every 25 results and at chunk boundary; no write per file;
  * empty plan ⇒ no batch; degraded store ⇒ upload path unaffected;
  * `id` collision on a repeated finish is idempotent (same runId+target).

## Step 5 — wire capture into the runner

* `batchtypes.ts`: add `onFileResult?: (event: FileResultEvent) => void`.
* `statusflush.ts`: call it in `recordTaskResult`; pass `targetTasks` into
  `recordMissingCreds` (from `runupload.ts`, where they exist).
* `panelops.ts`: open the recorder in `performConfirmUpload` with the frozen root
  path (`boundRootPathInfo(root)`, sync), attach `onFileResult`, `finish()` in a
  `finally` so a thrown run still closes the batch.
* `model.ts`: `recoverOpenBatches()` on boot (async, subscribes).
* Tests: extend `tests/stockupload_runner.test.ts` + `stockupload_ftp_batches.test.ts`
  * a normal run records exactly the files the log reported;
  * a failed file is recorded `failed` with the same reason the log carries;
  * Getty web run records per-icon pairs once (no duplicate EPS entry);
  * a cancelled run still finalizes; a missing-credential run records failures;
  * no history write happens when the plan is empty.
* Assert **no new network call and no credential/prompt/metadata text** in the
  stored JSON (string scan of the payload).

**Gate:** focused suites + `npm run verify:fast` (regression risk is here).

## Step 6 — matcher and selection planner (`lib/stockupload/batchmatch.ts`)

* Tests: `tests/stockupload_batch_match.test.ts`
  * tier 1 id hit; tier 2 same captured root + `exportDir/stem`;
  * tier 3 suffix match across a parent/child pick; two candidates ⇒ none;
  * JPEG+EPS of one icon ⇒ one id; `hiddenByFilter` counted, still selected;
  * `allChecked` toggles to deselect; zero matches ⇒ explicit result.

## Step 7 — view model (`stockupload/historyview.ts`)

* Tests: `tests/stockupload_history_view.test.ts`
  * stock options include disabled "no uploads yet" rows and deleted presets;
  * batch row labels: counts, `failed`, `limit`, `stopped`, `interrupted`;
  * date formatting is local and stable under a fake timezone;
  * newest-first ordering; `Showing the latest 200 of N` threshold.

## Step 8 — dialog UI

Components in the order they can be tested: `UploadHistoryFileRow` +
`UploadHistoryThumb` → `UploadHistoryBatchDetail` → `UploadHistoryBatchList` →
`UploadHistoryTargetSelect` → `UploadHistoryDialog`.

* Tests: `tests/stockupload_history_ui.test.tsx` (RTL, `fake-indexeddb/auto`,
  seeded archive; no network)
  * button opens the modal, Esc/Close/backdrop closes;
  * dropdown filters batches; empty states show the exact copy;
  * opening a batch lists 30 px rows with name, format, status; the CSS variable
    is asserted (`--history-row: 30px`);
  * clicking a thumb opens exactly one popover, Esc closes it;
  * a file with a captured path copies the folder path
    (`navigator.clipboard.writeText` spy) and the toast says `Copied folder path`;
  * a file without a captured path has a disabled location button, honest title;
  * `Select all files` checks the matched rows, pushes one
    `stockUploadChecked` entry, shows the counts note, and a second click
    deselects; zero-match note is the honest one;
  * undo restores the previous selection while the dialog stays open;
  * a 2001-file batch shows the truncation note; unreadable file record shows the
    read-failure line, not an empty list.
* CSS in `src/index.css` (additive), one selector block per element; no inline
  layout except the 22 px thumb.

**Gate:** focused UI tests, `npx tsc --noEmit`, `npm run lint`,
`npm run quality:changed` (component/hook caps).

## Step 9 — docs and selectors (RULE 17, same change)

* New `docs/current/sor/stock-upload-history.md` (behaviour, storage, lifecycle,
  matching, retention, honesty rules; ≤9 KB, split if it grows).
* `docs/current/sor/stock-upload.md` §4: one link line to the new page.
* `docs/current/selectors/stock-upload.md`: new "Upload history" section with
  every `stock-history-*` handle in the same table style.
* `docs/current/sor/STORAGE.md`: new rows for the index key, the IDB store and
  DB v5; note the additive upgrade.
* `docs/current/sor/OWNERS.md` + `docs/current/sor/TESTS.md`: owner and test rows.
* `docs/current/README.md`: add the page to the Upload row's detail links.
* Append one measured dated entry to `docs/current/QUALITY_RECHECK.md`
  **without reading the ledger**.
* `docs/HISTORY_INDEX.md`: this folder is already indexed (2026-11-08); append the
  shipped status to the row when the work lands — never rewrite the plan itself.

## Step 10 — verification and delivery

* Focused suites per step, then `npm run verify:fast` (before commit) and
  `npm run verify` (before push). On Windows, if the native runner fails before
  its lanes start, run the lanes separately and report that failure instead of
  claiming the aggregate passed.
* Manual smoke on Chrome/Edge with a real `export/` tree and a helper-fed
  FTPS/`getty-web` run **without live provider calls** (helper fixtures only):
  open history, check counts, open a batch, preview, copy location, select all,
  undo.
* Commit scoped with `Verified:` and the required attribution; push
  `arena/921b3aaf-iconsplitter`.

## Definition of done

```text
[ ] every SPEC §3–§6 control exists with its data-testid
[ ] one batch per run per stock, per-stock grouping in the dropdown
[ ] each batch shows file count + upload date; opens to 30 px file rows
[ ] thumbnail popover previews bigger; unavailable files say so honestly
[ ] Location copies the frozen absolute folder path (or is disabled with a reason)
[ ] Select all files checks the current list's matching rows, in one undo step,
    and reports what is not there
[ ] interrupted/stopped/missing-credential runs are recorded truthfully
[ ] no credentials, prompts, metadata text or image bytes in the archive
[ ] retention caps hold; corrupt storage never breaks the tab
[ ] current docs, selectors, storage map and test index updated in the same change
[ ] tsc, lint, quality gates, verify:fast and verify green (or honestly reported)
```
