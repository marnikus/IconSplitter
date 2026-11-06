# Invert selection and multi-choice filters — every list tab (2026-11-06)

[Shared shell](shared.md) · [list search](list-search.md) · [RULE 25](../rules/BEHAVIOR.md#rule-25)

## Invert selection

Every list tab's bulk bar has **⇄ Invert** beside "Select (all) visible":
each **visible** row flips (checked ↔ unchecked); checks hidden by filters
stay, the header checkbox's scope rule. One undoable step, recorded through
the tab's own selection entry (`batchChecked`, `checked`, `svgChecked`,
`uploadChecked`, `stockUploadChecked`).

| Part | Where |
|---|---|
| The rule: `invertChecked(checked, visibleIds)` (newly checked keep visible order) | `lib/reviewselect.ts` |
| One button, one handle pattern `<prefix>-invert-selection` (`batch`, `v2`, `svg`, `upload`, `stock`) | `ui/InvertButton.tsx` |
| Tab actions `invertVisible` | `batch/useBatchSelection.ts`, `selectionv2/useSelectionV2.ts`, `svg/actions.ts`, `upload/uiactions.ts`, `stockupload/selectionactions.ts` |

Batch inverts only its selectable rows (`selectableIds`), as Select visible does.

## Tests

`invert_selection.test.ts`.
