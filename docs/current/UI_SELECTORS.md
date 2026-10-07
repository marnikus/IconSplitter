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
| `sel-open-folder` | green `Open folder` button | the one folder control, labelled with the action in every state (I-44); opens the picker with or without a root |
| `sel-folder-path` | read-only path row | the picked folder's **complete path** below the header, whole value in its `title`; names the state — *full path not captured* / *completed — check it* (I-46) |
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
| `v2-folder-path` | read-only path row | the picked folder's **complete path**, full-width directly below the toolbar, whole value in its `title`, selectable text only — no input, no button (I-46); *full path not captured* / *completed — check it* name the states |
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

## Q. App shell and the global activity log (verified 2026-10-05)

| Test id | Element | Notes |
|---|---|---|
| `app-shell` | the app's one viewport column | nav → `app-main` → `log-dock`; `height: 100dvh`, `overflow: hidden` |
| `app-main` | the scrolling region | holds the active tab's panel; the window itself never scrolls |
| `log-dock` | the docked log, the shell's last row | a layout row, never `fixed`/`sticky` — that overlay is what used to eat row-checkbox clicks (I-27) |
| `log-head` | the dock's header | `log-count` ("120 of 200"), `log-autoscroll` ("following" / "paused"), `log-max` (select: 50/100/200/500/1000), `log-copy`, `log-clear`, `log-minimize` ("Minimize" / "Restore"), `log-note` (Copy/Clear feedback) |
| `log-body` / `log-list` / `log-entry` / `log-empty` | the scrolling entries | one `log-entry` per line: level, `feature.action`, ids, detail; `role="log"` |
| `--app-dock-h` | CSS custom property on `:root` | the dock's height (236 px open, 36 px minimized), published by `src/log/dockheight.ts`; the fixed floats (`svg-toast`, `svg-busy`, `.toast-above-dock`) read it |

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

Source bar (always rendered — `svg-open-folder` is the one way in whether or not
a root is loaded; `svg-root-empty` / `svg-unsupported` are the two empty states
and stay distinct):

| Test id | Element | Notes |
|---|---|---|
| `svg-open-folder` | green `Open folder` button | the same shared control as the Selection tabs (I-44), offered whether or not a root is loaded (I-30); `svg-root-empty`'s button is `svg-open-folder-empty` |
| `svg-folder-path` | read-only path row | the picked folder's **complete path**, full-width below the bar, whole value in its `title`, text only — captured from the clipboard when the folder is picked (I-35) and remembered per folder name (I-29, `iconSplitter.rootpaths.v1`); *full path not captured* / *completed — check it* name the states (I-46) |
| `svg-rescan` | `↻ Rescan` | re-walks the root, keeps rows and the prompt |
| `svg-scope-copy` | text | "recursively, both files present, decision = approved" |
| `svg-audit` | text | the whole picture the list was checked against, one line (I-33): "Audit — 30 files · 13 AI sources · 14 references excluded · 2 missing files · 2 duplicates removed → 13 rows". The same line is the scan log's detail |
| `svg-count-{eligible,generated,approved,failed}` | counter chips | live counts |

Prompt + provider card:

| Test id | Element | Notes |
|---|---|---|
| `svg-prompt` | `textarea` | `aria-label="Generation prompt"`; `svg-reset-prompt` restores the documented default |
| `svg-provider` | text | provider name + "OpenAI-compatible" |
| `svg-limits` | text | the values that will really be used: "\{stall label} · N retries · N per request" — the label names its tier floor ("600s stall (high floor)") and the per-request size is **exactly what the user configured** (no tier ever shrinks it); the `title` carries the tier note |
| `svg-per-request` | `input[type=number]` | images per request, 1–9 — the size that is really sent, at every reasoning tier |
| `svg-timeout` | `input[type=number]` | the **stall window** in **seconds**, 5–900, default 120: the longest silence between bytes; there is no total-duration limit. Clamped at the moment of change; the tier floor can raise the effective window, which `svg-limits` and `svg-confirm-timeout` then show |
| `svg-retries` | `input[type=number]` | retries per request, 0–5, default 2, for failures the provider **confirmed**; a stall is never retried — its outcome is unknown |
| `svg-model` | `input` | the model id (verified default `openai/gpt-6.1-sol`) |
| `svg-key-state` | button | masked key ("Key saved" / "No key yet"); opens the editor |
| `svg-key-mask` / `svg-key-note` | two rows of `svg-key-state` | the masked key (ellipsised) on its own line above "GPT 6.1 Sol · excluded from Git · logs · exports" — never side by side, so they cannot overlap |
| `svg-key-input` / `svg-key-save` / `svg-key-cancel` | editor | `input[type=password]`, `aria-label="Requesty API key"` |

