# Owners — SVG builder

Back to the [owner map](../OWNERS.md) and [behaviour contract](../svg-builder.md). Layer direction is UI → app integration → pure domain; pure modules never import React, filesystem or provider code.

| Area | Source | Responsibility |
|---|---|---|
| Workbench tab | `src/ui/Workbench.tsx`, `src/lib/session.ts` | seventh tab id, lazy hidden workspace, session parser |
| global state | `src/state/appstore.ts`, `src/state/useAppState.ts`, `src/state/apply.ts`, `src/state/listtargets.ts`, `src/state/listviewstore.ts` | builder slice, selector, one undo applier, checked-id registry |
| pure domain | `src/lib/svgBuilder/*` | types, config, geometry, catalog, selection, metadata, sanitized cells, composition, preset, undo payload |
| all-folder discovery | `src/upload/discovery.ts`, `src/svgBuilder/discovery.ts` | recursive approved-source rows and honest audit |
| repository / scanning | `src/svgBuilder/repository.ts`, `src/svgBuilder/scan.ts` | read-only SVG text/preview cache, remembered root, one scan ticket |
| provider bridge | `src/svgBuilder/preview.ts`, `src/svgBuilder/runSheetMetadata.ts` | bounded JPEG, one explicit Gemini request |
| state integration | `src/svgBuilder/model.ts`, `useBuilder*.ts`, `undoBinding.ts`, `actions/*` | reducer, persistence, computed projection, stable action slices |
| JSON files and Register | `src/lib/svgBuilder/{sheetsync,registerplan}.ts`, `src/svgBuilder/{filesigstore,sheetfiles,sheetwriter,useSheetFileMirror,autoregisterstore}.ts`, `src/svgBuilder/actions/{register,sheetsync,sheetjson,templatefolder}.ts` | fingerprints; files follow the saved state; Register adds new folders and reads back outside edits (2026-11-22) |
| removing templates / artboards | `src/lib/svgBuilder/removal.ts`, `src/svgBuilder/{sheetmove,artboardsundo,useArtboardUndo}.ts`, `src/svgBuilder/actions/sheetlists.ts` | one undo step per removal; folders into / out of `_artboard_sheets/.removed versions` (2026-11-22) |
| vector index | `src/lib/iconIndex/{record,similarity}.ts`, `src/svgBuilder/indexer/*`, `src/svgBuilder/useIconIndex.ts`, `src/svgBuilder/actions/indexing.ts`, `src/vendor/transformers/*` | index file, freshness, balanced similarity, worker models, IndexedDB model cache, run/cancel |
| stage walking | `src/svgBuilder/{stagenav,useStageHotkeys}.ts`, `src/svgBuilder/actions/stagenav.ts`, `SvgBuilderEditingLabel.tsx` | ◀ ▶ and ← → templates, ↑ ↓ artboards (2026-11-23) |
| big icons | `src/lib/svgBuilder/merges.ts`, `layout.ts` `mergedCells`, `src/svgBuilder/actions/merges.ts`, `SvgBuilderQuickMerge.tsx`, `useSvgBuilder` / `useBuilderActions` (slots ↔ positions) | 2 × 2 cells → one big icon (2026-11-23) |
| icon styles | `src/lib/svgBuilder/{iconstyles,stylepaint}.ts`, `src/svgBuilder/actions/styles.ts`, `SvgBuilderControls.tsx` `StyleFilterControl`, `SvgBuilderColoredStyle.tsx`, `quickedit.ts` (`styled`) | STYLES filter; colored icons drawn with their own paints, strokes / fills set apart (2026-11-23) |
| presentation | `src/svgBuilder/SvgBuilder*.tsx`, `exportprogress.ts`, `briefText.ts`, `svgBuilder.css` | header, folder bar, library + recipe, stage + artboard overlays, Customize sections, export menu, live artboard export progress bar, toast, dialogs — app-theme styles only |
| shared provider / key | `src/lib/upload/gemini.ts`, `src/upload/configstore.ts`, `src/upload/keystore.ts`, `src/ui/PromptWindow.tsx`, `src/ui/KeySlot.tsx` | unchanged Gemini config, prompt presets and key vault |
| tests | `tests/svg_builder_*.test.ts*`, edited `tests/workbench_ui.test.tsx`, `tests/session.test.ts`, `tests/log_ui.test.tsx`, `tests/scroll_top.test.tsx` | TDD contracts and shell regressions |

No builder file writes into the selected root. Downloads and clipboard are the only delivery paths; accepted metadata and preset JSON are the only exported metadata.
