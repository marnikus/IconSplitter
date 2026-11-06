# Remove a row — Generate SVG, SVG to upload, Upload (2026-11-04/06)

[Generate SVG owner](svg-generation.md) · [Selection V2 decisions](selection.md)

Generate SVG lists only images **approved** in Selection V2. "Remove" takes a
row out of that list by **declining its image in Selection V2** — exactly what
declining it there by hand does. Coming back to Selection V2 shows it declined;
approving it again there brings the row back on the next Generate SVG scan.

## Contract

| Rule | Where |
|---|---|
| Row button `Remove` and bulk `🗑 Remove selected` (checked rows) | `SvgRow.tsx`, `SvgBulkBar.tsx` |
| Writes the pair decision `declined` through Selection's own path, `applyDecisionPatch` (no second writer) | `src/svg/removerows.ts`, `selection/offline.ts` |
| Records Selection's own `"decisions"` history entry (before = the decision read from the pair file, after = declined): Undo restores it, Redo declines again | `removerows.ts`, `state/apply.ts` |
| Refused, writing nothing, for a row that is generating or waiting in the queue; a write that fails records nothing | `removerows.ts` |
| The file path looks under Selection's folder, then Generate SVG's (Selection V2 never opened there) | `offline.ts` `decisionRoots`, `state/handlekeys.ts` |
| Every decision written to files is announced (`onDecisionsWritten`); Generate SVG follows it: not approved → the row leaves the list and the selection; approved but not listed → rescan when idle | `offline.ts`, `removerows.ts` `reactToDecisions`/`useDecisionFollower` |
| Selection V2 re-reads pair files on every visit; Generate SVG rescans on return | `selection/rootsource.ts`, `SvgPanel.tsx` |

Remove is not the row's `✕` (that declines the SVG **version** review); it
changes the image's Selection decision. The activity bar shows the write.

## Handles

`svg-remove-<id>` (row, disabled while generating/queued), `svg-remove-selected`.

## Tests

`svg_remove_row.test.ts`: folder fallback + announcement, decline + history
entry, undo/redo through `applyEntry`, refusal of busy rows and failed writes,
the list's reaction, and the wiring.

<a id="upload"></a>

## SVG to upload and Upload (2026-11-06)

Same idea one step later: a row leaves a list by being **declined one step
earlier**. SVG to upload lists items approved in Generate SVG, so its Remove
declines the item **in Generate SVG**. Upload lists the exports of those
items, so its Remove declines the export's **source item** in Generate SVG too:
it leaves SVG to upload as well (the user chose "decline the whole chain").

| Rule | Where |
|---|---|
| Row `Remove` + bulk `🗑 Remove selected` in both tabs | `UploadRow.tsx`, `UploadBulkBar.tsx`, `StockUploadRow.tsx`, `StockUploadBulkBar.tsx` |
| Writes Generate SVG's item decision `declined` through its own path `applySvgReviewPatch`, ONE `"svgReview"` entry (before approved): Undo approves again, Redo declines | `svg/declineitems.ts`, `svg/reviewundo.ts` |
| Each record names its pair file (`at` = the tab's handle key + path), so the write lands even if Generate SVG never listed the item; a listed one goes through the mounted panel (its busy lock refuses) | `reviewundo.ts` `placeOf`, `reviewact.ts` |
| Every applied item decision is announced (`onSvgReviewsWritten`, also Generate SVG's own ✓/✕); both lists drop declined rows and their checks, and rescan for a re-approved row only while the tab is open (a visit rescans anyway) | `upload/removerows.ts`, `stockupload/removerows.ts` |
| Upload's scan reads the walk's pair files (`sourcePairsOf`, cached) and hides an export whose source pair is found and not approved (`audit.declinedSources`); no pair file under the folder (an `export/` picked alone) = still listed, Remove refused | `lib/stockupload/discovery.ts`, `stockupload/sourcepairs.ts` |
| Refused, writing nothing: SVG to upload rows exporting / getting metadata; Upload while uploading or for an export without a pair file; a failed write records nothing | both `removerows.ts` |

Export files on disk are never deleted. Handles: `upload-remove-<id>`,
`upload-remove-selected`, `stock-remove-<id>`, `stock-remove-selected`.
Tests: `upload_remove_row.test.ts`.
