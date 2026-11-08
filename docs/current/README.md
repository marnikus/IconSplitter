# Current docs — router

Start at [AGENTS](../../AGENTS.md). Pick a task row. Pages ≤ 9 KB.

## 1. Task read packs

| Task | Start (behaviour → handles) | Detail, only if touched | Invariants |
|---|---|---|---|
| Single sheets | [sor/sheets](sor/sheets.md) → [selectors/sheets](selectors/sheets.md) | — | [core](sor/invariants/core.md) |
| Batch folders | [sor/batch](sor/batch.md) → [selectors/batch](selectors/batch.md) | [four-point](sor/topics/four-point-batch.md) · [export names](sor/topics/export-naming.md) | [batch](sor/invariants/batch.md) |
| Selection V2 | [sor/selection](sor/selection.md) → [selectors/selection](selectors/selection.md) | [pair files](sor/topics/pair-files.md) | [selection](sor/invariants/selection.md) |
| Generate SVG | [sor/svg-generation](sor/svg-generation.md) → [selectors/svg-generation](selectors/svg-generation.md) | [results](sor/svg-generation-results.md) · [prompts](sor/svg-generation-prompts.md) · [run control](sor/svg-parallel-runs.md) · [web mode](sor/svg-web-generation.md) · [path editor](sor/svg-path-editor.md) · [tail cutter](sor/svg-tail-cutter.md) · [preview zoom](sor/preview-zoom.md) · [list](selectors/svg-generation-list.md) · [run](selectors/svg-generation-run.md) · [dialogs](selectors/svg-generation-dialogs.md) | [svg](sor/invariants/svg.md) · [run](sor/invariants/svg-run.md) |
| AI-source image edits | [sor/svg-image-edits](sor/svg-image-edits.md) → [selectors/svg-image-edits](selectors/svg-image-edits.md) | [storage](sor/storage/svg.md) · [auto apply](sor/svg-image-auto-apply.md) | [I-71/I-72](sor/invariants/svg-image-edits.md) |
| SVG to upload | [sor/upload](sor/upload.md) → [selectors/upload](selectors/upload.md) | [response](sor/upload-response.md) · [settings](sor/upload-settings.md) · [presets](sor/upload-settings-presets.md) · [metadata](sor/upload-metadata.md) · [export](sor/upload-export.md) · [EPS](sor/upload-eps.md) · [list](selectors/upload-list.md) · [dialogs](selectors/upload-dialogs.md) | [upload](sor/invariants/upload.md) |
| SVG builder | [sor/svg-builder](sor/svg-builder.md) → [selectors/svg-builder](selectors/svg-builder.md) | [vector index](sor/svg-builder-index.md) · [owners](sor/owners/svg-builder.md) · [storage](sor/storage/svg-builder.md) · [tests](sor/tests/svg-builder.md) | [shared](sor/invariants/shared.md) |
| Upload (FTPS) | [sor/stock-upload](sor/stock-upload.md) → [selectors/stock-upload](selectors/stock-upload.md) | [helper](sor/bridge-helper.md) · [limit](sor/stock-upload-limit.md) · [history behavior](sor/stock-upload-history.md) · [history selectors](selectors/stock-upload-history.md) | [I-80/I-81](sor/invariants/upload.md) |
| Shell / log / undo | [sor/shared](sor/shared.md) → [selectors/shared](selectors/shared.md) | [undo](sor/topics/state-history.md) · [log](sor/topics/log.md) · [keys](sor/topics/secret-store.md) · [list search](sor/list-search.md) · [filters](sor/list-selection-filters.md) · [lazy previews](sor/lazy-previews.md) · [scan speed](sor/scan-performance.md) | [shared](sor/invariants/shared.md) |
| Root paths / folders | [path invariants](sor/invariants/paths.md) | [capture](sor/invariants/paths-capture.md) · [scope](sor/invariants/paths-scope.md) | — |
| Docs only | this page + [RULE 17](rules/DOCS_AND_SAFETY.md) | — | — |

## 2. Lookups (open one row)

| Need | Index → area page |
|---|---|
| What the app is | [seven-mode overview](sor/OVERVIEW.md) |
| Which source file owns X | [owner map](sor/OWNERS.md) |
| Storage key or file | [storage map](sor/STORAGE.md) |
| Which test covers X | [test index](sor/TESTS.md) |
| An I-n ID | [ID lookup](sor/invariants/README.md) |
| A RULE n | [RULE 1–25 index](AGENT_RULES.md) → [behaviour](rules/BEHAVIOR.md) · [quality](rules/QUALITY.md) · [gates](rules/QUALITY_GATES.md) · [docs/privacy](rules/DOCS_AND_SAFETY.md) |
| Selection speed / gestures | [performance](sor/selection-performance.md) |
| Commands and gates | [Code Verification](CODE_VERIFICATION.md) · [ratchet](VERIFICATION_RATCHET.md) |
| Harness / speed evidence | [test harness](TEST_HARNESS.md) |

## 3. Conventions

- `name.md` links to `name-<part>.md` and back; `owners/`, `storage/`, `tests/` and `invariants/` use one page per area.
- Link to each fact's one owner; split pages above 9 KB into `-<part>` siblings (RULE 17/18).
- [SYSTEM_OF_RECORD](SYSTEM_OF_RECORD.md) and [UI_SELECTORS](UI_SELECTORS.md) only preserve legacy anchors.

## 4. Do not load

`QUALITY_RECHECK.md` (append one dated entry without reading), `docs/archive/**`, `design/**/*.html` and `dist/` unless needed. [Deep dives](sor/topics/README.md) are background; current contracts win.
