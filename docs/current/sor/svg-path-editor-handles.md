# Path editor — handles and tests (2026-11-06)

Back to [the path editor](svg-path-editor.md).

## Handles

`svg-edit-btn-<id>`, `svg-edit-modal`, `svg-edit-<id>` (artboard, `data-stroke`
thin / preset), `-editor`, `-toolbar`, `-tool-select`, `-tool-draw`, `-stroke`,
`-position`, `-prev`, `-next`, `-legend`, `-finish`, `-cancel`, `-pick`,
`-leave`, `-leave-save`, `-leave-discard`, `-leave-stay`; `svg-edit-settings`,
`svg-edit-settings-dialog`, `svg-edit-anchor-px`, `svg-edit-pick-px`; `svg-edit-bg-<preset>`, `svg-edit-bg-custom`.

## Alt + click on a line (2026-11-09)

Select tool, on a line of a selected shape (not on a point: Alt on a point
still deselects it): `ops.removeSegment` removes just that segment. Both
anchors stay, every other segment keeps its exact shape; an open line splits
in two, a closed shape opens there, the handles of the removed segment go, a
lone point left behind goes. One session undo step; the anchor picks are
dropped. Legend: "Alt+Click line". Test: `pathedit_remove_segment.test.ts`.

**Alt + Shift + click** on a line removes the part between the two crossings
around the click, even with no anchors there (`stretch.ts`): a crossing is where
another line (or a far part of the same one) cuts it or ends on it. Anchors are
made on both crossings (the shape is kept), the part between goes: an open line
splits, a closed shape opens, an anchor inside goes too. It needs a crossing on
both sides of an open line (else nothing happens). While both keys are held
over a line the part is drawn red (`cutHint`, overlay `data-cut-hint`, never
written; it follows the next pointer move). One undo step. Tests:
`pathedit_cut_between.test.ts`, `pathedit_cut_between_ui.test.tsx`.

## Beyond the artboard's border (2026-11-10)

A 72 px **pasteboard** ring (a spread shadow on `.svg-edit-board`, under the art)
surrounds the artboard and the frame clips only at its outer edge. The picture
does not clip (`svg{overflow:visible}` in the shadow root), so **lines, anchors
and handles** beyond the border are drawn there, and they **react like anywhere
else**: a transparent layer behind the art (`<testid>-pasteboard`,
`.svg-edit-pasteboard`) takes the same pointer handlers as the art
(`useEditorInput` `margin`) — press, drag, pick, hover cursor, and the wheel
zoom / middle-drag pan (they bubble to the board). The bar, arrows, AI panel and
legend are lifted above that layer (`z-index: 2`) because it reaches under them.
Test: `pathedit_outside_board.test.tsx`.

## Select all and whole lines (2026-11-10)

**Ctrl + A** selects every object on the artboard and all their anchors
(`keys.selectAll`; the browser's select-all never runs; not an edit, no undo
step). **Double-click** a line (or one of its points) selects that whole line;
**Shift + double-click** adds it to the selection, **Alt + double-click**
excludes it (`linegesture.doubleClick`); a Shift + click on a line adds its two
points. Alt + click removes a segment, so an Alt + double-click first takes back
a removal its own first click made (`EditorState.lineCut`, within 0.8 s; no undo
step is left). Tests: `pathedit_select_lines.test.ts`, `pathedit_select_lines_ui.test.tsx`.

## Skew by angle from a box edge (2026-11-09)

With two or more points selected, a drag **along a box edge** (between the corner
squares) skews them like Photoshop (`skew.ts`): about the box **centre**, the
dragged edge follows the pointer and the opposite edge goes the other way;
tan(angle) = travel ÷ the edge's distance from the centre, so it is an angle
(a shear: lengths along the sheared axis stay). Top / bottom edges shear x,
left / right edges shear y. **Shift** snaps to 15°; never past 85°. Cursor: a
double arrow parallel to the edge. While dragging, the overlay shows the skewed
box (`data-skew-quad`), the centre crosshair (`data-skew-pivot`) and
"⊿ : -11.6°" beside the pointer (`data-skew-readout`); `EditorState.skewHint`,
never written. One undo step. Test: `pathedit_skew.test.ts`.

## Tests

`pathedit_core.test.ts` (model, ops, hit/snap, gestures, file), `pathedit_objects.test.ts`, `pathedit_live_shapes.test.tsx` (moved circle drawn live, no guide in preset), `pathedit_nudge.test.tsx` (arrow keys), `pathedit_copy_drag.test.ts` (copy / paste, drag by a selected line), `pathedit_scale.test.ts` (box, free / proportional / edge scale), `pathedit_line_ops.test.ts` (double-click, Ctrl+click, Delete / Ctrl+Delete), `pathedit_select_mods.test.ts` (Shift adds, Alt removes), `pathedit_shapes.test.ts` (shapes as objects, thin-line picking, shape → path write), `pathedit_pick_tolerance.test.tsx` (tolerance rule + setting)
(objects: select, Shift, Esc, marquee, joint moves, snap to unselected, per-object write), `pathedit_bg.test.tsx` (artboard background), `pathedit_modal.test.tsx` (full-screen mode: layout, keys, rows, Save/Discard, 50-step history), `pathedit_ui.test.tsx`
(session in the page, Finish + undo/redo, Edit settings, wiring).

<a id="edit-settings"></a>

## Edit settings

`svg/EditSettingsButton.tsx`, `svg/editsettings.ts` (`iconSplitter.svg.editSettings.v1`):
anchor point size 4–24 px (default 10), used by the editor and the Ctrl-hover
dots (`anchoroverlay.ts`); **click tolerance to select a shape** 2–40 px
(default 14): how far from a (thin) shape's line a single click still picks it.

<a id="rotate"></a>

## Rotate (2026-11-06)

With 2+ points selected the scale box has a rotate handle: a circle on a 24 px
stem above the top edge. Dragging it turns the selected points and their curve
handles around the box's centre (`scale.rotateAnchors`, `rotateAngle`); Shift
snaps to 15° steps; one drag = one undo step. **Corner zones**: just outside a
corner, past its scale handle (≤ 20 px), the cursor turns into a rotate cursor
and a drag rotates the same way; scale handles show resize cursors
(`boxtarget.boxTargetAt` / `boxCursorAt`, shared by press and hover). Handles: `[data-rotate-handle]`,
`[data-rotate-stem]` in the overlay. Tests: `pathedit_rotate.test.ts`, `pathedit_rotate_zones.test.tsx`.
