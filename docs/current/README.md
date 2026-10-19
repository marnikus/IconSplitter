# Current docs — root router

Start at [the agent bootstrap](../../AGENTS.md). This page is the **only
router**: pick one task row, open its *Start* pages, and open a *detail* page
only for the area you will change. Every page here is ≤ 9 KB (≈ 2.3k tokens,
enforced by `tests/docs_navigation.test.ts`); sizes below are KB.

## 1. Task read packs

| Task | Start (behaviour → handles) | Detail, only if touched | Invariants |
|---|---|---|---|
| Single sheets | [sor/sheets](sor/sheets.md) 2 → [selectors/sheets](selectors/sheets.md) 3 | — | [core](sor/invariants/core.md) 1 |
| Batch folders | [sor/batch](sor/batch.md) 4 → [selectors/batch](selectors/batch.md) 5 | [four-point batch](sor/topics/four-point-batch.md) 3, [export names](sor/topics/export-naming.md) 4 | [batch](sor/invariants/batch.md) 2 |
| Selection / V2 | [sor/selection](sor/selection.md) 5 → [selectors/selection](selectors/selection.md) 8 | [pair files](sor/topics/pair-files.md) 3 | [selection](sor/invariants/selection.md) 4 |
| Generate SVG | [sor/svg-generation](sor/svg-generation.md) 8 → [selectors/svg-generation](selectors/svg-generation.md) 7 | [results](sor/svg-generation-results.md) 6; handles: [list](selectors/svg-generation-list.md) 7, [run](selectors/svg-generation-run.md) 5, [dialogs](selectors/svg-generation-dialogs.md) 7 | [svg](sor/invariants/svg.md) 5, [run](sor/invariants/svg-run.md) 5 |
| AI-source image edits | [sor/svg-image-edits](sor/svg-image-edits.md) 2 → [selectors/svg-image-edits](selectors/svg-image-edits.md) 7 | [storage](sor/storage/svg.md) 4 | [I-71/I-72](sor/invariants/svg-image-edits.md) 4 |
| SVG to upload | [sor/upload](sor/upload.md) 3 → [selectors/upload](selectors/upload.md) 5 | [settings](sor/upload-settings.md) 5, [geometry](sor/upload-geometry.md) 6, [metadata](sor/upload-metadata.md) 7, [export](sor/upload-export.md) 6, [EPS](sor/upload-eps.md) 8; handles: [list](selectors/upload-list.md) 6, [dialogs](selectors/upload-dialogs.md) 5 | [upload](sor/invariants/upload.md) 4 |
| Shell / log / undo | [sor/shared](sor/shared.md) 1 → [selectors/shared](selectors/shared.md) 6 | [undo](sor/topics/state-history.md) 7, [log](sor/topics/log.md) 4, [keys](sor/topics/secret-store.md) 4 | [shared](sor/invariants/shared.md) 4 |
| Root paths / folders | [path invariants](sor/invariants/paths.md) 4 | [capture](sor/invariants/paths-capture.md) 5, [scope](sor/invariants/paths-scope.md) 4; history: [topics](sor/topics/README.md) | — |
| Docs only | this page + [RULE 17](rules/DOCS_AND_SAFETY.md#rule-17) | — | — |

## 2. Cross-cutting lookups (open one row, not the folder)

| Need | Index → area page |
|---|---|
| Which source file owns X | [owner map](sor/OWNERS.md) → `sor/owners/<area>.md` |
| Storage key or file | [storage map](sor/STORAGE.md) → [svg](sor/storage/svg.md), [upload](sor/storage/upload.md) |
| Which test covers X | [test index](sor/TESTS.md) → `sor/tests/<area>.md` |
| An I-n ID | [ID lookup](sor/invariants/README.md) |
| A RULE n | [RULE 1–24 index](AGENT_RULES.md) → [behaviour](rules/BEHAVIOR.md), [quality](rules/QUALITY.md), [RULE 16 gates](rules/QUALITY_GATES.md), [docs/privacy/delivery](rules/DOCS_AND_SAFETY.md) |
| Commands and gates | [Code Verification](CODE_VERIFICATION.md); why a gate failed: [ratchet & CI](VERIFICATION_RATCHET.md) |
| What the app is | [six-mode overview](sor/OVERVIEW.md) |

## 3. Page conventions

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
