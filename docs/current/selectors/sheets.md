# Single sheets — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

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
| `export-zip` | `⬇ ZIP (N)` | primary; `N` = included icons of checked sheets; disabled when 0 (RULE 4) |
| `export-folder` | `📁 Save to folder (N)` | Chrome/Edge File System Access; fails open to ZIP message (RULE 9) |

Semantic fallback: button role + visible text. Both are disabled exactly
when `total === 0` — tests may assert disabled-state instead of toast.

## D. Sheets panel

| | |
|---|---|
| Test id | `sheet-row-{id}` (row, `aria-selected` = active), `sheet-check-{id}` (export/merge checkbox), `sheet-check-all` (tri-state header), `sheet-list` (keyboard: Up/Down, E/Q), `sheet-remove-{id}` |
| Semantic fallback | checkbox labels "Export {name}", "Select all sheets"; `title="Remove"`, visible ✕ |
| Notes | RULE 25: plain click activates, Ctrl/Alt/Cmd toggles check, Shift checks a range |

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
| `merge-slider` | `<input type="range">` 0–0.15, step 0.0025 | merge distance fraction; redetects every merge target |
| `merge-input` | `<input type="number">` 0–15 %, step 0.25 | typed %, commits on Enter/blur; empty = auto |
| `merge-value` | text `N.NN%` | current value of the active sheet |
| `merge-scope` | text | "Applies to N checked sheets · Found M icons" |
| `merge-reset` | button "↺ Reset to auto" | disabled unless `active.manual` (RULE 4 — honest state) |

## G. Boundary overlay — include/exclude

| | |
|---|---|
| Test id | `box-toggle-{i}` on each `<g>` over the sheet preview (i = detection index) |
| Semantic fallback | none (SVG overlay) — testid is the handle |
| Behaviour | click toggles `excluded`; excluded boxes render grey/dashed, included green (RULE 11: boxes array intact) |

## G2. Result grid — include/exclude

| Test id | Element | Notes |
|---|---|---|
| `result-image-{i}` | button wrapping the preview | click toggles exclusion; `aria-pressed` = included |
| `result-check-{i}` | checkbox "Export icon N" | same toggle; excluded cards stay visible, dimmed |

## H. Status surfaces

| Test id | Element | Notes |
|---|---|---|
| `busy-overlay` | full-screen progress overlay | present only while `busy` |
| `busy-message` | progress text | e.g. `Rendering 3/12…` (RULE 5 — incremental) |
| `toast` | bottom toast | green success / rose error (`toast.err`); text is the assertion target (RULE 2, RULE 4) |