The provider card (`svg-provider-card`) is **minimizable**: `svg-provider-toggle`
is a link in the header with `aria-expanded` and `aria-label`
("Minimize model settings" / "Restore model settings"). Minimized, only the
header stays — provider, limits (`svg-limits`) and the toggle — and the choice
is remembered locally (RULE 6), so a restart opens the card the way it was left.

Sampling (`SvgSampling.tsx`) — only what the selected model accepts is offered:

| Test id | Element | Notes |
|---|---|---|
| `svg-temperature` | `input[type=number]` | 0–2, step 0.1; **absent** on a reasoning model, which shows `svg-temperature-off` ("Not supported by this model") instead |
| `svg-max-tokens` | `input[type=number]` | clamped to the model's range (family default 1 000–200 000, or the model list's `max_output_tokens`) |
| `svg-effort` | `select` | Low / Medium / High / Extra High; the empty option is the provider default. `xhigh` (Extra High) only on the models that accept it |
| `svg-caps` | text | the token field, both ranges and where the limits came from (model list / family / default) |
| `svg-param-note` | warning | what a model change reset, and why; dismissable |
| `svg-refresh-models` | button | re-reads `GET /v1/models` (cached 24 h) and re-resolves the limits |

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
| `svg-thumb` | `input[type=range]` | the ONE zoom value: in px, **48–800** step 4; it sizes BOTH previews, the row's minimum height and the previews column (inline `--svg-thumb` on `svg-panel`); `svg-thumb-value` is the live readout. Same range, same rule and the same shared layout as Selection V2's `v2-thumb` (I-55 — one implementation, `lib/zoom` + `ui/PairedThumbs`) |
| `svg-bg` | swatch group | **preview background**, app-side only — presets `svg-bg-white` / `svg-bg-black` / `svg-bg-gray` / `svg-bg-green` / `svg-bg-red` (each `aria-pressed`), `svg-bg-custom` (`input[type=color]`, `aria-label="Custom preview background"`), `svg-bg-value` (live label, follows the choice) |
| `svg-estimate` | text | token estimate for the selection |
| `svg-generate-selected` | button | arms first (`Confirm generate`), then queues/sends; **stays enabled while a run is in flight** (I-53) and is disabled only at 0 selected |
| `svg-approve-selected` / `svg-decline-selected` | buttons | review the selection; disabled at 0 |
| `svg-cancel-run` / `svg-batch-progress` | while running | cancellation + per-batch progress; the progress line carries the same ticking `svg-bulk-elapsed` as the strip |

Rows (`svg-rows`, `role="listbox"`, rows in `svg-list`):

