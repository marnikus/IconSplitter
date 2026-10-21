# Batch folders — current behaviour

See [invariants/batch.md](invariants/batch.md), [path/scope invariants](invariants/paths.md), [batch selectors](../selectors/batch.md), [storage](STORAGE.md) and [test owners](TESTS.md).

## Behaviour

Batch folders:

* Pick a source root (readwrite handle). Recursively scans all images; the
  output folder `_split_output` is ignored during scans (configurable list).
* Only `name_AI.ext` images with an optional numeric tail (`name_AI_7.ext`,
  `name_AI_9_01.ext` — the shapes batch outputs use) are eligible; the reference
  `name.ext` is linked, never processed, and copied into every `split_NN`
  subfolder. Missing reference → warning + user may skip or continue.
* Review window: thumbnail, filename, relPath, status badge
  (unprocessed/processed/skipped/changed/missing/deleted), checkbox, Select visible/Deselect all.
  Its active row and checked rows are independent: Batch owns the shared
  [RULE 25 gesture matrix](../rules/BEHAVIOR.md#rule-25) (I-73). Plain row click
  only activates/anchors; checkbox and modifiers change checks, with Shift
  replacing the visible-order range. Header tri-state is scoped to visible
  eligible rows (missing/deleted are not selectable), while Deselect all clears
  hidden checks too. A successful scan checks all eligible rows by default;
  each click or checkbox change is a separate global `batchChecked` undo entry;
  consecutive arrow navigation may coalesce, never undoing written split files.
* Presets store every configurable value (source/dest handles in IndexedDB,
  config in localStorage); last-used preset restores automatically.
* Processing: rescan runs before each batch; per-item progress, per-item
  failure isolation, Stop button honoured between items.
* Output tree (2026-10-16): `<root>/_split_output/YYYY-MM/YYYY-MM-DD/<src-hierarchy>/<src-stem>/split_NN/<stem>_NN.png`
  (+ reference copy), or the same structure directly inside a custom destination.
  A run is a DAY — extra exports the same day land in the same day folder; the
  re-split item itself gets `_v02…` (never overwrites; collisions appended after
  any existing `_AI_7`). Trees written before 2026-10-16 keep their
  `<YYYY-MM-DD_HH-mm-ss>` run level and stay first-class (`isRunStamp` matches
  both forms; I-50).
* State JSON `<base>.json` lives beside the reference; refreshed after every
  scan and batch; corrupt payloads are rejected and rebuilt (RULE 13).
* "Open in File Explorer" is impossible from a browser — the action copies the
  path and says so honestly (RULE 4/9).

## State

Batch model (`useBatch.ts`):

```
root, dest              FileSystemDirectoryHandles (dest null => auto)
rows: Row[]             Row = AiImageEntry + status + selected
keys: StateKey[]        which <base>.json files are known
preset                  Preset (split settings, ignore list, dest mode…)
busy / toast            progress + honest reporting surfaces
```

Status transitions per source record: `unprocessed → processed | skipped |
deleted`; file changed → `changed` (re-selectable); file gone at scan → `missing`
(retained in JSON); gone during processing → `deleted` (skipped safely, batch
continues).

## Flow

Batch:

* **Scan:** root handle → `readDirTree` (ignore list) → `walkTree` (canonical
  order) → `collectAiImages` → `linkReferences` → `syncAndCollect` rewrites
  every `<base>.json` → rows render with statuses.
* **Review/SVG scan (one path, two tabs):** ticket → `readDirTree` → `walkTree`
  → `pairEntries` → decisions → complete snapshot → `scanKey` compare → one
  commit (rows, discovery, root token, checked ids) → best-effort index +
  report. Nothing is written to the root, nothing is committed by a superseded
  scan, and an unchanged snapshot commits nothing.
* **Process:** selection → rescan-derived items → `planBatch` (collision-safe
  folders) → per item: load → `splitSheet` → write `split_NN/<stem>_NN.png`
  via no-overwrite writes → copy reference per split dir → `applyOutcomes`
  persists statuses → UI mirrors (RULE 24). Stop is honoured between items.
* **Presets:** save/load/delete in localStorage; directory handles persisted
  in IndexedDB per preset name; last-used preset auto-restores on open.

The persistent header now reuses the app-wide [process progress layout](process-progress.md); existing controls and selectors remain unchanged.
