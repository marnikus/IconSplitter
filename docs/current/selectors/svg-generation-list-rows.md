# Generate SVG — row selectors

Object shape: [shared conventions](shared.md#i-selector-object-structure--for-every-element).
The list chrome, filters and bulk bar live in [filters and bulk bar](svg-generation-list.md).
Part of [Generate SVG selectors](svg-generation.md).

## Rows (`svg-rows`, `role="listbox"`, rows in `svg-list`)

| Test id | Element | Notes |
|---|---|---|
| `svg-row-{sourceId}` | row `role="listitem"` | `aria-current` = active; plain click activates, not checks; Shift range / Ctrl, Alt, Cmd toggle (I-73) |
| `svg-check-{sourceId}` | checkbox | `aria-label="Select {base}"`; toggles just this check, not active/anchor |
| `svg-ai-{sourceId}` | thumbnail | the approved AI image (`<img>` in the `svg-thumb` box, `object-fit: contain`); missing → placeholder of the same size |
| `svg-base-ai-{sourceId}` | third preview slot "Base · Stroke" | only a row shown in a registered image style (2026-11-16) has it: the base line-stroke AI image beside the style's own AI source and SVG; its bar cell in the strip under the previews stays empty — the base image has no versions of its own (2026-11-17) |
| `svg-prev-{sourceId}` | inline preview | the selected (else newest valid) SVG, rendered INLINE in an open shadow root (`el.shadowRoot.querySelector("svg")`); square frame, the same `svg-thumb` px box as the AI thumbnail beside it; `data-version` = the version Copy hands over; empty (no SVG yet) shows "No SVG", an un-previewable file shows "Preview failed" + `data-error` (e.g. `not well-formed XML`) |
| `svg-prev-frame-{sourceId}` | frame around the SVG preview | `data-bg` = the chosen colour; class `contrast` when the frame needs the light outline (black artwork under 3:1); the inline host is a child of it, so the colour is what the artwork is painted on; the AI thumbnail is never inside it |
| `svg-ver-bar-{sourceId}` / `svg-ver-chip-{sourceId}-{n}` | SVG version chips | generated + valid only, 2+ versions; `primary`/`data-active`/`aria-pressed`; click [chooses it for use/export](../sor/version-acceptance.md) and never approves the row. The bar sits in the strip's cell UNDER the SVG preview: one cell per preview slot, in slot order and slot width (2026-11-17), so chips never shift under a preview they do not switch |
| `svg-location-{sourceId}` / `svg-copy-{sourceId}` | buttons | "Location" copies the **folder of the file the row names** (I-56: the same path `svg-target-{id}` shows, minus the file name — `…\<piece>\split_04`); "Copy" puts that version's SVG source on the clipboard. Neither is disabled by the folder's depth, and neither ever copies a file path |
| `svg-code-{sourceId}` / `svg-history-{sourceId}` | buttons | the code dialog and the **version chooser** (I-54); disabled with no SVG / no recorded version |
| `svg-generate-{sourceId}` / `svg-needs-review-{sourceId}` / `svg-approve-{sourceId}` / `svg-decline-{sourceId}` | buttons | per-row Generate or Regenerate + review: needs-review (⚠ yellow, regenerated — new review) near approve/decline; approve/decline disabled until a version exists; regeneration automatically sets needs-review |
| `svg-status-{sourceId}` | badge | "Not Generated" / "Generating" / "Generated" / "Failed" / "Unknown" (a request whose outcome was never confirmed — never shown as Failed); its `title` is the row error, e.g. "outcome unknown — request req\_… ; it has not been resent." |
| `svg-review-{sourceId}` | badge | the ITEM's one status — pending / approved / declined / needs-review (regenerated — new review, yellow); display and version choice change nothing |
| `svg-usage-{sourceId}` | text | two halves: `svg-usage-svg-{sourceId}` ("SVG gen." — the shown SVG version) and, once the pair has an image history, `svg-usage-img-{sourceId}` ("Image gen." — the main AI image, or "original"); each: version, tokens and the cost as reported / **Estimated** ("no cost reported" when unknown); the `title` carries the audit line (model · currency · pricing version · basis) |
| `svg-target-{sourceId}` | text | the SVG this row owns: the selected (else newest valid) version's real path, or — while nothing exists yet — the path generation will write ("2026-10/…/split\_01/icon\_…\_01.svg"). Never the pair file's name; the doubled folder prefix bug (svgPath is already root-relative) is fixed by this handle's rule |
| `svg-persist-{sourceId}` | text | "Pair file saved" / "Not generated yet" / "Pair file unreadable — SVGs on disk are kept"; the `title` names the pair's own file ("architecture/fog\_AI.svg.json" — the JSON record BESIDE the SVG, not a second extension of it, I-41); `error` class on failure |
| `svg-problem-{sourceId}` | text | the row's scan status when a file of a **listed** source needs attention: "Reference missing" / "Unreadable file" (several reasons joined by " · "); its `title` is the full per-file reason ("no AI result (court\_AI.png) beside architecture/court.png"). An unreadable file or a missing reference is a status on the row, never a removal — but a missing **AI image** means there is no row at all (I-31): that source appears in `svg-warn-excluded` instead |

Image regeneration row controls, in-flight state, and version chips are [documented separately](svg-image-edits.md#image-regeneration-actions-and-row-feedback).

Status badge while a row waits in the queue: `svg-status-{sourceId} .svg-badge`
reads "Next attempt" with class `queued` (grey); the row's own status is back the
moment the batch is dropped (I-53). `svg-generate-{sourceId}` while a run is in
flight opens the same explicit prompt/input popup as idle; independent work can start immediately, while conflicts wait.