| Test id | Element | Notes |
|---|---|---|
| `svg-row-{sourceId}` | row `role="listitem"` | keyed by the stable pair id, never a row index |
| `svg-check-{sourceId}` | checkbox | `aria-label="Select {base}"` |
| `svg-ai-{sourceId}` | thumbnail | the approved AI image (`<img>` in the same `svg-thumb` square box, `object-fit: contain`); missing → placeholder of the same size |
| `svg-prev-{sourceId}` | inline preview | the newest valid SVG, rendered INLINE in an open shadow root (`el.shadowRoot.querySelector("svg")`); square frame, the same `svg-thumb` px box as the AI thumbnail beside it; `data-version` = the version Copy hands over; empty (no SVG yet) shows "No SVG", an un-previewable file shows "Preview failed" + `data-error` (e.g. `not well-formed XML`) |
| `svg-prev-frame-{sourceId}` | frame around the SVG preview | `data-bg` = the chosen colour; class `contrast` when the frame needs the light outline (black artwork under 3:1); the inline host is a child of it, so the colour is what the artwork is painted on; the AI thumbnail is never inside it |
| `svg-location-{sourceId}` / `svg-copy-{sourceId}` | buttons | "Location" copies the **folder of the file the row names** (I-56: the same path `svg-target-{id}` shows, minus the file name — `…\<piece>\split_04`); "Copy" puts that version's SVG source on the clipboard. Neither is disabled by the folder's depth, and neither ever copies a file path |
| `svg-code-{sourceId}` / `svg-history-{sourceId}` | buttons | the code dialog and the **version chooser** (I-54); disabled with no SVG / no recorded version |
| `svg-generate-{sourceId}` / `svg-approve-{sourceId}` / `svg-decline-{sourceId}` | buttons | per-row actions; approve/decline disabled until a version exists |
| `svg-status-{sourceId}` | badge | "Not Generated" / "Generating" / "Generated" / "Failed" / "Unknown" (a request whose outcome was never confirmed — never shown as Failed); its `title` is the row error, e.g. "outcome unknown — request req\_… ; it has not been resent." |
| `svg-review-{sourceId}` | badge | pending / approved / declined |
| `svg-usage-{sourceId}` | text | version, tokens and the cost as reported / **Estimated** ("no cost reported" when unknown); the `title` carries the audit line (model · currency · pricing version · basis) |
| `svg-target-{sourceId}` | text | the SVG this row owns: the newest version's real path, or — while nothing exists yet — the path generation will write ("2026-10/…/split\_01/icon\_…\_01.svg"). Never the pair file's name; the doubled folder prefix bug (svgPath is already root-relative) is fixed by this handle's rule |
| `svg-persist-{sourceId}` | text | "Pair file saved" / "Not generated yet" / "Pair file unreadable — SVGs on disk are kept"; the `title` names the pair's own file ("architecture/fog\_AI.svg.json" — the JSON record BESIDE the SVG, not a second extension of it, I-41); `error` class on failure |
| `svg-problem-{sourceId}` | text | the row's scan status when a file of a **listed** source needs attention: "Reference missing" / "Unreadable file" (several reasons joined by " · "); its `title` is the full per-file reason ("no AI result (court\_AI.png) beside architecture/court.png"). An unreadable file or a missing reference is a status on the row, never a removal — but a missing **AI image** means there is no row at all (I-31): that source appears in `svg-warn-excluded` instead |

