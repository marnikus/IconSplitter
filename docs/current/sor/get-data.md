# Get data — copy the selected rows' names, status and paths (2026-11-10)

[Shared shell](shared.md) · [List selection and filters](list-selection-filters.md) ·
[Activity bars](activity-bars.md)

Every tab with rows to select has a **⧉ Get data** button in its bar. It is off
while nothing is selected. Pressed, it opens a dialog (`ui/GetDataDialog.tsx`)
with four checkboxes — **SVG file name**, **PNG file name** (separate choices),
**Status (generation, review …)** and **File path** — a live preview of the
list, and **Copy**. The list goes to the clipboard separated with commas; a
blocked clipboard says so and never claims it copied.

## The list (`lib/getdata.ts`, pure)

- **One choice** → one line of comma-separated values (paste it anywhere, e.g.
  into "Remove unsuccessful uploads"): `fish.svg, owl.svg`.
- **Several choices** → one line per row, that row's info separated with commas,
  in the dialog's order (SVG, PNG, status, path): `fish.svg, fish_AI.png, Generated · Approved`.
- A status joins its parts with ` · ` so the comma stays the separator.
- **Path** follows the ticked names (SVG's, PNG's, both once if equal); with no
  name ticked it is the row's main file: the SVG, else the PNG.
- A row without a file adds nothing for it (no empty entries); a row with
  nothing for the choice is left out. A value with a comma, quote or line break
  is quoted like CSV. The first open has SVG + PNG names ticked; the last choice
  is kept for the session only (`ui/getdatachoice.ts`, no storage key).

## What each tab hands over (selected rows only, list order)

| Tab | Button id | Mapper | SVG / PNG / status |
|---|---|---|---|
| Batch folders | `batch-get-data` | `batch/getdatarows.ts` | – / the image / split status · review |
| Selection V2 | `v2-get-data` | `selectionv2/getdatarows.ts` | – / the AI image (else the original) / decision |
| Generate SVG | `svg-get-data` | `svg/getdatarows.ts` | shown version's SVG / the AI source / generation · review |
| SVG to upload | `upload-get-data` | `upload/getdatarows.ts` | approved SVG / the AI PNG / export status · metadata state |
| Upload (stock) | `stock-get-data` | `stockupload/getdatarows.ts` | exported SVG / exported PNG (a JPEG is not a PNG) / per stock "Adobe Stock: uploaded", else "not uploaded" |
| Single sheets | `sheet-get-data` | `sheets/getdatarows.ts` | – / the sheet's file name (an upload has no folder: no path) / "N of M icons" |
| SVG builder | `builder-get-data` | `svgBuilder/getdatarows.ts` | placed icons' approved SVG / – / Approved |

Handles per tab id `<id>`: `<id>-get-data`, `-get-data-dialog`,
`-get-data-field-{svg,png,status,path}`, `-get-data-preview`, `-get-data-copy`,
`-get-data-copied`, `-get-data-error`, `-get-data-close`.

Tests: `getdata.test.ts` (the list rules), `getdata_ui.test.tsx` (button and
dialog), `getdata_rows.test.ts` (each tab's mapper), `getdata_wired.test.ts`
(every tab has the button).
