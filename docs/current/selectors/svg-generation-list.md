# Generate SVG — filters, bulk bar and rows

Selector priority and object shape: [shared conventions](shared.md#i-selector-object-structure--for-every-element). Part of [Generate SVG selectors](svg-generation.md).

Filters: `svg-filter-generation` (all / not generated / generating / generated
/ failed), `svg-filter-review` (all / pending / approved / declined / needs-review),
`svg-sort` (date / name / generation / review / cost), `svg-search` (matches the
file name too), `svg-shown` ("Showing N of M"), `svg-clear-filters`.

## Bulk bar (`svg-bulk`)

| Test id | Element | Notes |
|---|---|---|
| `svg-bulkbar-pin` | sticky wrapper of the bulk bar | pins the whole bar to the top while rows scroll (`position: sticky` in `.app-main`, 2026-10-19) |
| `svg-check-all` | header checkbox | checked / unchecked / **indeterminate**; toggles visible checks only, keeps hidden |
| `svg-selected-count` / `svg-scope` | text | "N selected", "across N approved sources" |
| `svg-select-visible` / `svg-deselect` | buttons | add visible / clear ALL checks including hidden |
| `svg-thumb` | `input[type=range]` | the ONE zoom value: in px, **48–800** step 4; it sizes BOTH previews, the row's minimum height and the previews column (inline `--svg-thumb` on `svg-panel`); `svg-thumb-value` is the live readout. Same range, same rule and the same shared layout as Selection V2's `v2-thumb` (I-55 — one implementation, `lib/zoom` + `ui/PairedThumbs`) |
| `svg-bg` | swatch group | **preview background**, app-side only — presets `svg-bg-white` / `svg-bg-black` / `svg-bg-gray` / `svg-bg-green` / `svg-bg-red` (each `aria-pressed`), `svg-bg-custom` (`input[type=color]`, `aria-label="Custom preview background"`), `svg-bg-value` (live label, follows the choice) |
| `svg-stroke-control` → `svg-stroke` / `svg-stroke-value` / `svg-stroke-reset` | preview stroke width | text field (placeholder `default`, 0–50 px, `aria-invalid` on bad text), live label, Reset (disabled at default); preview only, screen px (`vector-effect: non-scaling-stroke`, same visible width for every viewBox) — row thumbnails adopt one shared sheet (2026-10-19) |
| `svg-estimate` | text | token estimate for the selection |
| `svg-generate-selected` | button | "✦ Generate selected" — unchanged: arms first (`Confirm SVG generation`), then queues/sends all checked rows, including rows with no SVG; **stays enabled while a run is in flight** (I-53), disabled only at 0 selected |
| `svg-regenerate-selected` | button | "↻ Regenerate selected (N)" — N counts only checked rows whose `row.newest !== null`; disabled at 0. The shared confirmation is titled "Confirm SVG regeneration" and previews/sends only those rows, excluding checked rows with no generated SVG. Bulk regeneration appends behind a run in flight (I-53) |
| `svg-needs-review-selected` / `svg-approve-selected` / `svg-decline-selected` | buttons | review the selection (needs-review = yellow warning, regenerated — new review); disabled at 0 |
| `svg-cancel-run` / `svg-batch-progress` | while running | cancellation + per-batch progress; the progress line carries the same ticking `svg-bulk-elapsed` as the strip |

New lists start unchecked; selection gestures use global Undo ([RULE 25](../rules/BEHAVIOR.md#rule-25)). ↑/↓ move active; E/Q check/uncheck, Space toggles; A/D/W review the active valid SVG. Paid actions still require the exact-input confirmation. The image batch action and Stop control are [owned by AI-source image edits](svg-image-edits.md#image-regeneration-actions-and-row-feedback).

## Rows (`svg-rows`, `role="listbox"`, rows in `svg-list`)

| Test id | Element | Notes |
|---|---|---|
| `svg-row-{sourceId}` | row `role="listitem"` | `aria-current` = active; plain click activates, not checks; Shift range / Ctrl, Alt, Cmd toggle (I-73) |
| `svg-check-{sourceId}` | checkbox | `aria-label="Select {base}"`; toggles just this check, not active/anchor |
| `svg-ai-{sourceId}` | thumbnail | the approved AI image (`<img>` in the same `svg-thumb` square box, `object-fit: contain`); missing → placeholder of the same size |
| `svg-prev-{sourceId}` | inline preview | the newest valid SVG, rendered INLINE in an open shadow root (`el.shadowRoot.querySelector("svg")`); square frame, the same `svg-thumb` px box as the AI thumbnail beside it; `data-version` = the version Copy hands over; empty (no SVG yet) shows "No SVG", an un-previewable file shows "Preview failed" + `data-error` (e.g. `not well-formed XML`) |
| `svg-prev-frame-{sourceId}` | frame around the SVG preview | `data-bg` = the chosen colour; class `contrast` when the frame needs the light outline (black artwork under 3:1); the inline host is a child of it, so the colour is what the artwork is painted on; the AI thumbnail is never inside it |
| `svg-ver-bar-{sourceId}` / `svg-ver-chip-{sourceId}-{n}` | SVG version chips under the SVG preview | one chip per generated + valid version, only when there are 2+ (2026-10-19); the shown one has class `primary`, `data-active="true"`, `aria-pressed`; a click = the version chooser's "Use this version" (same toast, pair-file write); the AI chips sit in the cell beside it |
| `svg-location-{sourceId}` / `svg-copy-{sourceId}` | buttons | "Location" copies the **folder of the file the row names** (I-56: the same path `svg-target-{id}` shows, minus the file name — `…\<piece>\split_04`); "Copy" puts that version's SVG source on the clipboard. Neither is disabled by the folder's depth, and neither ever copies a file path |
| `svg-code-{sourceId}` / `svg-history-{sourceId}` | buttons | the code dialog and the **version chooser** (I-54); disabled with no SVG / no recorded version |
| `svg-generate-{sourceId}` / `svg-needs-review-{sourceId}` / `svg-approve-{sourceId}` / `svg-decline-{sourceId}` | buttons | per-row Generate or Regenerate + review: needs-review (⚠ yellow, regenerated — new review) near approve/decline; approve/decline disabled until a version exists; regeneration automatically sets needs-review |
| `svg-status-{sourceId}` | badge | "Not Generated" / "Generating" / "Generated" / "Failed" / "Unknown" (a request whose outcome was never confirmed — never shown as Failed); its `title` is the row error, e.g. "outcome unknown — request req\_… ; it has not been resent." |
| `svg-review-{sourceId}` | badge | pending / approved / declined / needs-review (regenerated — new review, yellow) |
| `svg-usage-{sourceId}` | text | two halves: `svg-usage-svg-{sourceId}` ("SVG gen." — the shown SVG version) and, once the pair has an image history, `svg-usage-img-{sourceId}` ("Image gen." — the main AI image, or "original"); each: version, tokens and the cost as reported / **Estimated** ("no cost reported" when unknown); the `title` carries the audit line (model · currency · pricing version · basis) |
| `svg-target-{sourceId}` | text | the SVG this row owns: the newest version's real path, or — while nothing exists yet — the path generation will write ("2026-10/…/split\_01/icon\_…\_01.svg"). Never the pair file's name; the doubled folder prefix bug (svgPath is already root-relative) is fixed by this handle's rule |
| `svg-persist-{sourceId}` | text | "Pair file saved" / "Not generated yet" / "Pair file unreadable — SVGs on disk are kept"; the `title` names the pair's own file ("architecture/fog\_AI.svg.json" — the JSON record BESIDE the SVG, not a second extension of it, I-41); `error` class on failure |
| `svg-problem-{sourceId}` | text | the row's scan status when a file of a **listed** source needs attention: "Reference missing" / "Unreadable file" (several reasons joined by " · "); its `title` is the full per-file reason ("no AI result (court\_AI.png) beside architecture/court.png"). An unreadable file or a missing reference is a status on the row, never a removal — but a missing **AI image** means there is no row at all (I-31): that source appears in `svg-warn-excluded` instead |

Image regeneration row controls, in-flight state, and version chips are [documented separately](svg-image-edits.md#image-regeneration-actions-and-row-feedback).

List chrome: `svg-row-count` (visible rows), `svg-running-count`,
`svg-queued-count` ("N next attempt" — rows waiting in a queued batch, I-53),
`svg-attention-count` (rows needing attention), `svg-empty` ("No approved
source matches these filters."), `svg-footer-summary` (`shownLabel`).

Status badge while a row waits in the queue: `svg-status-{sourceId} .svg-badge`
reads "Next attempt" with class `queued` (grey); the row's own status is back the
moment the batch is dropped (I-53). `svg-generate-{sourceId}` while a run is in
flight queues that source FIRST, with no dialog (idle: the dialog as before).
