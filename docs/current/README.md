# Current docs — router

Start at [AGENTS](../../AGENTS.md). Pick a task row. Pages ≤ 9 KB.

## 1. Task read packs

| Task | Start (behaviour → handles) | Detail, only if touched | Invariants |
|---|---|---|---|
| Single sheets | [sor/sheets](sor/sheets.md) 2 → [selectors/sheets](selectors/sheets.md) 3 | — | [core](sor/invariants/core.md) 1 |
| Batch folders | [sor/batch](sor/batch.md) 4 → [selectors/batch](selectors/batch.md) 5 | [four-point](sor/topics/four-point-batch.md) 3, [export names](sor/topics/export-naming.md) 4 | [batch](sor/invariants/batch.md) 2 |
| Selection V2 | [sor/selection](sor/selection.md#behaviour) 7 → [selectors/selection](selectors/selection.md) 8 | [pair files](sor/topics/pair-files.md) 3 | [selection](sor/invariants/selection.md) 4 |
| Generate SVG | [sor/svg-generation](sor/svg-generation.md) 8 → [selectors/svg-generation](selectors/svg-generation.md) 7 | [results](sor/svg-generation-results.md) 7, [task prompts](sor/svg-generation-prompts.md) 2, [parallel runs](sor/svg-parallel-runs.md) 3; handles: [list](selectors/svg-generation-list.md) 7, [run](selectors/svg-generation-run.md) 5, [dialogs](selectors/svg-generation-dialogs.md) 7 | [svg](sor/invariants/svg.md) 8, [run](sor/invariants/svg-run.md) 5 |
| AI-source image edits | [sor/svg-image-edits](sor/svg-image-edits.md) 2 → [selectors/svg-image-edits](selectors/svg-image-edits.md) 7 | [storage](sor/storage/svg.md) 4, [auto Apply / progress](sor/svg-image-auto-apply.md) 3 | [I-71/I-72](sor/invariants/svg-image-edits.md) 4 |
| SVG to upload | [sor/upload](sor/upload.md) → [selectors/upload](selectors/upload.md) | [settings](sor/upload-settings.md), [padding](sor/upload-padding.md), [geometry](sor/upload-geometry.md), [repairs](sor/upload-auto-repair.md), [stroke endpoints](sor/upload-stroke-endpoints.md), [badge](sor/upload-badge.md), [row labels](sor/upload-row-badges.md), [size guide](sor/upload-sizeguide.md), [metadata](sor/upload-metadata.md), [acceptance](sor/upload-metadata-acceptance.md), [export](sor/upload-export.md), [file metadata](sor/upload-file-metadata.md), [Adobe validation](sor/upload-adobe-validation.md), [progress](sor/process-progress.md), [EPS](sor/upload-eps.md), [vector gradients](sor/upload-eps-gradients.md); handles: [list](selectors/upload-list.md), [dialogs](selectors/upload-dialogs.md), [template](selectors/upload-badge-template.md) | [upload](sor/invariants/upload.md) |
| Shell / log / undo | [sor/shared](sor/shared.md) 1 → [selectors/shared](selectors/shared.md) 6 | [progress/sound](sor/process-progress.md) 8, [undo](sor/topics/state-history.md) 7, [log](sor/topics/log.md) 4, [keys](sor/topics/secret-store.md) 4 | [shared](sor/invariants/shared.md) 4 |
| Root paths / folders | [path invariants](sor/invariants/paths.md) 4 | [capture](sor/invariants/paths-capture.md) 5, [scope](sor/invariants/paths-scope.md) 4; history: [topics](sor/topics/README.md) | — |
| Docs only | this page + [RULE 17](rules/DOCS_AND_SAFETY.md#rule-17) | — | — |

## 2. Lookups (open one row)

| Need | Index → area page |
|---|---|
| Which source file owns X | [owner map](sor/OWNERS.md) → `sor/owners/<area>.md` |
| Storage key or file | [storage map](sor/STORAGE.md) → [svg](sor/storage/svg.md), [upload](sor/storage/upload.md) |
| Which test covers X | [test index](sor/TESTS.md) → `sor/tests/<area>.md` |
| An I-n ID | [ID lookup](sor/invariants/README.md) |
| A RULE n | [RULE 1–25 index](AGENT_RULES.md) → [behaviour](rules/BEHAVIOR.md), [quality](rules/QUALITY.md), [RULE 16 gates](rules/QUALITY_GATES.md), [docs/privacy/delivery](rules/DOCS_AND_SAFETY.md) |
| Shared list-selection gestures | [RULE 25 matrix](rules/BEHAVIOR.md#rule-25) → [I-73](sor/invariants/shared.md#i-73); then the affected tab's behaviour / selectors / tests row above |
| Commands and gates | [Code Verification](CODE_VERIFICATION.md); why a gate failed: [ratchet & CI](VERIFICATION_RATCHET.md) |
| Harness, coverage and caches | [test harness](TEST_HARNESS.md) |
| What the app is | [five-mode overview](sor/OVERVIEW.md) |

## 3. Conventions

- `name.md` is an entry page; `name-<part>.md` beside it is its detail page,
  and both link to each other. Folders (`owners/`, `storage/`, `tests/`,
  `invariants/`) hold one page per area behind a small index.
- One owner per fact: link to it instead of restating it.
- New content goes to the owning page; when a page would pass 9 KB, split it
  into a `-<part>` sibling and add it to the table above (RULE 17/18).
- [SYSTEM_OF_RECORD](SYSTEM_OF_RECORD.md) (§1–§20) and
  [UI_SELECTORS](UI_SELECTORS.md) (A–S) only keep old anchors working. Don't
  start from them.

## 4. Do not load

`QUALITY_RECHECK.md` (append one dated entry without reading it),
`../archive/**` and [the history index](../HISTORY_INDEX.md) unless the task
names that history, `design/**/*.html`, and `dist/`. Dated
[deep dives](sor/topics/README.md) are background; invariants and selector
pages win over them.
