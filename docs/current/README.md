# Docs router

[AGENTS](../../AGENTS.md) → pick one task row. ≤9KB.

## 1. Task read packs

| Task | Start (behaviour → handles) | Detail, only if touched | Invariants |
|---|---|---|---|
| Single sheets | [sor/sheets](sor/sheets.md) → [selectors/sheets](selectors/sheets.md) | — | [core](sor/invariants/core.md) |
| Batch folders | [sor/batch](sor/batch.md) → [selectors/batch](selectors/batch.md) | [four-point](sor/topics/four-point-batch.md), [export names](sor/topics/export-naming.md) | [batch](sor/invariants/batch.md) |
| Selection V2 | [sor/selection](sor/selection.md#behaviour) → [selectors/selection](selectors/selection.md) | [pair files](sor/topics/pair-files.md) | [selection](sor/invariants/selection.md) |
| Generate SVG | [sor/svg-generation](sor/svg-generation.md) → [selectors/svg-generation](selectors/svg-generation.md) | [results](sor/svg-generation-results.md), [task prompts](sor/svg-generation-prompts.md), [run control](sor/svg-parallel-runs.md); handles: [list](selectors/svg-generation-list.md), [run](selectors/svg-generation-run.md), [dialogs](selectors/svg-generation-dialogs.md) | [svg](sor/invariants/svg.md), [run](sor/invariants/svg-run.md) |
| AI-source image edits | [sor/svg-image-edits](sor/svg-image-edits.md) → [selectors/svg-image-edits](selectors/svg-image-edits.md) | [storage](sor/storage/svg.md), [auto Apply / progress](sor/svg-image-auto-apply.md) | [I-71/I-72](sor/invariants/svg-image-edits.md) |
| SVG to upload | [sor/upload](sor/upload.md) → [selectors/upload](selectors/upload.md) | [response](sor/upload-response.md), [layout](sor/upload-settings.md), [presets](sor/upload-settings-presets.md), [local](sor/upload-local-settings.md), [padding](sor/upload-padding.md), [geometry](sor/upload-geometry.md), [repairs](sor/upload-auto-repair.md), [caps](sor/upload-stroke-endpoints.md), [badge](sor/upload-badge.md), [row labels](sor/upload-row-badges.md), [size guide](sor/upload-sizeguide.md), [metadata](sor/upload-metadata.md), [acceptance](sor/upload-metadata-acceptance.md), [export](sor/upload-export.md), [formats](sor/upload-formats.md), [file metadata](sor/upload-file-metadata.md), [Adobe validation](sor/upload-adobe-validation.md), [progress](sor/process-progress.md), [EPS](sor/upload-eps.md), [gradients](sor/upload-eps-gradients.md); handles: [list](selectors/upload-list.md), [dialogs](selectors/upload-dialogs.md), [template](selectors/upload-badge-template.md) | [upload](sor/invariants/upload.md) |
| Stock Upload | [behaviour](sor/stock-upload.md) → [handles](selectors/stock-upload.md) | — | — |
| Shell / log / undo | [sor/shared](sor/shared.md) → [selectors/shared](selectors/shared.md) | [state sorting](sor/list-state-sorting.md), [progress/sound](sor/process-progress.md), [undo](sor/topics/state-history.md), [log](sor/topics/log.md), [keys](sor/topics/secret-store.md) | [shared](sor/invariants/shared.md) |
| Root paths / folders | [path invariants](sor/invariants/paths.md) | [capture](sor/invariants/paths-capture.md), [scope](sor/invariants/paths-scope.md); history: [topics](sor/topics/README.md) | — |
| Docs only | this page + [RULE 17](rules/DOCS_AND_SAFETY.md#rule-17) | — | — |

## 2. Lookups (open one row)

| Need | Index → area page |
|---|---|
| Which source file owns X | [owner map](sor/OWNERS.md) → `sor/owners/<area>.md` |
| Storage key or file | [storage map](sor/STORAGE.md) → [svg](sor/storage/svg.md), [upload](sor/storage/upload.md) |
| Which test covers X | [test index](sor/TESTS.md) → `sor/tests/<area>.md` |
| An I-n ID | [ID lookup](sor/invariants/README.md) |
| A RULE n | [RULE 1–25 index](AGENT_RULES.md) → [behaviour](rules/BEHAVIOR.md), [quality](rules/QUALITY.md), [RULE 16 gates](rules/QUALITY_GATES.md), [docs/privacy/delivery](rules/DOCS_AND_SAFETY.md) |
| Selection speed / gestures | [Performance](sor/selection-performance.md) → [RULE 25](rules/BEHAVIOR.md#rule-25) / [I-73](sor/invariants/shared.md#i-73) |
| Commands and gates | [Code Verification](CODE_VERIFICATION.md); why a gate failed: [ratchet & CI](VERIFICATION_RATCHET.md) |
| Harness / speed evidence | [test harness](TEST_HARNESS.md) |
| What the app is | [six-mode overview](sor/OVERVIEW.md) |

## 3. Conventions

- `name.md` links to its `name-<part>.md` detail and back. `owners/`, `storage/`,
  `tests/` and `invariants/` use one page per area behind a small index.
- Link to each fact’s one owner.
- Content stays in its owning page; split above9KB into a `-<part>` sibling
  and route it above (RULE 17/18).
- [SYSTEM_OF_RECORD](SYSTEM_OF_RECORD.md) (§1–§20) and
  [UI_SELECTORS](UI_SELECTORS.md) (A–S) only keep old anchors working. Don't
  start from them.

## 4. Do not load

`QUALITY_RECHECK.md` (append one dated entry without reading it),
`../archive/**` and [the history index](../HISTORY_INDEX.md) unless the task
names that history, `design/**/*.html`, and `dist/`. [Deep dives](sor/topics/README.md) are background; current contracts win.
