# UI Selector Reference — Icon Splitter (verified against `src/`)

Adapted from `Process-Images-in-Areana/docs/current/DOM_SELECTORS.md`. That app
automates a foreign site, so its selectors target someone else's DOM. Icon
Splitter **is** the page, so this reference lists the app's own stable handles
for tests (RULE 8) and any future UI automation. Every `data-testid` below
exists in source — Sheets handles verified in `src/App.tsx` (2026-09-30);
Workbench + Batch handles verified in `src/ui/Workbench.tsx`,
`src/batch/BatchPanel.tsx`, `src/batch/ScanTable.tsx`, `src/batch/PresetBar.tsx`
(2026-10-01).

Priority per RULE 21: **semantic** (role / label / text) > **structural** >
**class fragment** (Tailwind utilities are last resort, never primary).

## A. File input — primary entry point

| | |
|---|---|
| Test id | `file-input` |
| Element | hidden `<input type="file" accept="image/*" multiple>` |
| Semantic fallback | `getByLabelText` once a visible label exists; today it is visually hidden |
| Used for | feeding sheets into `addFiles()`; the app's only file entry (RULE 10 — one control) |

## B. Upload triggers

| | |
|---|---|
| Test id | `upload-button` (header), `dropzone` (empty-state card, click target) |
| Semantic fallback | visible text "+ Upload images", "Drop your icon sheets here", "Choose images" |
| Used for | clicking either opens the file dialog via the shared `file-input` ref |

## C. Export controls — header

| Test id | Visible text | Notes |
|---|---|---|
| `export-zip` | `⬇ ZIP (N)` | primary; `N` = total included icons; disabled when 0 (RULE 4) |
| `export-folder` | `📁 Save to folder` | Chrome/Edge File System Access; fails open to ZIP message (RULE 9) |
| `export-download` | `Download files` | one blob download per icon |

Semantic fallback: button role + visible text. All three are disabled exactly
when `total === 0` — tests may assert disabled-state instead of toast.

## D. Sheets panel

| | |
|---|---|
| Test id | `sheet-remove-{sheetId}` (per-row remove button) |
| Semantic fallback | `title="Remove"` attribute, visible ✕ |
| Notes | the row itself is a click target (selects the sheet); no testid on rows yet — add `sheet-row-{id}` when a test needs it (see §J) |

## E. Export settings panel

| Test id | Control | Range / values |
|---|---|---|
| `padding-slider` | `<input type="range">` | 0–25 (% padding per side) |
| `size-select` | `<select>` | `SIZES` — 0 (Native auto), 128, 256, 512, 1024, 2048 |
| `transparent-checkbox` | `<input type="checkbox">` | transparent background on/off |

Semantic fallback: labels "Padding on each side", "Square size", "Transparent background".

## F. Detection panel (active sheet only)

| Test id | Control | Notes |
|---|---|---|
| `merge-slider` | `<input type="range">` 0–0.15, step 0.0025 | merge distance fraction; triggers `redetect()` (debounced by React state) |
| `merge-reset` | button "↺ Reset to auto" | disabled unless `active.manual` (RULE 4 — honest state) |

## G. Boundary overlay — include/exclude

| | |
|---|---|
| Test id | `box-toggle-{i}` on each `<g>` over the sheet preview (i = detection index) |
| Semantic fallback | none (SVG overlay) — testid is the handle |
| Behaviour | click toggles `excluded`; excluded boxes render grey/dashed, included green (RULE 11: boxes array intact) |

## H. Status surfaces

| Test id | Element | Notes |
|---|---|---|
| `busy-overlay` | full-screen progress overlay | present only while `busy` |
| `busy-message` | progress text | e.g. `Rendering 3/12…` (RULE 5 — incremental) |
| `toast` | bottom toast | green success / rose error (`toast.err`); text is the assertion target (RULE 2, RULE 4) |

## I. Selector object structure — for every element

Same shape as the source project, adapted:

```ts
{
  name: "export-zip",              // stable id, matches data-testid
  testid: "export-zip",            // primary handle
  semantic: 'button "⬇ ZIP"',      // role + text fallback (RULE 21 level 1)
  state: "disabled when total === 0",
  verified: "2026-09-30",          // date the handle was checked in src
}
```

When a test needs a handle that is not listed here, add the `data-testid` to
the owning component (`src/App.tsx` or `src/batch/*`) **and** a row to this
doc in the same change (RULE 17).

## K. Workbench tabs — mode switch

