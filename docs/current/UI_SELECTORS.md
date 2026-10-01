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
| `tab-sheets` | `Single sheets` | mounts the original `App` UI; one mounted at a time with `tab-batch` |
| `tab-batch` | `Batch folders` | mounts `BatchPanel`; batch state (`useBatch`) survives sheet tabs |

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
`sel-clear-empty`. Each row: `sel-check-{pairId}` checkbox plus two labelled
thumb buttons `sel-thumb-src-{pairId}` (O) / `sel-thumb-ai-{pairId}` (A);
clicking a thumb opens that pair's preview.

Multi-select + bulk (`ListControls`): `sel-check-all` (tri-state header
checkbox), `sel-select-all`, `sel-selcount`, `sel-bulk-approve` /
`sel-bulk-decline` (disabled at 0, label shows affected count), `sel-wrap`
(navigation wrap setting), `sel-thumbsize` (S/L row thumbnails).

Comparison (`sel-compare`): `sel-status` chip, `sel-zoom` (1:1 fit/full,
Space), `sel-sync` (scroll sync), `sel-decline`, `sel-approve`,
`sel-autonext`, `sel-open-src` / `sel-open-ai` (copy-path fallback),
`sel-missing` (absent side / decode failure), `sel-discovery`
(created/generated line).

Surfaces: `sel-writewarn` + `sel-retry` (atomic-write failure banner),
`sel-corrupt`, `sel-toast`, `sel-busy`, `sel-footer` with `sel-rescan-age`,
`sel-diff` (+new/renamed/removed/unchanged), `sel-retry-count`,
`sel-progress`; empty-root states `sel-root-empty`, `sel-unsupported`.

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
