# Remove a row from Generate SVG (2026-11-04)

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