| Test id | Visible text | Notes |
|---|---|---|
| `tab-sheets` | `Single sheets` | mounts the original `App` UI; one mounted at a time with the others |
| `tab-batch` | `Batch folders` | mounts `BatchPanel`; batch state (`useBatch`) survives sheet tabs |
| `tab-selection` | `Selection` | mounts the V1 `SelectionPanel` |
| `tab-selection-v2` | `Selection V2` | mounts `SelectionV2Panel` (template design, §N) |

Semantic fallback: button role + visible text.

## L. Batch panel — `src/batch/*`

Primary header controls:

| Test id | Visible text | Notes |
|---|---|---|
| `batch-root` | `Choose source folder…` → `Root: {name}` | opens directory picker (`picker.ts`); Chrome/Edge File System Access; label mirrors state (RULE 24) |
| `batch-refresh` | `↺ Rescan` | re-walks root; gated on handle + permission |
| `batch-process` | `▶ Split selected` | disabled when 0 selected (RULE 4) |
| `batch-cancel` | `✕ Stop` | shown only while busy; sets the stop signal |
| `batch-dest` | `Choose destination…` | custom destination picker; null ⇒ `<root>/_split_output` |

Status + warning surfaces:

| Test id | Element | Notes |
|---|---|---|
| `fs-warning` | amber banner | File System Access unsupported (non-Chromium); honest degrade |
| `ref-warnings` | amber paragraph | references missing for one or more sources |
| `batch-busy` | fixed overlay | present only while a batch runs; message inside (RULE 5) |
| `batch-toast` | bottom toast | green/rose; text is the assertion target (RULE 2, RULE 4) |

PresetBar — `preset-bar` panel:

| Test id | Control | Range / values |
|---|---|---|
| `preset-name` | preset name text input | current preset label |
| `preset-save` | button `Save` | persists under `name.trim() || preset.name` |
| `preset-list` | preset `<select>` | list of saved presets; first option is the `Load preset…` placeholder |
| `preset-delete` | button `Delete` | removes preset by trimmed name |
| `batch-padding` | range 0–25 | per-side padding %, shared with sheets |
| `batch-size` | select | 0 (auto) / 128 / 256 / 512 / 1024 / 2048 |
| `batch-transparent` | checkbox | transparent background on/off |
| `batch-ignore` | comma list | directories/files skipped by the walk |

Review window (scan table) — `scan-table` panel:

| Test id | Element | Notes |
|---|---|---|
| `select-all` | button in header | toggles every eligible row; label reflects state (RULE 24) |
| `row-select-{relPath}` | per-row checkbox | `relPath` is the scan-relative path |
| `row-open-{relPath}` | per-row `copy path` button | clipboard-path fallback for "Open in Explorer" (honest, RULE 2) |

Semantic fallbacks: button/select/input role + visible text; `row-*` ids use
the data `relPath`, so tests should build handles from the scanned entry.

## M. Selection review — `src/selection/*` (verified 2026-10-01)

Header + status:

| Test id | Element | Notes |
|---|---|---|
| `sel-root` | root picker button | label mirrors state (`Root: {name}`), RULE 24 |
| `sel-rescan` | `↺ Rescan` | re-walks the root |
| `sel-watcher` | watcher pill | toggles the 30 s auto-rescan |
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

Surfaces: `sel-writewarn` + `sel-retry` (atomic-write failure banner),
`sel-corrupt`, `sel-toast`, `sel-busy`, `sel-footer` with `sel-rescan-age`,
`sel-diff` (+new/renamed/removed/unchanged), `sel-retry-count`,
`sel-progress`; empty-root states `sel-root-empty`, `sel-unsupported`.

## N. Selection review V2 — `src/selectionv2/*` (verified 2026-10-01)

Source bar + layout switch:

| Test id | Element | Notes |
|---|---|---|
| `v2-root` | path pill button | shows the root name, opens the picker; label mirrors state (RULE 24) |
| `v2-rescan` | `↻ Rescan` | re-walks the root, keeps decisions and zoom |
| `v2-watcher` | watcher pill | toggles the 30 s auto-rescan |
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
| `v2-blocked` | `N checked pairs incomplete` | shown only when > 0; never approved |
| `v2-hidden` | `N checked but hidden by filters` | shown only when > 0; never applied |
| `v2-select-visible` / `v2-deselect` | buttons | scope = the filtered list |
| `v2-thumb` | `<input type="range">` | 48–240 px, step 4; `aria-label="Thumbnail maximum height"` |
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
| `v2-open-src-{pairId}` / `v2-open-ai-{pairId}` | buttons | disabled when that side is missing; copy-path fallback |
| `v2-decline-{pairId}` / `v2-approve-row-{pairId}` | buttons | decide this row |
| `v2-autonext` | checkbox | advance to the next pending after a decision |
| `v2-footer`, `v2-empty`, `v2-nomatch`, `v2-clear-empty` | footer + empty states | "no images" and "no matches" stay distinct (RULE 4) |

