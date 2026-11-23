# Tests — SVG builder

Back to the [test index](../TESTS.md) and [behaviour contract](../svg-builder.md). Every suite uses real modules, synthetic pair files, in-memory filesystem fakes or happy-dom; no live provider call occurs.

| Suite | Pins |
|---|---|
| `tests/svg_builder_domain.test.ts` | config presets/parsers, geometry, catalog filter, deterministic selection and locks, short-pool honesty, metadata parsing/acceptance, sanitized SVG cells, approved-id traceability, composition fingerprint, broken sources and preset round-trip |
| `tests/svg_builder_parity.test.ts` | reference rules: range clamping, empty title kept, defaults, three layout presets (copy kept), fitted centred grid, shrink-only overflow, stroke-aware glyph, tokenised profile score, Similar/Filtered/locks/top-up shortfall, grow/shrink, recipe captions, `#tag` profiles from export metadata, `#` search, banner wrap, all 8 banner styles valid, ids beyond the grid, slug and reference preset shape |
| `tests/builder_export_settings_ui.test.tsx` | the builder's Export settings popup (shared shell, Close/Escape/backdrop), each row once, PNG px note, one patch per gesture, all-off warning, EPS live-text note |
| `tests/export_stroke_width.test.ts` | the files paint what the artboard set: the cell `stroke-width` IS the set px (1 / 1.4 / 2.5), no `non-scaling-stroke`, the EPS pens match, stroke expansion grows each outline by half that pen |
| `tests/export_clean.test.ts` | the clean switch: no `data-*`/provenance/float noise, one xmlns, DC tags back, px/viewBox/drawables kept, package on/off; the tidy pass (dead `color`, initial paint, `<defs>` untouched, bare `<g>`, empty containers, `href`), idempotent |
| `tests/export_clean_eps.test.ts` | the clean switch on the EPS: no `%%Creator`/`%%CreationDate`/`%ADO_*`/`%%BeginPhotoshop`/`x:xmptk`, ONE packet, still verifiable EPS 10, tags read back, byte-stable, legacy envelope intact |
| `tests/export_stroke_color.test.ts` | the artboard's ink: no `currentColor` (optimized or not, expanded or not), every paint hex, the EPS gets real RGB, `#ffa500` still ships |
| `tests/export_text_spacing.test.ts` | Title/Subtitle tracking survives every format: each em value (and a negative, a px, an inline style) becomes the run's px, and the outliner receives it |
| `tests/builder_sheetpackage_formats.test.ts` | the package honours every shared field: flags gate the files, SVGO recorded, expansions and rescale applied (PNG follows), the built-in writer's live-text refusal (`partial`), the format store round-trip |
| `tests/export_sheet_ui.test.tsx` | the ONE shared `ExportFormatSheet` under both scopes: one row each, real/rescaled JPEG px note, patch payloads + clamps, no-output warning, the marker slot, and the Inkscape helper row only for that writer |
| `tests/svg_builder_workspace.test.tsx` | real scanned fake library through Workbench: no borrowed `.svg-panel`/`.up-columns`, auto placement + placeholders, click remove/add, full-sheet toast, artboard lock survives Reshuffle, unindexed/no-metadata markers, Similar refusal without index, Icons indexing with a fake model runtime then Similar by the locked reference, presets/CUSTOM/undo/RESET, typed width clamps, zoom 1:1/−, Export menu items, the separate `builder-export-settings` header button opening that popup, metadata dialog, brief Raw view |
| `tests/icon_index.test.ts`, `tests/icon_indexing_run.test.ts` | vector index record/freshness/balanced score; indexing loop, image-vector reuse, failure isolation, cancel, read-back ([vector index](../svg-builder-index.md)) |
| templates, artboards, removal, folders, register | see [templates & artboards suites](svg-builder-sheets.md) |
| `tests/svg_builder_icon_styles.test.ts`, `tests/svg_builder_styles_ui.test.tsx` | icon style from the id, labels, options (+ a lost picked style), allowed icons, off-style sheet icons, stored filter; through Workbench the STYLES dropdown beside Icons indexing, Line stroke / Colored wiggle only for the library and picks, off-style icons leave the sheet in one undo step, remembered after a reload |
| `tests/svg_builder_colored_icons.test.ts`, `tests/svg_builder_colored_ui.test.tsx` | colored icons keep own paints (groups, style, hex); stroke settings only strokes, fill only fills; line icons and a colored hero; settings parse; styled quick kind; Customize and toolbar through Workbench |
| `tests/svg_builder_preset_json.test.tsx` | preset JSON: icons by name/null, partial merge + clamp, name/title/file/id resolution, bad JSON, legacy ids, AI brief; window apply (colours, text, icons, missing report), broken JSON refused, Export entry |
| `tests/svg_builder_iconmap.test.tsx` | icon map (named icons, folder/full path, files incl. preview, stable order), usage record parse/bump; scan writes `icon-map.json` and the folder bar shows it |
| `tests/svg_builder_decline.test.tsx` | 🗑: pair file declined, library −1, cell left empty, Undo approves again (library back), Redo declines again |
| `tests/svg_builder_guides.test.tsx` | box range 18–240, guide geometry (cells, icon areas, edges, padding, banner), ▦ Guides toggle + opacity remembered |
| `tests/svg_builder_quickedit.test.tsx` | smart swatches, hex cleaning, hover target classification; icon colour (swatch, hex, Done) + stroke, title font + size, background/banner colour, one undo per change; banner icon circle/size/both panels; toolbar pinned while a panel is open, banner icon hit area |
| `tests/svg_builder_opaque.test.ts` | no opacity in the composed sheet for solid/split × side/edge, solid ring colour, icon opacity attributes stripped, `solidMix` |
| `tests/svg_builder_captions.test.ts` | captions = Icon Name, fallback title/file name; drawn in the composed sheet |
| `tests/svg_builder_discovery.test.ts` | export/export.json metadata (title = name, Icon Name read for captions, title/description/tags searchable, foreign record ignored), recursive approved-source discovery through all folders, upload split-scope compatibility, ignored builder/export directories, `assetsFromRows`, honest empty/corrupt audit |
| `tests/svg_builder_session.test.ts` | seven `TAB_IDS`, `DEFAULT_BUILDER`, `patchBuilder`, `sessionOf`, validated `parseBuilderUndoPatch` |
| `tests/svg_builder_ui.test.tsx` | exact `SVG builder` top-menu label, lazy shell, full folder widget, absent path before pick, global `history-bar`, unsupported-browser note, prompt window and shared Gemini/key/model/endpoint controls inside the Sheet metadata dialog |
| `tests/svg_builder_provider.test.ts` | one bounded 768 px JPEG preview, one Gemini request, no auto-resend, no request without key or preview |
| `tests/builder_export_formats_wiring.test.ts` | `outlineForEps` (built-in outlines + reports, Inkscape untouched, refusal names both fixes), `needsTextFonts`, `builderExportSettings`, `rescaledArtboard`, `formatSummary` |
| `tests/builder_export_package.test.ts` | a sheet with text ships an EPS through the real converter contract; the outline fix and `tools.eps.writer` are recorded; a refused outline is `partial`; all-off refuses |
| `tests/builder_export_clean.test.tsx` | the `bld-set-clean` row and its store write; the package's SVG loses fingerprints and keeps only title/description/tags; the EPS has no producer identity; off ships the fingerprints |
| `tests/builder_export_settings_ui.test.tsx` | every row once, artboard-aware JPEG hint, one patch per gesture, clamping, all-off warning, helper row, the separated ⚙ toolbar button |
| `tests/builder_export_stroke.test.tsx` | the cell writes the setting's px directly (no transform, RULE 26) and the EPS `w` is that same number |
| `tests/builder_export_hero_eps.test.ts` | a hero glyph's `currentColor` pen is resolved before the EPS stage; the text is outlined as a reported auto-fix |
| `tests/builder_export_spacing.test.ts` | spacing written in px at the run's size, never an em string; the outliner receives it (not 0) |
| `tests/builder_export_dialog.test.tsx` | the REAL panel: the popup lives in `.bld-backdrop` with `aria-modal`, Escape/Close close it, a gesture persists to the builder store |
| `tests/apply.test.ts`, `tests/workbench_ui.test.tsx`, `tests/session.test.ts`, `tests/log_ui.test.tsx`, `tests/scroll_top.test.tsx` | global `builderChecked`/`builderConfig` undo routing and seven-tab shell regressions |

The finish gate also runs `tsc`, `npm run lint`, the changed-file quality gate and `npm run verify`; the measurement is appended to `QUALITY_RECHECK.md`.

## Fast lane

`npm run test:builder:fast` bundles `tools/builder-fast.spec.ts` with esbuild and an in-memory API (`builder-fast-hook.ts`): 14 assertions over the real pure domain, discovery, session/undo, export verification and the panel handles. A smoke lane, not a coverage reduction.

Measured medians (same sandbox): six-file Vitest builder suite **2.556 s**, fast Node lane **0.222 s** (**91.3% faster**), `npm run` wrapper **0.332 s**. Target: ≥ 80% reduction.
