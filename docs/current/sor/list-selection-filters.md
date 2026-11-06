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

## Multi-choice filters

Every **filter** dropdown is a checkbox menu: pick one value, several
(Generate SVG: *Generating + Generated*; Review: *Pending + Regenerated — new
review*) or **All**. A row passes when it matches **any** picked value; the
button says what is picked. Sort dropdowns stay single-choice.

| Part | Where |
|---|---|
| Value = the "all" value, ONE value (the old shape — stored filters and history entries stay valid) or a list; `anyOf`, `toggleMulti` (option order kept; none or every option = all), `parseMulti` (unknown values dropped, RULE 13), `dropFromMulti`, `multiText` | `lib/multifilter.ts` |
| One dropdown: first option = all; handles `<testid>` (button), `<testid>-menu`, `<testid>-opt-<value>`; Escape / outside press closes | `ui/MultiSelect.tsx` |
| Batch status + review (`parseBatchFilter`) | `lib/batchfilter.ts`, `batch/BatchFilterGrid.tsx` |
| Selection V2 status + pairing (`parseFilter`, history labels) | `lib/reviewfilter.ts`, `selectionv2/FilterGrid.tsx` |
| Generate SVG generation + review | `lib/svglist.ts`, `svg/SvgListFilters.tsx` |
| SVG to upload package + metadata + badge | `upload/rowlist.ts`, `upload/UploadControls.tsx`, `upload/UploadRowBadgeFilter.tsx` |
| Upload format + badge; both upload tabs share `rowMatchesBadges` / `badgeFilterOptions`; a deleted badge leaves the picks | `stockupload/rowlist.ts`, `stockupload/StockUploadControls.tsx`, `lib/upload/rowbadge.ts` |

Test helper `tests/helpers/multiselect.ts` `pickOnly` sets one value the way
the old single-choice select did.

## Tests

`invert_selection.test.ts`, `multi_filter.test.tsx`.
