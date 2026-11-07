# Sheets and batch tests

Focused test inventory; [all tests](../TESTS.md).

* `detect.test.ts` — box count, margins, radius merge/split, dust filter, reading order
* `analyze.test.ts` — background/threshold/mask/ink, transparency-as-white, downscale, analyze→detect end-to-end
* `render.test.ts` — squareInfo/cropRect geometry
* `render_icon.test.ts` — sizing/clamps, bg fill + neighbour wipe + restore, transparent pass, blob gate
* `sheetsel.test.ts` — checked-sheet export set/total, merge targets, % ↔ fraction clamp
* `sheets_multi_export.test.tsx` — ZIP/folder hold every checked sheet's included icons, result-grid exclusion, typed merge %, merge on all checked sheets, no Download files button (harness: `helpers/sheetsHarness.tsx`)
* `sheets_list_gestures.test.tsx` — RULE 25 sheet checks: default checked, header tri-state, Ctrl/Shift click, Up/Down + E/Q, remove prunes
* `naming.test.ts` — `_AI` parse, reference derivation, split/variation names, batch path
* `scan.test.ts` — recursive walk + ignore, eligibility, ref linking, scan diff
* `statefile.test.ts` — merge semantics, statuses, corrupt-payload rejection
* `presets.test.ts` — defaults, validation clamps, list round-trip, apply
* `output_plan.test.ts` — layout, `_vNN` collisions, existing-folder respect
* `fs.test.ts` — tree read, no-overwrite write, nested dirs, copy (fakes)
* `batchsplit.test.ts` — one blob per icon, honest empty sheet
* `process.test.ts` — full output tree, deleted/failed isolation, stop, ref copy
* `statewrite.test.ts` — per-reference JSON write, missing retention, corrupt replace
* `store.test.ts` — preset persistence, corrupt rejection, last-used name
* `batch_selection_v2.test.tsx` — active vs checked, plain/modified/Shift row
  gestures, checkbox, tri-state header, filtered/hidden checks, Q/E and one
  global undo entry per changed gesture. RULE 25 acceptance also requires an
  initially checked eligible rows and Deselect all clearing hidden checks; processing
  files is not an undoable selection gesture.