Comparison layout: `v2-pair-picker` (labelled `<select>` of the visible pairs)
plus the V1 `sel-compare` handles (§M). Shared surfaces keep their `sel-*`
handles in both tabs: `sel-footer`, `sel-diff`, `sel-rescan-age`,
`sel-retry-count`, `sel-progress`; V2 skins its own banners and overlays with
`v2-writewarn` / `v2-retry`, `v2-corrupt`, `v2-toast`, `v2-busy`, and the
empty-root states `v2-root-empty` / `v2-unsupported`.

## J. Handles still needed (to be added on demand)

| Handle | Where | Needed when |
|---|---|---|
| `sheet-row-{id}` | sheet list rows | first test that selects a sheet by click |
| `icon-card-{n}` / `icon-copy-{n}` / `icon-save-{n}` | result grid cards | first test of per-icon export |
| `empty-result-note` | "No icons selected…" paragraph | empty-state assertions |
| `row-status-{relPath}` | scan table status cell | first test asserting per-row status text |
| `ref-warn-{relPath}` | per-row missing-reference note | first test of per-row warning detail |

Nothing fetches these yet — they are the discovery list, kept honest like the
source doc's "Missing Selectors" section.

## O. Global history bar, reset actions (verified 2026-10-01)

App-level, rendered by `ui/Workbench` above every panel (`ui/HistoryBar.tsx`):

| testid | element | notes |
|---|---|---|
| `history-bar` | container | present on every tab |
| `hist-undo` | button | `disabled` at the frontier; `title` = "Undo: <label> (Ctrl+Z)" |
| `hist-redo` | button | `disabled` at the tip; `title` = "Redo: <label> (Ctrl+Shift+Z)" |
| `hist-label` | text | "Undo: <label>" or "Nothing to undo" |
| `hist-open` | button | `History (<n>)`; toggles the History window (`aria-expanded`) |
| `hist-error` | span `role="alert"` | shown when an undo/redo could not be applied |

The History window (`ui/HistoryPanel.tsx`), opened by `hist-open`:

| testid | element | notes |
|---|---|---|
| `hist-panel` | `aside role="dialog"` | fixed, top-right, below the bar |
| `hist-panel-count` | text | "<n> change(s)" |
| `hist-close` | button | `aria-label="Close history"`; Escape closes too |
| `hist-panel-undo` / `hist-panel-redo` | buttons | `title` names the entry they reverse; same disabled rules as the bar |
| `hist-panel-items` | ul | newest first; the list is read-only — jumping to an entry would mean applying several changes at once, which is not reversible |
| `hist-item-<entryId>` | li | `data-current` marks the entry under the cursor |
| `hist-panel-error` | p `role="alert"` | same error as `hist-error`, inside the window |

Reset to pending:

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

Shortcuts: `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` redo. Ignored only
while the focus is in a *text* surface — text-ish input, textarea, select or a
contenteditable — so undo still works after using the zoom slider or a checkbox.

## P. Generate SVG — `src/svg/*` (verified 2026-10-01)

Source: `SvgControls.tsx`, `SvgBulkBar.tsx`, `SvgList.tsx`, `SvgRow.tsx`,
`SvgThumbs.tsx`, `SvgBatchStrip.tsx`, `SvgDialogs.tsx`, `SvgPanel.tsx`.

Source bar (only after a root is remembered; `svg-root-empty` /
`svg-unsupported` are the two empty states and stay distinct):

| Test id | Element | Notes |
|---|---|---|
| `svg-root` | path pill | the root name; `svg-choose-root` opens the picker |
| `svg-rescan` | `↻ Rescan` | re-walks the root, keeps rows and the prompt |
| `svg-scope-copy` | text | "recursively, both files present, decision = approved" |
| `svg-count-{eligible,generated,approved,failed}` | counter chips | live counts |

Prompt + provider card:

| Test id | Element | Notes |
|---|---|---|
| `svg-prompt` | `textarea` | `aria-label="Generation prompt"`; `svg-reset-prompt` restores the documented default |
| `svg-provider` | text | provider name + "OpenAI-compatible" |
| `svg-limits` | text | "timeout Ns · N retries · N per request" |
| `svg-per-request` | `input[type=number]` | images per request, 1–9 |
| `svg-model` | `input` | the model id (verified default `openai/gpt-6.1-sol`) |
| `svg-key-state` | button | masked key ("Key saved" / "No key yet"); opens the editor |
| `svg-key-input` / `svg-key-save` / `svg-key-cancel` | editor | `input[type=password]`, `aria-label="Requesty API key"` |

