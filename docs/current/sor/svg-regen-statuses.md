# Regenerate marks in Generate SVG (2026-11-06)

[Generate SVG owner](svg-generation.md) · [results](svg-generation-results.md) · [remove row](svg-remove-row.md)

Two more **item statuses**, beside ✓ approved / ✕ declined / ⚠ needs-review:

| Status | Label | Button | Colour |
|---|---|---|---|
| `regen-overlaps` | Regenerate SVG — overlaps | ⧉ | orange |
| `regen-geometry` | Regenerate SVG — geometry | △ | cyan |

## Contract

| Rule | Where |
|---|---|
| One catalog: `REVIEW_STATUSES` + `REVIEW_LABEL`; `isReview` accepts both, so the pair file keeps them (an older build reads them as unknown and derives the status) | `lib/svgmodel.ts` |
| Written like any decision: `decideReview` → the pair file, ONE `svgReview` history entry (Undo / Redo), announced to SVG to upload and Upload | `svg/reviewact.ts`, `svg/reviewundo.ts` |
| Not approved, so SVG to upload does not list the item and Upload hides its export | `upload/discovery.ts`, `lib/stockupload/discovery.ts` |
| A single-row mark auto-advances to the next pending row like ✓ / ✕ (pending / needs-review do not) | `reviewact.ts` `advanceSvgReview` |
| Review filter lists every status from the catalog; search matches the label ("overlaps", "geometry"); the tally counts both | `SvgListFilters.tsx`, `lib/svglist.ts`, `lib/svgfile.ts` |
| Regenerating still sets `needs-review` — the mark says why it had to be redone | `svg/runbatch.ts` |

No shortcut keys (A/D/W stay as they are). Handles: `svg-regen-overlaps-<id>`,
`svg-regen-geometry-<id>`, `svg-regen-overlaps-selected`,
`svg-regen-geometry-selected`; badge/row classes `regen-overlaps`,
`regen-geometry`. Tests: `svg_regen_statuses.test.ts`.