List chrome: `svg-row-count` (visible rows), `svg-running-count`,
`svg-attention-count` (rows needing attention), `svg-empty` ("No approved
source matches these filters."), `svg-footer-summary` (`shownLabel`).

Queue (waiting batches, I-53): `svg-queue` is absent when nothing waits; otherwise
`svg-queue-count` ("N queued — they start as soon as the run in flight ends.
Adding more never interrupts it."), `svg-queue-line-{n}` (1-based, "#n · <first
file> + N more · N images · N requests") and `svg-queue-drop-{n}` ("× Drop", drops
exactly that batch — the run in flight is untouched). `svg-confirm-generate` reads
"Add to queue" while a run is in flight and `svg-confirm-queue-note` explains why.

Batch strip (`svg-batch`, the request in flight and every finished request;
it stays after the run ends so the record is readable): `svg-batch-composite`
(the contact sheet actually sent), `svg-batch-id`, `svg-batch-grid`
("request 2 of 3 · 2×2 grid · 4 image(s)"), `svg-batch-counts` ("N saved · N
failed · N missing"), `svg-batch-elapsed` (the ticking "elapsed m:ss" of the
request in flight, next to Cancel — the visual proof that a long generation is
alive; "(ended)" once the run stops), `svg-batch-reports` with one
`svg-batch-report-{index}` per finished request (its own counts, elapsed,
tokens and cost; class `failed` when that request failed and `unknown` when its
outcome was never confirmed), `svg-batch-cancel` (only while something is in
flight).

Dialogs:

| Test id | Notes |
|---|---|
| `svg-confirm` | confirm-before-send backdrop (nothing is sent by opening it); `svg-confirm-generate`, `svg-confirm-cancel`, `svg-confirm-close` |
| `svg-confirm-count` / `svg-confirm-requests` | the selected images and the total request count with the per-request size ("4 × 4 max" — the user's size, at every tier) |
| `svg-confirm-model` / `svg-confirm-sampling` / `svg-confirm-timeout` | the provider+model, the sampling values that will be sent (e.g. "no temperature · 32 000 max tokens · effort Medium") and the stall window that will really be used ("600s stall (medium floor)") |
| `svg-confirm-streaming` | the streaming fact: "on — a live request is never cut, however long it runs" |
| `svg-confirm-queue-note` | shown only while a run is in flight: "confirming adds these N image(s) to the queue", so the user knows the run in flight is not interrupted (I-53) |
| `svg-confirm-limit` / `svg-confirm-problem` | the tier note ("effort medium raises the stall window to 300s … the batch itself is sent as configured") or `null` when the tier raises nothing; the refusal when the plan cannot be mapped — `svg-confirm-generate` is disabled and nothing is sent |
| `svg-batch-page` / `svg-batch-prev` / `svg-batch-next` | the page label ("batch\_1\_2 · Request 1 of 2") and pagination, one page per request |
| `svg-batch-grid` / `svg-batch-empty` / `svg-batch-items` | that page's grid size, its empty cells (partial last request) and its ordered "position — name" filenames |
| `svg-composite-img` / `svg-composite-meta` | the page's own contact sheet (built in memory on first view, cached) and its layout line |
| `svg-composite-building` / `svg-composite-error` | the honest in-progress and could-not-build states |
| `svg-code-dialog` | the SVG source: `svg-code-block`, `svg-code-missing`, `svg-code-select`, `svg-code-copy`, `svg-code-close`, `svg-code-done`, plus `svg-code-preview` → `svg-code-art` (the same document, drawn) and `svg-code-preview-note` |
| `svg-history-{sourceId}` | button | opens the **version chooser** (I-54); disabled when the pair has no recorded version |
| `svg-history-dialog` | the version chooser: `svg-history-title`, `svg-history-shown` ("Showing v2 of 3 recorded versions — choosing another one keeps all of them"), `svg-history-note` (why a choice could not be saved; absent when it could), `svg-history-table`, `svg-history-v{n}` (one tile per version, class `shown` on the one the row shows), `svg-history-status-{n}`, `svg-history-art-{n}` (that version's own artwork, 96×96), `svg-history-cost-{n}` (cost + Estimated/reported label and the pricing-version line), `svg-history-use-{n}` ("Use this version"; disabled for an unusable tile or the one already shown), `svg-history-code-{n}`, `svg-history-close`, `svg-history-done` |

Restart recovery: `svg-inflight` (the note about requests with no confirmed
outcome, shown while `iconSplitter.svg.inflight.v1` has entries) with
`svg-inflight-note` (how many, their request ids and files, and "Nothing has
been resent"), `svg-inflight-retry` (opens the normal confirmation for exactly
those sources — the only way to resend, always a deliberate user action) and
`svg-inflight-dismiss` (acknowledges the note and clears the journal).

Shared surfaces: `svg-warn-{noteId}` (`pairfile` — the pair files that could not
be parsed, I-43 / `problems` — the
listed sources that need attention, with the first reasons spelled out /
`excluded` — the approved sources **not** listed, grouped by kind with the first
reasons spelled out ("4 approved source(s) are not listed — 2 with no AI image
on disk, 2 duplicate records." — a source outside the split output is reported
as `outside-split` and never offered, I-38), so a reference image is never mistaken for a
missing row (I-31) / `unreadable` — the files that could not be read this scan /
save failure),
`svg-toast` (`role="status"`), `svg-busy`, `svg-statusbar` with
`svg-status-totals` (visible tokens + cost, "—" when unknown),
`svg-status-progress`, `svg-status-running`. Undo of a review gesture goes
through the global bar handles `hist-undo` / `hist-redo` (§O).

## R. SVG to upload — `src/upload/*` (verified 2026-10-07)

The tab after Generate SVG. Handles verified in `src/ui/Workbench.tsx`,
`src/upload/UploadPanel.tsx` and `src/upload/UploadRow.tsx`. (An earlier draft
of this section described the donor branch's `src/svgupload/*` panel — search,
sort, filters, per-field copy, preview/settings dialogs, `up-*` ids. That
namespace is not part of this build; the ids below are the ones in source.)

| Test id | Element / notes |
|---|---|
| `tab-svg-upload` | the workbench tab itself (`src/lib/session.ts` `TabId "svgUpload"`) |
| `upload-panel` | the whole tab |
| `upload-unsupported` | shown when the File System Access API is missing (Chrome/Edge needed); its "Try anyway" calls the same pick |
| `upload-open-folder` / `upload-folder-path` / `upload-rescan` | the green folder button, the read-only full-path row and the rescan — the same furnished pair as §P (`src/ui/FolderBar.tsx`) |
| `upload-busy` | the in-flight line (`null` = empty) |
| `upload-defaults` | the global defaults bar |
| `upload-default-paddingPct` / `-strokePt` / `-jpegMpx` / `-jpegQuality` | the four numeric defaults (number inputs; clamped on change) |
| `upload-default-artboard` | the artboard select (Square artboard / Fit content) |
| `upload-default-optimize` / `upload-default-eps` | SVGO and the optional EPS checkboxes |
| `upload-bulk` | the bulk bar |
| `upload-check-all` / `upload-check-none` | select/deselect exactly the visible ids (`checkAllIds(ctx, ids, on)`) — never "everything" |
| `upload-apply-settings` | "apply to selected" — ONE undoable history entry, disabled with nothing checked |
| `upload-export` | opens the confirmation dialog for the checked icons |
| `upload-counts` | "N icon(s) · M processed" |
| `upload-list` | the scrollable row list (`role="list"`) |
| `upload-row-{id}` | one row (`role="listitem"`) |
| `upload-check-{id}` | the row checkbox |
| `upload-expand-{id}` | opens the row's metadata editor |
| `upload-name-{id}` / `upload-path-{id}` / `upload-version-{id}` | the icon base, the chosen SVG's root-relative path (full text in `title`), and `v{n} · <file>` |
| `upload-export-{id}` | the export-state chip: `Not exported` (discovered) · `Interrupted — needs review` · `Processed` · `Partial` · `Failed` · `Cancelled` · `Stale` |
| `upload-meta-{id}` | the metadata chip: `No metadata` / `Generating…` / `Accepted` |
| `upload-warn-{id}` | the row's warnings, comma-joined (empty when none) |
| `upload-meta-editor-{id}` | the expanded editor body |
| `upload-meta-issues-{id}` | the policy's complaints about the current text (empty = valid) |
| `upload-meta-title-{id}` / `-desc-{id}` / `-tags-{id}` | the three editable fields (the tags field is a `textarea`) |
| `upload-meta-accept-{id}` | "accept" — disabled while the text fails the policy; an accepted answer is remembered per source identity |
| `upload-empty` | the "nothing to export here" note (names the root) |
| `upload-provider` | the provider card |
| `upload-provider-toggle` | collapses/expands the card |
| `upload-endpoint` / `upload-model` / `upload-timeout` / `upload-concurrency` | the provider settings fields |
| `upload-key-input` | the `type="password"` key field — the mask is the only value ever shown back |
| `upload-key-save` / `upload-key-clear` | save to IndexedDB (or the session-only key the toast names) and clear |
| `upload-prompt` / `upload-prompt-reset` | the metadata prompt and its reset (disabled while the default is in place) |
| `upload-confirm` | the confirmation dialog (`role="dialog"`, `aria-modal`) |
| `upload-confirm-summary` | what the run will do (icons, package path) |
| `upload-confirm-ai` | the paid-work note: which icons still need an answer |
| `upload-confirm-request` | the **exact request preview** shown before anything is sent |
| `upload-confirm-cancel` / `upload-confirm-ok` | cancel and "Export" (disabled without a key when answers are needed) |
| `upload-toast` | the status line (`role="status"`) |

**No log of its own:** the tab writes to the shell's one activity log (§Q) under
`feature: "upload"` — `scan` (the icons found), `key-saved` (the mask plus
whether it persisted) / `key-cleared`, and `job-failed` (warn, the reason). No
entry ever carries the key, the prompt, the answer text or the bytes.

**States on screen.** A row's export chip is the committed state
(`export/current.json` → `record.json`), or the journal's: `running` becomes
`Interrupted — needs review` exactly once per restart, and the row's warning
says whether an accepted answer is waiting to be reused or an unknown paid
outcome will not be resent. A `Stale` row is a pre-v2 package and can only be
re-exported — nothing in it is trusted or reused.

**Not in this tab yet** (report §5/§7, later phases): the donor workbench's
search box, sort and the status filter (the filter exists in the model as
`UploadFilter` but has no control), per-field copy buttons, the preview and
per-icon settings dialogs, a published-artifact JPEG preview, and an Abort
button for an in-flight provider request.
