# Tests — SVG builder

Back to the [test index](../TESTS.md) and [behaviour contract](../svg-builder.md). Every suite uses real modules, synthetic pair files, in-memory filesystem fakes or happy-dom; no live provider call occurs.

| Suite | Pins |
|---|---|
| `tests/svg_builder_domain.test.ts` | config presets/parsers, geometry, catalog filter, deterministic selection and locks, short-pool honesty, metadata parsing/acceptance, sanitized SVG cells, approved-id traceability, composition fingerprint, broken sources and preset round-trip |
| `tests/svg_builder_discovery.test.ts` | recursive approved-source discovery through all folders, upload split-scope compatibility, ignored builder/export directories, `assetsFromRows`, honest empty/corrupt audit |
| `tests/svg_builder_session.test.ts` | seven `TAB_IDS`, `DEFAULT_BUILDER`, `patchBuilder`, `sessionOf`, validated `parseBuilderUndoPatch` |
| `tests/svg_builder_ui.test.tsx` | exact `SVG builder` top-menu label, lazy shell, full folder widget, absent path before pick, global `history-bar`, unsupported-browser note, prompt window and shared Gemini/key/model/endpoint controls |
| `tests/svg_builder_provider.test.ts` | one bounded 512px JPEG preview, one Gemini request with the disclosed prompt, no auto-resend, no request without key or preview, `AUTH_HEADER` and default config |
| `tests/apply.test.ts`, `tests/workbench_ui.test.tsx`, `tests/session.test.ts`, `tests/log_ui.test.tsx`, `tests/scroll_top.test.tsx` | global `builderChecked`/`builderConfig` undo routing and seven-tab shell regressions |

The finish gate also runs `npx tsc --noEmit`, `npm run lint`, the explicit changed-file quality gate, `npm run verify:fast` and `npm run verify`. The dated measurement is appended to `QUALITY_RECHECK.md`.
