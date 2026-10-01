# UI Selector Reference — Icon Splitter

Adapted from `Process-Images-in-Areana/docs/current/DOM_SELECTORS.md`. That app
automates a foreign site, so its selectors target someone else's DOM. Icon
Splitter **is** the page, so this reference lists the app's own stable handles
for tests (RULE 8) and any future UI automation. Sections A–H exist in
`src/App.tsx` (verified 2026-09-30); sections K–Q exist in `src/ui/**`
(verified 2026-10-01).

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
the owning component **and** a row to this doc in the same change (RULE 17).

## K. Shell tabs (`src/ui/Shell.tsx`)

| Test id | Visible text | Notes |
|---|---|---|
| `tab-sheets` | `Sheet editor` | default tab; sheet state survives switching (both tabs stay mounted, inactive is `hidden`) |
| `tab-batch` | `Batch folders` | batch panel; `main.tsx` renders `Shell`, not `App` |

## L. Batch folders (`src/ui/batch/FolderPickers.tsx`)

| Test id | Element | Notes |
|---|---|---|
| `batch-source-picker` | button `📁 Source folder` | opens the directory picker, then scans; disabled while busy |
| `batch-source-name` | text | picked source folder name, or `No source chosen` |
| `batch-refresh` | button `↻ Rescan` | disabled while busy or without a source |
| `batch-custom-dest-toggle` | checkbox | `Custom destination` on/off |
| `batch-dest-picker` | button `📁 Destination folder` | only rendered when custom destination is on |
| `batch-dest-name` | text | picked destination name, or `No destination chosen` |
| `batch-dest-default` | text | `Output goes to <source>/_split_output` when custom destination is off |

## M. Batch presets (`src/ui/batch/PresetBar.tsx`)

| Test id | Element | Notes |
|---|---|---|
| `batch-preset-list` | `<select>` | preset names from localStorage |
| `batch-preset-load` | button `Load` | loads the picked preset (fails open when gone/corrupt) |
| `batch-preset-save` | button `Save` | overwrites the picked preset with current folders + settings |
| `batch-preset-delete` | button `Delete` | removes the picked preset |
| `batch-preset-load-last` | button `Load last` | loads the last-used preset (auto-remembered on every save/load, incl. panel mount) |
| `batch-preset-name` | text input | name for Save-as-new |
| `batch-preset-save-as` | button `Save as new` | stores current folders + settings under the typed name |

## N. Batch settings (`src/ui/batch/BatchSettings.tsx`)

| Test id | Control | Notes |
|---|---|---|
| `batch-extensions` | text input | comma-separated image extensions; invalid values revert on blur with an error toast |
| `batch-use-hash` | checkbox | content hash for change detection |
| `batch-padding` | range 0–25 | padding % per side |
| `batch-size` | `<select>` | 0 (Native auto), 128, 256, 512, 1024, 2048 |
| `batch-transparent` | checkbox | transparent background |
| `batch-merge-auto` | checkbox | auto merge distance on/off |
| `batch-merge` | range 0–0.15 step 0.0025 | only rendered when auto is off |
| `batch-output-dir` | text input | output folder name (default `_split_output`); invalid values revert on blur |
| `batch-variation-prefix` | text input | duplicate variation prefix (default `_v`); invalid values revert on blur |
| `batch-auto-select` | checkbox | auto-select new images after scan |
| `batch-keep-missing` | checkbox | keep missing files in the review list |

## O. Batch review list (`src/ui/batch/ScanList.tsx`, `ScanRow.tsx`)

| Test id | Element | Notes |
|---|---|---|
| `batch-select-all` | button `Select all` | disabled when nothing is eligible |
| `batch-deselect-all` | button `Deselect all` | disabled when nothing is selected |
| `batch-empty-note` | text | shown only when the list is empty |
| `batch-row-{i}` | row container | i = list index; shows name, rel path, `ref: <name>` (+ `(missing)`), note, status pill |
| `batch-select-{i}` | checkbox | disabled for ineligible rows (missing/deleted) |
| `batch-copy-path-{i}` | button `📋 Path` | copies `<root>/<rel path>`; browsers cannot open Explorer, so the path is shown in a toast when the clipboard is blocked (RULE 9) |

## P. Batch process bar (`src/ui/batch/ProcessBar.tsx`)

| Test id | Element | Notes |
|---|---|---|
| `batch-process` | button `⚙ Process selected (N)` | disabled while busy or when N = 0; rescans before running |
| `batch-cancel` | button `✕ Cancel` | only rendered while busy; stops between files (in-flight file finishes) |
| `batch-missing-skip` | button `Skip those` | missing-reference confirm: skips files without a reference |
| `batch-missing-continue` | button `Continue anyway` | missing-reference confirm: processes them without the reference copy |

## Q. Batch status surfaces (`src/ui/batch/BatchPanel.tsx`)

| Test id | Element | Notes |
|---|---|---|
| `batch-busy-overlay` | full-screen progress overlay | present only while busy |
| `batch-busy-message` | progress text | e.g. `Scanning…`, `Processing 3/12…` (RULE 5 — incremental) |
| `batch-toast` | bottom toast | green success / rose error; text is the assertion target (RULE 2, RULE 4) |

## J. Handles still needed (to be added on demand)

| Handle | Where | Needed when |
|---|---|---|
| `sheet-row-{id}` | sheet list rows | first test that selects a sheet by click |
| `icon-card-{n}` / `icon-copy-{n}` / `icon-save-{n}` | result grid cards | first test of per-icon export |
| `empty-result-note` | "No icons selected…" paragraph | empty-state assertions |

Nothing fetches these yet — they are the discovery list, kept honest like the
source doc's "Missing Selectors" section.