Filters: `svg-filter-generation` (all / not generated / generating / generated
/ failed), `svg-filter-review` (all / pending / approved / declined),
`svg-sort` (date / name / generation / review / cost), `svg-search` (matches the
file name too), `svg-shown` ("Showing N of M"), `svg-clear-filters`.

Bulk bar (`svg-bulk`):

| Test id | Element | Notes |
|---|---|---|
| `svg-check-all` | header checkbox | checked / unchecked / **indeterminate**; scope = the filtered list |
| `svg-selected-count` / `svg-scope` | text | "N selected", "across N approved sources" |
| `svg-select-visible` / `svg-deselect` | buttons | scope = what the filters show |
| `svg-thumb` | `input[type=range]` | thumbnail height; `svg-thumb-value` is the live readout |
| `svg-estimate` | text | token estimate for the selection |
| `svg-generate-selected` | button | arms first (`Confirm generate`), then sends; disabled at 0 |
| `svg-approve-selected` / `svg-decline-selected` | buttons | review the selection; disabled at 0 |
| `svg-cancel-run` / `svg-batch-progress` | while running | cancellation + per-batch progress |

Rows (`svg-rows`, `role="listbox"`, rows in `svg-list`):

| Test id | Element | Notes |
|---|---|---|
| `svg-row-{sourceId}` | row `role="listitem"` | keyed by the stable pair id, never a row index |
| `svg-check-{sourceId}` | checkbox | `aria-label="Select {base}"` |
| `svg-ai-{sourceId}` / `svg-prev-{sourceId}` | thumbnails | the approved AI image and the newest valid SVG; missing → placeholder with an aria-label |
| `svg-location-{sourceId}` / `svg-copy-{sourceId}` | buttons | reveal the AI image, copy the SVG path |
| `svg-code-{sourceId}` / `svg-history-{sourceId}` | buttons | the code dialog and the version history; disabled with no SVG / no versions |
| `svg-generate-{sourceId}` / `svg-approve-{sourceId}` / `svg-decline-{sourceId}` | buttons | per-row actions; approve/decline disabled until a version exists |
| `svg-status-{sourceId}` | badge | "Not Generated" / "Generating" / "Generated" / "Failed" |
| `svg-review-{sourceId}` | badge | pending / approved / declined |
| `svg-usage-{sourceId}` | text | tokens as reported, "—" when the provider sent none |
| `svg-persist-{sourceId}` | text | "Not saved" until the sidecar is written; `error` class on failure |

List chrome: `svg-row-count` (visible rows), `svg-running-count`,
`svg-attention-count` (rows needing attention), `svg-empty` ("No approved
source matches these filters."), `svg-footer-summary` (`shownLabel`).

Batch strip (`svg-batch`, shown while a batch is in flight):
`svg-batch-composite` (the contact sheet actually sent), `svg-batch-id`,
`svg-batch-grid` ("3×2 grid · 5 image(s)"), `svg-batch-counts` ("N saved · N
failed · N missing"), `svg-batch-cancel`.

Dialogs:

| Test id | Notes |
|---|---|
| `svg-confirm` | confirm-before-send backdrop; `svg-confirm-generate`, `svg-confirm-cancel`, `svg-confirm-close` |
| `svg-manifest` | the ordered "position — name" manifest inside the confirm dialog |
| `svg-composite` | contact-sheet preview: `svg-composite-build`, `svg-composite-img`, `svg-composite-meta`, `svg-composite-error` |
| `svg-code-dialog` | the SVG source: `svg-code-block`, `svg-code-missing`, `svg-code-select`, `svg-code-copy`, `svg-code-close`, `svg-code-done` |
| `svg-history-dialog` | every version: `svg-history-table`, `svg-history-v{n}` (one row per version), `svg-history-close`, `svg-history-done` |

Shared surfaces: `svg-warn-{noteId}` (corrupt sidecar / lost AI image / save
failure), `svg-toast` (`role="status"`), `svg-busy`, `svg-statusbar` with
`svg-status-totals` (visible tokens + cost, "—" when unknown),
`svg-status-progress`, `svg-status-running`. Undo of a review gesture goes
through the global bar handles `hist-undo` / `hist-redo` (§O).
