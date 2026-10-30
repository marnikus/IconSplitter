# Selection V2 — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

<a id="m-selection-review--srcselection-verified-2026-10-01"></a>
## M. Shared comparison and status surfaces

The original Selection tab and its `sel-open-folder`, filter/sidebar/list,
collapse/expand and unsupported/empty-state handles are removed. The legacy
section anchor above now routes to the still-supported V2 shared panes.

Comparison (`sel-compare`): `sel-status` chip, `sel-zoom` (fit/1:1, Space),
`sel-sync`, `sel-decline`, `sel-approve`, `sel-reset`, `sel-autonext`,
`sel-open-src` / `sel-open-ai` (copy-path fallback), `sel-missing`
(absent side / decode failure), `sel-discovery` (created/generated line).
Shared status: `sel-footer`, `sel-rescan-age`, `sel-diff`, `sel-retry-count`,
`sel-progress`. V2-specific banners/toasts use the `v2-*` ids below.

## N. Selection review V2 — `src/selectionv2/*` (verified 2026-10-01)

Source bar + layout switch:

| Test id | Element | Notes |
|---|---|---|
| `v2-open-folder` | green `Open folder` button | the one folder control, labelled with the action in every state (I-44); opens the picker with or without a root (I-30) |
| `v2-folder-path` | read-only path row | the picked folder's **complete path**, full-width directly below the toolbar, whole value in its `title`, selectable text only — no input, no button (I-46); *full path not captured* names the missing state (*completed — check it* removed by I-59) |
| `v2-rescan` | `↻ Rescan` | re-walks sources under the [output-folder exclusions](../sor/selection.md#behaviour), keeps decisions/zoom and only discovered checks/anchor |
| `v2-mode-list` / `v2-mode-compare` | segmented buttons | review layout; `aria-pressed` marks the active one |
| `v2-count-{total,pending,approved,declined,attention}` | counter chips | live counts |

Filter grid (`v2-filters`): `v2-date-all` / `v2-date-month` / `v2-date-range`,
`v2-from` (month **or** datetime-local, disabled when the mode is All),
`v2-to` (Range only), `v2-status`, `v2-pairing` (all / complete / missing
pair), `v2-sort`, `v2-dir`, `v2-shown` ("Showing N pairs"), `v2-clear`.

Bulk bar (`v2-bulk`, sticky at top 0 while the list scrolls):

| Test id | Element | Notes |
|---|---|---|
| `v2-check-all` | header checkbox | checked / unchecked / **indeterminate**; toggles visible checks only, preserving hidden ones (I-73) |
| `v2-selected-count` | `N selected` | checked rows, independent of the filters |
| `v2-scope` | `across N visible pairs` | the scope "Select visible" and bulk act on |
| `v2-scan-scope` | `Scope: …` | the folder scope the scan used (I-40) — split-output-only or whole-folder scope; shown once a root is loaded, replacing the static "Recursive · subfolders included" note |
| `v2-blocked` | `N checked pairs incomplete` | shown only when > 0; never approved |
| `v2-hidden` | `N checked but hidden by filters` | shown only when > 0; never applied |
| `v2-select-visible` / `v2-deselect` | buttons | add filtered rows / clear ALL checks including hidden |
| `v2-thumb` | `<input type="range">` | **48–800 px**, step 4; `aria-label="Thumbnail maximum height"`; sizes BOTH thumbnails of every row (I-55) |
| `v2-thumb-value` | `<output>` | live `128 px` readout (RULE 24) |
| `v2-approve-selected` / `v2-decline-selected` / `v2-reset-selected` | buttons | only checked ∩ visible ∩ complete; affected count in label; arms first (`Confirm approve`), Cancel/Escape disarms, disabled at 0; no approve/reset-visible controls |
| `v2-cancel-bulk` | button | shown while one action is armed; Escape also disarms |

List review (`v2-list`, rows in `v2-rows` with `role="list"`):

| Test id | Element | Notes |
|---|---|---|
| `v2-row-{pairId}` | row (`role="listitem"`) | `aria-current="true"` + roving `tabIndex` on the active row |
| `v2-check-{pairId}` | row checkbox | `aria-label="Select {base}"`; checking does not move the active row |
| `v2-thumb-src` / `v2-thumb-ai` | thumbnail wrappers | each carries an `Original` / `AI result` tag; missing side or decode failure → `role="img"` placeholder with an aria-label |
| `v2-status-{pairId}` | badge | glyph **and** text, or `⚠ AI result missing` / `⚠ Original missing` |
| `v2-created-{pairId}` / `v2-dims-{pairId}` | cells | date + time, dimensions + format + size |
| `v2-open-src-{pairId}` / `v2-open-ai-{pairId}` | buttons | disabled when that side is missing; copies the FOLDER of that side (`lib/copypath`), as the pasted full path when one is remembered (I-28) |
| `v2-decline-{pairId}` / `v2-approve-row-{pairId}` | buttons | decide this row |
| `v2-autonext` | checkbox | advance to the closest pending row below in displayed order; no wrap ([rule](../sor/review-navigation.md)) |
| `v2-footer`, `v2-empty`, `v2-nomatch`, `v2-clear-empty` | footer + empty states | "no images" and "no matches" stay distinct (RULE 4) |

Comparison layout: `v2-pair-picker` (labelled `<select>` of the visible pairs)
plus the shared `sel-compare` handles (§M). V2 keeps the shared `sel-*`
status handles: `sel-footer`, `sel-diff`, `sel-rescan-age`,
`sel-retry-count`, `sel-progress`; V2 skins its own banners and overlays with
`v2-writewarn` / `v2-retry`, `v2-pairfiles`, `v2-corrupt`, `v2-toast`, `v2-busy`,
and the empty-root states `v2-root-empty` (its button is
`v2-open-folder-empty`) / `v2-unsupported`.
Approving a pair writes `<dir>/<stem>.svg.json` beside its images and never a
`review-decisions.json` (I-41/I-42; `tests/selectionv2_ui.test.tsx` asserts both).

## Selection reset and row interactions

Reset to pending (uses the [one global history bar](shared.md#o-global-history-bar-reset-actions-verified-2026-10-01)):

| testid | element | notes |
|---|---|---|
| `sel-reset` | button | single pair, comparison view; `disabled` while pending |
| `v2-reset-selected` | button | the selected, complete pairs; arms first, then "Confirm reset" |

Row selection (`v2-row-{pairId}`, File-Explorer style — the checkbox is the
authoritative state, the clicks only produce it):

| click | result |
|---|---|
| plain | activate/anchor this row; leave all checks unchanged |
| Shift | replace checks with the contiguous visible range from anchor to this row; missing/hidden anchor → this row only |
| Ctrl/Alt/Cmd | activate and toggle this row's check; keep the anchor and other checks |

`v2-check-{pairId}` toggles its check without moving active/anchor. Each changed
gesture is one global `checked` undo entry carrying ids, anchor and active;
new lists start unchecked. Bulk remains armed and limited to checked ∩ visible ∩
complete, never active by inference ([RULE 25](../rules/BEHAVIOR.md#rule-25)).

`v2-sort` adds `selected` / `approval`; `v2-dir` asc/desc uses state-group labels. [State sorting](../sor/list-state-sorting.md).
