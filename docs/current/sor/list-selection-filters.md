# Invert selection and multi-choice filters — every list tab (2026-11-06)

[Shared shell](shared.md) · [list search](list-search.md) · [RULE 25](../rules/BEHAVIOR.md#rule-25)

## Invert selection

Every list tab's bulk bar has **⇄ Invert** beside "Select (all) visible":
each **visible** row flips (checked ↔ unchecked); checks hidden by filters
stay, the header checkbox's scope rule. One undoable step, recorded through
the tab's own selection entry (`batchChecked`, `checked`, `svgChecked`,
`uploadChecked`, `stockUploadChecked`, `builderChecked`).

| Part | Where |
|---|---|
| The rule: `invertChecked(checked, visibleIds)` (newly checked keep visible order) | `lib/reviewselect.ts` |
| One button, one handle pattern `<prefix>-invert-selection` (`batch`, `v2`, `svg`, `upload`, `stock`) | `ui/InvertButton.tsx` |
| Tab actions `invertVisible` | `batch/useBatchSelection.ts`, `selectionv2/useSelectionV2.ts`, `svg/actions.ts`, `upload/uiactions.ts`, `stockupload/selectionactions.ts` |

Batch inverts only its selectable rows (`selectableIds`), as Select visible does.

<a id="select-random"></a>

## Select random (the two upload tabs, 2026-11-08)

SVG to upload and Upload add **🎲 Select random** beside Invert: an integer
count field (min 2, default 2) and a button that REPLACES the checks with N
distinct random items. With no checks the pool is the whole listed set,
including rows hidden by filters; with checks the pool is only those checked
items. A count above the pool draws the whole pool (the field keeps the typed
request). Active/anchor stay; one draw is one undoable selection entry
(`uploadChecked` / `stockUploadChecked`). No provider or file work.

| Part | Where |
|---|---|
| Count normalization, pool choice, capped draw, toast line | `lib/randomselect.ts` |
| The ONE Fisher–Yates order (also Getty batches via re-export) | `lib/randomorder.ts` |
| Button + draft count + scope line; handles `<prefix>-select-random`, `<prefix>-random-count`, `<prefix>-random-scope` (`upload`, `stock`) | `ui/RandomSelectControl.tsx` |
| Tab actions `selectRandom` | `upload/uiactions.ts`, `stockupload/selectionactions.ts` |

The count is local UI state, not a persisted preference. Tests:
`random_select.test.ts`, `random_select_ui.test.tsx`.

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

## Remembered across a reload

Every list tab keeps the view it was left with: Batch (`lib/batchprefs`) and
Selection V2 (`lib/session`) already did; Generate SVG, SVG to upload and
Upload now store their filters (one value or several), the search text, the
sort and Generate SVG's direction in `state/listviewstore.ts`
(`iconSplitter.{svg,upload,stockUpload,svgBuilder}.listView.v1`), each read back through
the tab's own parser (`svg/listview.ts`, `upload/listview.ts`,
`stockupload/listview.ts`, `svgBuilder/listview.ts`; unknown values → the default, RULE 13). Clear
filters resets and that is saved too. Tests: `list_view_persist.test.tsx`.

Test helper `tests/helpers/multiselect.ts` `pickOnly` sets one value the way
the old single-choice select did.

## Tests

`invert_selection.test.ts`, `multi_filter.test.tsx`.
