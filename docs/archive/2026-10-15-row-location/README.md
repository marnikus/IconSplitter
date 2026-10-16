# Row "Location" button — copy the split-output folder of a processed item

2026-10-15 · status: implemented same day (TDD: `tests/batch_row_locate.test.tsx`).

## 1. The request

> "after processed item row shows the btn - location - copy the path to root
> folder where are four splitted icon stored"

After a run, each processed row must show a **Location** button that copies the
path of the folder holding that item's four splits.

## 2. The layout facts (existing, verified)

An item `Category-A/icon-award-ribbon_AI.png` written at 2026-09-30 14:32:08
lands as `<dest>/2026-09/2026-09-30_14-32-08/Category-A/icon-award-ribbon_AI/`,
and that item folder contains `split_01` … `split_04` — one split PNG plus the
reference image in each (`process.ts` `writeSplits`, locked by
`process.test.ts`). So the folder to copy is `<dest>/<plan.relFolder>`:
the **root folder of the item's four split icons**.

`dest` is either the user's custom pick or, in auto mode, `<root>/_split_output`
(`OUTPUT_DIR`, `lib/batchlayout`). A browser cannot know absolute paths — the
honest base rules live in `lib/copypath`/`lib/rootpath` (I-63, I-29): a
captured Explorer path when bound, else the handle's own name.

## 3. Design

- `process.ts`: `ItemResult.outRel` — the item's output folder relative to
  `dest`, set when (and only when) files were actually written; `""` otherwise.
- `useBatchTypes.ts`: `Row.outRel?` — session-scoped, stamped onto rows by
  `finalize` when the run's results come back. **Scope decision:** not persisted
  into the per-entry state JSON — a reload keeps the "processed" badge but the
  button hides (the old run's stamp is unknowable); re-running restores it.
  Persisting the stamp is a possible follow-up.
- `lib/copypath.ts`: `splitOutputBase(dest, root)` (honest base: custom dest's
  bound path → its name → root's bound path/name + `_split_output`) and
  `copySplitFolderText(...)` — same clipboard + toast pattern as
  `copyFolderText` (RULE 9: the toast says a path was copied, because a browser
  cannot open Explorer).
- `ScanStatusCell`: the button `batch-row-locate-<relPath>` ("📍 Location")
  under the status badge, only when the row has an output folder.
- `BatchPanel`: looks the row up in state and copies
  `<base>\<outRel>` (Explorer separators via `folderCopyText`).

## 4. TDD gates

1. `splitOutputBase` unit matrix: custom dest with bound path / custom dest
   name-only / auto via root / no handles at all.
2. `processItems` sets `outRel` to the planned rel folder on `processed`, `""`
   on `skipped`.
3. Component: before a run there is no button; after approve + split the
   processed row shows `batch-row-locate-…`, clicking it writes
   `size_root\_split_output\2026-10\<stamp>\icon-a_AI` to the clipboard and
   raises the confirming toast.
