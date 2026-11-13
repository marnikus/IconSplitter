# Tests — SVG builder

Back to the [test index](../TESTS.md) and [behaviour contract](../svg-builder.md). Every suite uses real modules, synthetic pair files, in-memory filesystem fakes or happy-dom; no live provider call occurs.

| Suite | Pins |
|---|---|
| `tests/svg_builder_domain.test.ts` | config presets/parsers, geometry, catalog filter, deterministic selection and locks, short-pool honesty, metadata parsing/acceptance, sanitized SVG cells, approved-id traceability, composition fingerprint, broken sources and preset round-trip |
| `tests/svg_builder_parity.test.ts` | reference rules: range clamping, empty title kept, defaults, three layout presets (copy kept), fitted centred grid, shrink-only overflow, stroke-aware glyph, tokenised profile score, Similar/Filtered/locks/top-up shortfall, grow/shrink, recipe captions, `#tag` profiles from export metadata, `#` search, banner wrap, all 8 banner styles valid, ids beyond the grid, slug and reference preset shape |
| `tests/svg_builder_workspace.test.tsx` | real scanned fake library through Workbench: no borrowed `.svg-panel`/`.up-columns`, auto placement + placeholders, click remove/add, full-sheet toast, artboard lock survives Reshuffle, unindexed/no-metadata markers, Similar refusal without index, Icons indexing with a fake model runtime then Similar by the locked reference, presets/CUSTOM/undo/RESET, typed width clamps, zoom 1:1/−, Export menu items, metadata dialog, brief Raw view |
| `tests/icon_index.test.ts`, `tests/icon_indexing_run.test.ts` | vector index record/freshness/balanced score; indexing loop, image-vector reuse, failure isolation, cancel, read-back ([vector index](../svg-builder-index.md)) |
| `tests/svg_builder_templates.test.tsx` | saved templates: look-only (words/hero kept), generated + numbered names, validated list, dashed preview cells; through Workbench save → rename → open (one undo step) → save back → save as new → remove; indexing controls in the header |
| `tests/svg_builder_discovery.test.ts` | export/export.json metadata (title = name, title/description/tags searchable, foreign record ignored), recursive approved-source discovery through all folders, upload split-scope compatibility, ignored builder/export directories, `assetsFromRows`, honest empty/corrupt audit |
| `tests/svg_builder_session.test.ts` | seven `TAB_IDS`, `DEFAULT_BUILDER`, `patchBuilder`, `sessionOf`, validated `parseBuilderUndoPatch` |
| `tests/svg_builder_ui.test.tsx` | exact `SVG builder` top-menu label, lazy shell, full folder widget, absent path before pick, global `history-bar`, unsupported-browser note, prompt window and shared Gemini/key/model/endpoint controls inside the Sheet metadata dialog |
| `tests/svg_builder_provider.test.ts` | one bounded 768 px JPEG preview, one Gemini request with the disclosed prompt, no auto-resend, no request without key or preview, `AUTH_HEADER` and default config |
| `tests/apply.test.ts`, `tests/workbench_ui.test.tsx`, `tests/session.test.ts`, `tests/log_ui.test.tsx`, `tests/scroll_top.test.tsx` | global `builderChecked`/`builderConfig` undo routing and seven-tab shell regressions |

The finish gate also runs `npx tsc --noEmit`, `npm run lint`, the explicit changed-file quality gate, `npm run verify:fast` and `npm run verify`. The dated measurement is appended to `QUALITY_RECHECK.md`.

## Fast lane

`npm run test:builder:fast` runs `tools/builder-fast-test.mjs`: esbuild bundles `tools/builder-fast.spec.ts` into one Node ESM file, with `tools/builder-fast-hook.ts` supplying an in-memory API for the static panel render. The 14 assertions exercise the real pure domain, recursive discovery, validated session/undo payloads, injected sheet preview, one-request Gemini guard, export verification and the dark panel handles. The full Vitest UI suite still mounts Workbench with the real hook, so this is a smoke lane, not a coverage reduction.

Measured medians (same sandbox): six-file Vitest builder suite **2.556 s**, fast Node lane **0.222 s** (**91.3% faster**), `npm run` wrapper **0.332 s** (**87.0% faster**). Target was at least an 80% wall-clock reduction (≤ 0.511 s).
