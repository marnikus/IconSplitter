# SVG to upload — filters, bulk bar, rows and status

Selector priority and object shape: [shared conventions](shared.md#i-selector-object-structure--for-every-element). Part of [SVG to upload selectors](upload.md).

Filters: `upload-filter-status` (all / processed / partial / failed / cancelled /
stale / not exported), `upload-filter-metadata` (all / empty / generating /
generated / invalid / accepted / interrupted), `upload-sort` (name / package
status / metadata state), `upload-search`, `upload-shown` ("Showing N of M"),
`upload-clear-filters`.

## Bulk bar (`upload-bulk`)

Pinned: the bar sits in `upload-bulkbar-pin`, the Generate SVG tab's sticky `.svg-bulkbar-pin` reused (a direct child of `upload-panel`), so it stays on screen while the rows scroll (2026-10-19).

| `upload-check-all` | header checkbox | checked / unchecked / **indeterminate**; toggles visible approved rows only, keeps hidden checks |
| `upload-selected-count` / `upload-scope` | text | "N selected", "across N approved SVGs" |
| `upload-select-visible` / `upload-deselect` | buttons | add visible / clear ALL checks including hidden |
| `upload-thumb` | `input[type=range]` | the ONE zoom value: 48–800 px step 4, display-only (never the output scale); `upload-thumb-value` is the live readout |
| `upload-bg` | swatch group | preview background: `upload-bg-{white,black,gray,green,red}` (`aria-pressed`), `upload-bg-custom` (`input[type=color]`), `upload-bg-value` |
| `upload-stroke-control` → `upload-stroke` / `upload-stroke-value` / `upload-stroke-reset` | export stroke width | the Generate SVG control reused (`svg/PreviewStroke`, prefix `upload`, no sheet): IS the defaults' `strokePx` — 0–50 px in the file, `default`/empty/0 = each SVG's own widths; Reset = default. The global stroke width: no row in the global dialog; one icon may pin its own in its dialog (2026-10-19) |
| `upload-estimate` / `upload-progress` | text | the selection line, or "{kind} {done}/{total}" while a run is in flight |
| `upload-apply-settings` | button | pins the 13 general defaults onto the selection, preserving shadow pins — ONE undoable `uploadSettings` entry |
| `upload-shadow-eps-warning` | `role=alert` | shown when a selected shadowed icon requests built-in EPS; warns SVG/JPEG export but EPS will be partial |
| `upload-meta-selected` | button | "✦ Generate metadata (N)" — N = selected icons with NO metadata text yet; the paid request never replaces existing text (disabled at 0 selected; at N = 0 the status line says why nothing was sent) |
| `upload-meta-regenerate-selected` | button | "↻ Regenerate metadata (N)" — N = selected icons whose metadata is non-null; opens an exact-request confirmation/previews for only those rows, excluding empty rows (disabled at 0 eligible rows) |
| `upload-export-selected` | button | "⇪ Export selected" — generates the missing metadata first (accepted as it lands), then exports the WHOLE selection; with nothing to generate it exports immediately (disabled at 0 selected) |
| `upload-download-selected` | button | "⤓ Download all (N files)" — N = the committed SVG/JPG/EPS files of the SELECTION; opens the browser's folder dialog and copies them there under their artifact names, never overwriting (disabled at 0 selected; the `title` says so). The toast/log line: "Saved N files (M icons) to <folder> · k kept (already there) · j icons not exported yet" |
| `upload-cancel-run` | button | aborts the in-flight run; finished results are kept |

List (`upload-list`): `upload-row-count`, `upload-running-count` ("N in flight"),
`upload-attention-count` ("N need attention"), `upload-rows` (role `listbox`),
`upload-row-{pairId}`, `upload-empty`, `upload-footer-summary`.

## Row (`upload-row-{id}`)

`upload-row-{id}` (`role="listitem"`, `aria-current` on the active row): plain
click opens detail without changing checks; Shift replaces the visible range;
Ctrl/Alt/Cmd toggles one row ([RULE 25](../rules/BEHAVIOR.md#rule-25)). New
lists start unchecked; there are no A/D review shortcuts.

| `upload-check-{id}` | checkbox | toggles only this check; selection is session-persisted **and globally undoable** (I-73) |
| `upload-prev-{id}` + `upload-prev-{id}-frame` | preview | the LIVE EXPORT (2026-10-19): the exact export text for the row's effective settings (the approved SVG itself when "as is"), in a shadow root inside the coloured frame (`data-bg`); the box fits the artboard's ratio inside the zoom square (`zoomBoxFit`: 16 px and 2048 px draw the same size). `upload-prev-{id}-note` = why the export could not be previewed, or that its strokes are invisible on its background (paint clash) |
| `upload-target-{id}` | text | the row's source path (the approved SVG) |
| `upload-export-path-{id}` | text | "export → {pair-folder}/export · approved v{N}" — the folder, not the file name, so a renamed artifact (2026-10-08: the package is named after the ICON, `fog.svg`, not `fog_AI.svg`) never moves this line |
| `upload-status-{id}` | cell | the package badge (Processed / Partial / Failed / Stale / the stage while running) + the redacted error + the auto-fix note |
| `upload-note-{id}` | small | (2026-10-08) the amber `.svg-note` "EPS auto-fixed: …" line from `record.tools.eps.fixes` — present only when the EPS writer adjusted something on its own (a rounded `<rect>` drawn as an exact outline); the row stays Processed, nothing is asked |
| `upload-meta-cell-{id}` | cell | the metadata-state badge + tags/tokens |
| `upload-settings-{id}` / `upload-settings-pinned-{id}` | cell | effective settings including `shadow W% · gap G%`, `badge` and `size guide S/L%` when on, plus "inherits defaults" / "N fields overridden"; `upload-shadow-eps-{id}` warns built-in EPS partial before row export |
| `upload-meta-{id}` / `upload-settings-btn-{id}` / `upload-location-{id}` / `upload-export-{id}` | buttons | the row's Metadata / Settings / Location / Export — Location copies the export folder path with the same code the Generate SVG tab's Location uses (`lib/copypath`) |
| `upload-detail-{id}` | detail | the ACTIVE row's expandable area with the metadata fields |

## Metadata fields (`upload-detail-{id}`, empty until generated)
`upload-meta-empty-{id}` (with `upload-meta-gen-{id}`), the editable fields
`upload-meta-title-{id}` / `upload-meta-description-{id}` (2026-10-08: both
hints read "ONE phrase … sentence case, no period"; Accept rewrites the
field to that phrase at once) /
`upload-meta-tags-{id}` (each with its live count), the per-field copy buttons
`upload-copy-{title,description,tags}-{id}`, the validation line
`upload-meta-validation-{id}`, and the actions row `upload-meta-state-{id}`
/ `upload-meta-usage-{id}` / `upload-meta-detail-{id}` /
`upload-meta-regen-{id}` / `upload-meta-accept-{id}` (disabled when accepted
and unedited).

Banners: `upload-warn-excluded`, `upload-warn-corrupt`,
`upload-warn-unreadable`, `upload-warn-interrupted` (a metadata request in
flight at restart — never resent automatically).

Status bar (`upload-statusbar`): `upload-status-counts`
("N processed · N partial · N failed · N stale"), `upload-status-provider`
("Gemini · {model}"), the key state, `upload-status-meta` /
`upload-status-export` ("… in flight").

Shared surfaces: `upload-toast` (`role="status"`), `upload-busy`. Undo of
settings **and selection** gestures uses global `hist-undo` / `hist-redo`
([§O](shared.md#o-global-history-bar-reset-actions-verified-2026-10-01));
metadata requests and exported files are not reversed.
