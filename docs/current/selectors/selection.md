# Selection and Selection V2 — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

## M. Selection review — `src/selection/*` (verified 2026-10-01)

Header + status:

| Test id | Element | Notes |
|---|---|---|
| `sel-open-folder` | green `Open folder` button | the one folder control, labelled with the action in every state (I-44); opens the picker with or without a root |
| `sel-folder-path` | read-only path row | the picked folder's **complete path** below the header, whole value in its `title`; names the state — *full path not captured* (I-46; *completed — check it* removed by I-59) |
| `sel-rescan` | `↺ Rescan` | re-walks the root |
| `sel-scope` | scope line | the folder scope the scan used (I-40), shown once a root is loaded: "Scope: split output only · N pair(s) in the main folder not listed" / "Scope: whole folder — no split output found" |
| `sel-count-{total,pending,approved,declined}` | counter chips | live counts |
| `sel-help` | `?` popover | keyboard reference |

Filter bar (`sel-filterbar`): `sel-date-all` / `sel-date-month` / `sel-date-custom`,
`sel-month` (month input), `sel-from` / `sel-to` (datetime-local, inclusive),
`sel-status`, `sel-sort` (date/status/name/path), `sel-dir` (newest/oldest),
`sel-clear`, `sel-shown` ("Showing N pairs").

Review list (`sel-list`): `sel-search` (Ctrl+K focuses), `sel-attention`
("N NEED ATTENTION"), `sel-expand` / `sel-collapse`, `sel-row-{pairId}`
(rows carry text status chips — never colour alone), `sel-empty`,
`sel-clear-empty`.

Comparison (`sel-compare`): `sel-status` chip, `sel-zoom` (1:1 fit/full,
Space), `sel-sync` (scroll sync), `sel-decline`, `sel-approve`,
`sel-autonext`, `sel-open-src` / `sel-open-ai` (copy-path fallback),
`sel-missing` (absent side / decode failure), `sel-discovery`
(created/generated line).

Surfaces: `sel-writewarn` + `sel-retry` (write-failure banner: it names the
pair files — `<name>.svg.json` — and Retry rewrites exactly the pairs whose write
failed, I-43), `sel-pairfiles` (the pair files this scan could not read, by
name — their decisions are kept, I-43), `sel-corrupt` (the **legacy**
`review-decisions.json` is unreadable; it is never written, I-42), `sel-toast`,
`sel-busy`, `sel-footer` with `sel-rescan-age`,
`sel-diff` (+new/renamed/removed/unchanged), `sel-retry-count`,
`sel-progress`; the empty-root state's button is `sel-open-folder-empty` (the
old `sel-root-empty` handle was that button and is gone), and `sel-unsupported`.

## N. Selection review V2 — `src/selectionv2/*` (verified 2026-10-01)

Source bar + layout switch:

| Test id | Element | Notes |
|---|---|---|
| `v2-open-folder` | green `Open folder` button | the one folder control, labelled with the action in every state (I-44); opens the picker with or without a root (I-30) |
| `v2-folder-path` | read-only path row | the picked folder's **complete path**, full-width directly below the toolbar, whole value in its `title`, selectable text only — no input, no button (I-46); *full path not captured* names the missing state (*completed — check it* removed by I-59) |
| `v2-rescan` | `↻ Rescan` | re-walks the root, keeps decisions and zoom |
| `v2-mode-list` / `v2-mode-compare` | segmented buttons | review layout; `aria-pressed` marks the active one |
| `v2-count-{total,pending,approved,declined,attention}` | counter chips | live counts |

Filter grid (`v2-filters`): `v2-date-all` / `v2-date-month` / `v2-date-range`,
`v2-from` (month **or** datetime-local, disabled when the mode is All),
`v2-to` (Range only), `v2-status`, `v2-pairing` (all / complete / missing
pair), `v2-sort`, `v2-dir`, `v2-shown` ("Showing N pairs"), `v2-clear`.

Bulk bar (`v2-bulk`):

| Test id | Element | Notes |
|---|---|---|
| `v2-check-all` | header checkbox | checked / unchecked / **indeterminate** |
| `v2-selected-count` | `N selected` | checked rows, independent of the filters |
| `v2-scope` | `across N visible pairs` | the scope "Select visible" and bulk act on |
| `v2-scan-scope` | `Scope: …` | the folder scope the scan used (I-40) — the same two states as `sel-scope`; shown once a root is loaded, replacing the static "Recursive · subfolders included" note |
| `v2-blocked` | `N checked pairs incomplete` | shown only when > 0; never approved |
| `v2-hidden` | `N checked but hidden by filters` | shown only when > 0; never applied |
| `v2-select-visible` / `v2-deselect` | buttons | scope = the filtered list |
| `v2-thumb` | `<input type="range">` | **48–800 px**, step 4; `aria-label="Thumbnail maximum height"`; sizes BOTH thumbnails of every row (I-55) |
| `v2-thumb-value` | `<output>` | live `128 px` readout (RULE 24) |
| `v2-approve-selected` / `v2-decline-selected` / `v2-reset-selected` | buttons | the only bulk actions; every label carries the affected count and arms first (`Confirm approve`); disabled at 0. **No bulk action touches the visible list** — `v2-approve-visible` and `v2-reset-visible` were removed |
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
| `v2-autonext` | checkbox | advance to the next pending after a decision |
| `v2-footer`, `v2-empty`, `v2-nomatch`, `v2-clear-empty` | footer + empty states | "no images" and "no matches" stay distinct (RULE 4) |

Comparison layout: `v2-pair-picker` (labelled `<select>` of the visible pairs)
plus the V1 `sel-compare` handles (§M). Shared surfaces keep their `sel-*`
handles in both tabs: `sel-footer`, `sel-diff`, `sel-rescan-age`,
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
| plain | select this row only (the shift anchor moves here) |
| Shift | select the contiguous range from the anchor to this row |
| Ctrl/Alt/Cmd | add or remove just this row; the anchor stays, so the next Shift still extends from it |

Every selection change is one undoable `checked` entry, carrying the ids, the
anchor and the row a plain click also made active.
