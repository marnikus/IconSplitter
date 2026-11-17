# Generate SVG — filters and bulk bar

Object shape: [shared conventions](shared.md#i-selector-object-structure--for-every-element). Part of [Generate SVG selectors](svg-generation.md).
**Rows:** [row selectors](svg-generation-list-rows.md).

Filters: `svg-filter-generation` (all / not generated / generating / generated
/ failed), `svg-filter-review` (all / pending / approved / declined / needs-review / [regen marks](../sor/svg-regen-statuses.md)),
`svg-sort` (date / svg-created / ai-created / name / generation / review / cost /
selected / unselected / unapproved / approved), `svg-sort-dir` (one direction
arrow, `data-dir`, reverses any order), `svg-search` (name too), `svg-shown`
("Showing N of M"), `svg-clear-filters`.

## Bulk bar (`svg-bulk`)

| Test id | Element | Notes |
|---|---|---|
| `svg-bulkbar-pin` | sticky wrapper of the bulk bar | pins the bar while rows scroll (`position: sticky` in `.app-main`) |
| `svg-check-all` | header checkbox | checked / unchecked / **indeterminate**; toggles visible checks, keeps hidden |
| `svg-selected-count` / `svg-scope` | text | "N selected", "across N approved sources" |
| `svg-select-visible` / `svg-deselect` | buttons | add visible / clear ALL checks, hidden too |
| `svg-thumb` | `input[type=range]` | the ONE zoom value: px, **48–800** step 4; sizes BOTH previews, the row's minimum height and the previews column (inline `--svg-thumb`); `svg-thumb-value` reads it live. Same range and shared layout as V2's `v2-thumb` (I-55 — `lib/zoom` + `ui/PairedThumbs`) |
| `svg-bg` | swatch group | **preview background**, app-side only — presets `svg-bg-white` / `svg-bg-black` / `svg-bg-gray` / `svg-bg-green` / `svg-bg-red` (each `aria-pressed`), `svg-bg-custom` (`input[type=color]`), `svg-bg-value` (live label) |
| `svg-stroke-control` → `svg-stroke` / `svg-stroke-value` / `svg-stroke-reset` | preview stroke width | text field (placeholder `default`, 0–50 px, `aria-invalid` on bad text), live label, Reset (disabled at default); preview only, screen px (`vector-effect: non-scaling-stroke`) — thumbnails adopt one shared sheet (2026-10-19) |
| `svg-estimate` | text | token estimate for the selection |
| `svg-generate-selected` | button | "✦ Generate selected" — arms first (`Confirm SVG generation`), then queues/sends all checked rows, including rows with no SVG; **stays enabled while a run is in flight** (I-53), disabled only at 0 selected |
| `svg-regenerate-selected` | button | "↻ Regenerate selected (N)" — N counts only checked rows whose `row.newest !== null`; disabled at 0. The shared "Confirm SVG regeneration" previews/sends only those rows; bulk regeneration runs in parallel, conflicts wait (I-53) |
| `svg-register-existing` | button | "⤓ Register existing SVGs (N)" — records on-disk SVGs missing from the pair file (`<stem>.svg`, `_vN`, a copy, the pre-split name), newest shown; disabled at 0, an invalid file skipped, an empty pass names the pair, busy pairs refused ([contract](../sor/version-acceptance.md#svgs-already-in-the-folder-are-registered-as-versions)) |
| `svg-needs-review-selected` / `svg-approve-selected` / `svg-decline-selected` | buttons | review the selection (needs-review = yellow, regenerated — new review); disabled at 0 |
| `svg-cancel-run` / `svg-batch-progress` | while running | cancellation + per-batch progress; the progress line carries the same ticking `svg-bulk-elapsed` as the strip |

New lists start unchecked; gestures use global Undo ([RULE 25](../rules/BEHAVIOR.md#rule-25)). ↑/↓ move active; E/Q check/uncheck, Space toggles; A/D/W review the active valid SVG. Paid actions need confirmation. Image batch and Stop are [owned by AI-source image edits](svg-image-edits.md#image-regeneration-actions-and-row-feedback).

Image styles in the pinned bar: `svg-register-styles` registers style folders
for checked base items. `svg-style-select` opens a menu with `svg-style-opt-base`,
one `svg-style-opt-{style}` per registered style, and `svg-style-opt-all`.
**All styles · separate rows** shows the base and each existing registered
style as independent rows (see [style review contract](../sor/svg-styles.md));
`iconSplitter.svg.styles.v1.showAll` restores that view after a reload. Row review
buttons and bulk review remain scoped to each checked style pair.

List chrome: `svg-row-count` (visible rows), `svg-running-count`,
`svg-queued-count` ("N next attempt" — rows waiting in a queued batch, I-53),
`svg-attention-count` (rows needing attention), `svg-empty` ("No approved
source matches these filters."), `svg-footer-summary` (`shownLabel`).

[State sorting](../sor/list-state-sorting.md) is live; other sorts stay pinned.
