# Path editor — handles and tests (2026-11-06)

Back to [the path editor](svg-path-editor.md).

## Handles

`svg-edit-btn-<id>`, `svg-edit-modal`, `svg-edit-<id>` (artboard, `data-stroke`
thin / preset), `-editor`, `-toolbar`, `-tool-select`, `-tool-draw`, `-stroke`,
`-position`, `-prev`, `-next`, `-legend`, `-finish`, `-cancel`, `-pick`,
`-leave`, `-leave-save`, `-leave-discard`, `-leave-stay`; `svg-edit-settings`,
`svg-edit-settings-dialog`, `svg-edit-anchor-px`, `svg-edit-pick-px`; `svg-edit-bg-<preset>`, `svg-edit-bg-custom`.

## Tests

`pathedit_core.test.ts` (model, ops, hit/snap, gestures, file), `pathedit_objects.test.ts`, `pathedit_live_shapes.test.tsx` (moved circle drawn live, no guide in preset), `pathedit_scale.test.ts` (box, free / proportional / edge scale), `pathedit_line_ops.test.ts` (double-click, Ctrl+click, Delete / Ctrl+Delete), `pathedit_select_mods.test.ts` (Shift adds, Alt removes), `pathedit_shapes.test.ts` (shapes as objects, thin-line picking, shape → path write), `pathedit_pick_tolerance.test.tsx` (tolerance rule + setting)
(objects: select, Shift, Esc, marquee, joint moves, snap to unselected, per-object write), `pathedit_bg.test.tsx` (artboard background), `pathedit_modal.test.tsx` (full-screen mode: layout, keys, rows, Save/Discard, 50-step history), `pathedit_ui.test.tsx`
(session in the page, Finish + undo/redo, Edit settings, wiring).
