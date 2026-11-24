# SVG builder — artboard export speed (2026-11-19)

Parent: [SVG builder](svg-builder.md) · sibling: [composition budget](svg-builder-performance.md), [upload export speed](upload-export-speed.md) · tests: `tests/svg_builder_export_speed_units.test.ts`, `tests/svg_builder_export_speed.test.tsx`, `tests/svg_builder_export_progress.test.tsx`.

Target: cut wall-clock time spent on `SVG builder` multi-artboard export (`exportSelectedArtboards` / `buildSheetPackage`) by **at least 80 %** (`<= 0.20×` baseline, `>= 5×` faster) across both default and full-stock formats while preserving every output and UX contract (RULE 5/7 incremental progress and mid-run Cancel, RULE 15/23 verified `export.json`-last commit, RULE 26 attribution-free `<= 1`-decimal direct geometry, RULE 27 `ProcessProgressBar`).

## Measured baseline vs optimized results (1,107-icon workspace, 7 × `6×4` artboards = 168 icons)

| Gate | Configuration | Baseline | Gate (`<= 0.20×`) | Verified | Speedup |
| --- | --- | --- | --- | --- | --- |
| **Per-sheet package CPU** (`buildSheetPackage`) | Full stock: SVG + PNG + built-in EPS + `expandStrokes` + `expandText` + `rescaleArtboard` (`20 MP`) + `optimizeSvg` + `cleanExport` | `12,797.5 ms` (`1,088 ms` without EPS quadratic regex) | `<= 217 ms` | **`~162 ms`** | **`98.7 %` cut (`79×`)** |
| **7-artboard default E2E** (`exportSelectedArtboards`, 2 ms FS round-trip) | SVG + PNG + `optimizeSvg` + `cleanExport` + `.usage.json` + React progress | `3,366 ms` (`570` `dirOps`, `7` probe `removeEntry`) | `<= 670 ms` | **`~410 ms`** (`31` `dirOps`, `0` probe `removeEntry`) | **`87.8 %` cut (`8.2×`)** |
| **7-artboard full-stock E2E** (`exportSelectedArtboards`) | SVG + PNG + built-in EPS + `expandStrokes` + `expandText` + `rescaleArtboard` (`20 MP`) + `optimizeSvg` + `cleanExport` | `~7,700 ms` | `<= 1,540 ms` | **`~1,240 ms`** | **`83.9 %` cut (`6.2×`)** |

## Root causes eliminated

1. **8–10 full `DOMParser` + `XMLSerializer` round-trips & ~30 DOM walks per sheet** (`sheetpackage.ts`, `solidpaint.ts`, `cleandom.ts`, `svgclean.ts`, `svgtidy.ts`, `svgdirect.ts`, `eps.ts`):
   - `prepareSheetDom` now runs `solidPaintDom`, `stripPreviewHooksDom`, `expandStrokes` (with inline un-transformed coordinate scaling to 1 decimal), `expandTextDom`, `rescaleSvgDom` (skipping already-scaled expanded paths), and `cleanSvgDom` (`skipReport: true`) on **one shared DOM** with one serializer pass, then passes the live `<svg>` `Element` directly to `writeEpsFromRoot` without re-parsing XML for EPS generation.
2. **Quadratic / redundant SVGO work on stitched sheets** (`lib/upload/optimize.ts`):
   - `optimizeSheetSvg` skips `O(M²)` cross-path `mergePaths` and nonlinear `makeArcs`, uses a fast structural/color plugin set on clean-export sheets without `<style>`, and fast-paths sheets that already satisfy every clean-sheet SVGO invariant while computing `sha256Hex` once (`sourceHash` reused by `recordOf`). Single-icon `optimizeSvg` remains unchanged.
3. **Quadratic regex backtracking & per-token allocations in built-in EPS verification and emission** (`lib/upload/epscheck.ts`, `epsmetadata.ts`, `epsclean.ts`, `epspath.ts`, `epspaint.ts`, `eps.ts`):
   - Replaced leading `[\s\S]*?` DSC/operator regexes and full-token array materialization in `verifyEps` / `stripEpsMetadata` with single-pass index/charCode state machines (`~11,500 ms` -> `< 3 ms` per 350 KB sheet EPS), charCode path command scanning in `epspath.ts`, and lazy gradient backdrop recording (`hasTransparentGradientRef`) in `writeEpsFromRoot`.
4. **Bezier stroke-offset golden-section churn & multi-parse cold icon compilation** (`geom/expand/offsetcheck.ts`, `geom/path.ts`, `lib/svgBuilder/svgAsset.ts`, `svgAssetNodes.ts`, `svgIconRoot.ts`, `lib/svgvalidate.ts`, `lib/svgpreview.ts`):
   - Added `t`-hint + 2-step Gauss-Newton + convex-hull derivative miss certification in `offsetFits` before recursive subdivision (`upload_offset_distance.test.ts` and `upload_offset_equivalence.test.ts` preserved bit-for-bit).
   - Cached parsed `<svg>` roots from `validateSvg` (`extractValidatedIconRoot`), shared `SANITIZED` entries across cell indices for ID-free icons, and replaced `Array.from(...).flatMap(...)` with `compileElementInto` in `svgAssetNodes.ts`.
5. **Uncached directory walks, sequential SVG/usage I/O, probe-file writes, and single-threaded PNG encoding** (`sheetexport.ts`, `artboardmeta.ts`, `usagestore.ts`, `sheetwriter.ts`, `exporter.ts`, `renameexport.ts`):
   - Wrapped `root` in `withDirCache(root)`, preloaded missing SVGs at high concurrency, overlapped `prepareSheetExportDir` and next-artboard `composeSheet` with artifact writes, wrote sibling artifacts in parallel before committing `export.json` last (RULE 23), skipped `.usage.json` `getFileHandle` probes via cached per-directory `listChildNames`, coalesced icon usage writes in `createUsageBatchSession`, eliminated probe-file creation/deletion in `fitStemToDir`, and routed `sheetPngBlob` through `OffscreenCanvas` worker encoding when available.
6. **Mid-batch React workspace churn & background mirror collisions** (`sheetexport.ts`, `SvgBuilderPanel.tsx`, `SvgBuilderArtboards.tsx`, `SvgBuilderTemplates.tsx`, `useSheetFileMirror.ts`):
   - Isolated `busy` ticks via `BuilderStaticPanels`, memoized `TemplatePreview` / `ArtboardPreview` on visual fields, deferred `useSheetFileMirror` timer flushes while `busy !== null`, and committed `artboards` + `discovery.usage` once at batch end.

## Owners

`src/svgBuilder/actions/{sheetexport,artboardmeta}.ts`, `src/svgBuilder/{sheetpackage,sheetwriter,usagestore,exporter,useSheetFileMirror,SvgBuilderPanel,SvgBuilderArtboards,SvgBuilderTemplates}.ts*`, `src/lib/svgBuilder/{svgAsset,svgAssetNodes,svgIconRoot}.ts`, `src/lib/{svgpreview,svgvalidate,fs}.ts`, `src/lib/upload/{optimize,solidpaint,svgclean,cleandom,svgtidy,svgdirect,svgdirectpath,expand,rescale,eps,epscheck,epsmetadata,epsclean,epspath,epspaint,jpegworker,raster}.ts`, `src/lib/upload/geom/{path,outline,stroke,expand/offset,expand/offsetcheck}.ts`, `src/upload/renameexport.ts`.
