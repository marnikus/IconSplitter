# Owners — sheets and batch

Choose the row for your change, then open that source file. Part of the [owner map](../OWNERS.md).

| Layer | Files | Owns |
|---|---|---|
| Mode shell | `src/ui/Workbench.tsx`, `src/main.tsx` | Sheets/Batch tab switch |
| Sheets UI | `src/App.tsx`, `src/utils/cn.ts` | sheet state, controls, export paths |
| Detection | `src/lib/detect.ts` | `analyze` (mask), `detect` (boxes, auto radius, reading order) |
| Rendering | `src/lib/render.ts` | `squareInfo`, `cropRect`, `renderIcon`, `canvasToBlob` |
| Naming (batch) | `src/lib/naming.ts` | `_AI` parse, split names, variations, batch path |
| Scan (batch) | `src/lib/scan.ts` | tree walk, eligibility, ref linking, diff |
| State JSON | `src/lib/statefile.ts`, `src/batch/statewrite.ts` | model + merge + validation; file sync + outcomes |
| Output plan | `src/lib/output.ts` | month/timestamp layout, `_vNN` allocation |
| FS adapter | `src/lib/fs.ts`, `src/batch/picker.ts` | no-overwrite IO, relative byte/text reads and non-creating presence probes, tree read, folder picking |
| Batch split | `src/lib/batchsplit.ts`, `src/lib/dom.ts` | sheet→blobs orchestration; image loading |
| Batch UI | `src/batch/useBatch.ts`, `BatchPanel.tsx`, `ScanTable.tsx`, `PresetBar.tsx`, `store.ts`, `previewPersist.ts`, `../lib/batchmerges.ts` | orchestration, review window, presets, persistence, stored split previews (restart restore, RULE 13 validation), per-preset row merges (I-67) |
