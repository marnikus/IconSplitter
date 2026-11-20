# Edit-mode cuts: fill regions and line tails (2026-11-20)

[path editor](svg-path-editor.md) · [tail cutter](svg-tail-cutter.md)

Two destructive gestures share **Alt + Shift** in edit mode. Both preview exactly
what they will remove, in red, while the keys are held, and both are ONE undo
step (Ctrl+Z) with no anchor selection left behind. The legend under the artboard
lists both (`hotkeys.ts`: "Alt+Shift+Click line" and "Alt+Shift+Click fill"), and
the line gesture wins when a click lands where both would apply.

| Gesture | What the red mark is | What the click does |
|---|---|---|
| Alt + Shift over a **line** | the part of that line a click would remove | removes it, splitting or opening the line |
| Alt + Shift over a **filled area** | the closed outline that paints that area | cuts it out: the area becomes a hole |

## Line tails (2026-11-20)

A *stretch* is the run of a line between two crossings — another line crossing
it, or ending on it. Until now a stretch needed a crossing on **both** sides of
the click, so the two tails of a line (before its first crossing, after its last
one) could not be removed at all: they are bounded by one line, not two. They
can now, the same way a bounded stretch is removed:

- the red mark runs from the **crossing to the line's open end** (either side),
- the click splits the line at that crossing (an anchor appears, the shape is
  kept) and drops the tail, leaving one open line whose end now sits exactly on
  the other line,
- a line with **no** crossing at all is not a tail: Alt + click already removes
  a whole segment, and a gesture that erased an un-crossed line would be a
  different, more destructive tool.
- a **closed** shape always has a crossing on both sides (it wraps), so its
  behaviour is unchanged.

`stretchAt` (`lib/pathedit/stretch.ts`) now returns `{from: 0, to}` or
`{from, to: segCount}` when only one crossing exists on an OPEN subpath; a closed
subpath keeps the old both-sides rule. `removeStretch` needed no change: its
`endOf` already maps the line's end to its last anchor.

## Fill regions (2026-11-20)

Hovering a **closed, filled** area with Alt + Shift marks that area's own
outline; the click cuts it out, so the paint inside it disappears (the classic
"hole in a sticker" edit — see the reference: pin with a filled centre → red
mark → white centre). Rules:

- the region is the **innermost closed subpath** whose interior holds the
  pointer (`lib/pathedit/region.ts` `regionAt`; flattened cubics, ray casting,
  smallest area wins). Open lines and lone segments are never regions.
- the cut is a **winding flip**: the subpath keeps its exact geometry and only
  its direction reverses (`cutRegion`), which under `fill-rule="nonzero"` (the
  default) turns the area from painted to hole. Clicking it again puts it back,
  and Ctrl+Z always does.
- under `fill-rule="evenodd"` a nested subpath is already a hole, so a cut is
  not offered there — the red mark is the whole answer: nothing to remove.
- the model is the only thing changed: handles are swapped with their anchors,
  so a curved region keeps its shape byte for byte (rounded through the same
  writer as every other edit).

## Where the code lives

| Piece | Owner |
|---|---|
| the red marks (line stretch, fill region) | `src/svg/pathedit/editoroverlay.ts` (`data-cut-hint`, `data-cut-region`) |
| the gesture rules (pure) | `lib/pathedit/linegesture.ts`, `lib/pathedit/gesture.ts` (`cutRegionHint`) |
| the stretch maths (pure) | `lib/pathedit/stretch.ts` |
| the region maths (pure) | `lib/pathedit/region.ts` |
| tests | `tests/pathedit_cut_between.test.ts`, `tests/pathedit_cut_tail.test.ts`, `tests/pathedit_region_cut.test.ts`, UI: `tests/pathedit_cut_between_ui.test.tsx`, `tests/pathedit_region_cut_ui.test.tsx` |
