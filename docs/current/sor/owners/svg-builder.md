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
| presentation | `src/svgBuilder/SvgBuilder*.tsx`, `svgBuilder.css` | dark controls, library, artboard, inspector, status, dialogs |
| shared provider / key | `src/lib/upload/gemini.ts`, `src/upload/configstore.ts`, `src/upload/keystore.ts`, `src/ui/PromptWindow.tsx`, `src/ui/KeySlot.tsx` | unchanged Gemini config, prompt presets and key vault |
| tests | `tests/svg_builder_*.test.ts*`, edited `tests/workbench_ui.test.tsx`, `tests/session.test.ts`, `tests/log_ui.test.tsx`, `tests/scroll_top.test.tsx` | TDD contracts and shell regressions |

No builder file writes into the selected root. Downloads and clipboard are the only delivery paths; accepted metadata and preset JSON are the only exported metadata.
