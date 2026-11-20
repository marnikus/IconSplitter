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
| Alt + Shift over a **filled area** | the closed ring under the pointer | cuts it out: the area becomes a hole |

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

Hovering a **painted area** with Alt + Shift marks the closed ring under the
pointer; the click cuts it out, so the paint inside it disappears (the classic
"hole in a sticker" edit). The artboard repaints each shape from the working
model, so the hole is visible at once — no Finish needed to see it.

- the mark is the **innermost closed ring** holding the pointer
  (`lib/pathedit/region.ts` `regionAt`; flattened cubics, ray casting, smallest
  area wins). Open lines are never rings, and a point that is **already a hole**
  has nothing to cut: no mark, no undo step.
- **only filled rings paint.** `fill="none"` — the shape's own or inherited from
  its `<g>` (`fill-rule` likewise) — paints no area, so a stroked circle inside a
  filled pin neither makes the middle a hole nor blocks the gesture: it is the
  **cutter**. The stroked path keeps its look; the paint behind it is what moves.
- the cut subtracts from **every object that paints** at the pointer, not only
  the innermost one: white art on white art (a shape inside a shape) is still
  paint, so knocking out just the top layer would leave a hole nobody can see.
  Per object that paints there:
  - whatever that object drew **inside** the cut goes with it — the ring of an
    earlier hole, a small shape that lived there — the area is being emptied
    anyway, and a leftover ring would only have to be cancelled again;
  - `nonzero` — copies of the cutter ring are added to that object's `d`, walked
    against its winding (|winding| copies); when the cutter is itself the inner
    ring of a two-ring cancel, it is simply walked the other way (anchors
    reversed, handles swapped) and no extra geometry appears;
  - `evenodd` — direction means nothing, the count of rings does; ONE added ring
    flips the parity and the area is a hole.
- a cut only ever changes paint **inside its own ring**: an earlier hole stays a
  hole when a later cut is made next to it, and one that the new cut swallows
  stays empty (2026-11-20, fourth round — a second cut used to paint the first
  hole back in).
- **the hole belongs to the fill as one object** (2026-11-20, fifth round):
  copying a `fill="none"` cutter into an `evenodd` shape stamps `fillRule:
  "evenodd"` on the new hole ring (`region.ts` `copyOf`), and all area-sharing
  closed filling rings of the same `owner` move together as one piece (`fill.ts`
  `pieceAnchors` / `paintedPieceAt`). Dragging the painted interior, or
  double-clicking its edge, anchor, hole border or painted body (then dragging,
  Arrow-nudging, scaling, rotating, skewing or copying), carries every hole of
  that fill along at the same offset while keeping disjoint glyphs separate;
  `Alt+Double-click` still excludes a single ring.
- **partially overlapping cutters subtract only their overlap (`Fill \ Cutter`)**
  (2026-11-20, sixth round): when a closed cutter crosses a filled shape's edge
  or an existing hole instead of lying strictly inside it, appending the whole
  ring would invert the cutter's unpainted overhang into fill (`evenodd` parity
  `0 → 1`, `nonzero` winding `0 → −1`). `boolean.ts` (`clipLayerIfPartial`,
  `clippedRegionAt`) and `curvecut.ts` split both shapes at their exact cubic /
  line crossings, clip the red preview to `Fill ∩ Cutter` (ranking candidate
  cutters by that painted bite), and trace the exact Bezier boundary of
  `Fill \ Cutter` so nothing outside the fill ever turns painted.
- one cut = one undo step, selection cleared; Ctrl+Z restores the exact previous
  path data (a hole is never "cut back" by a second click).

## Where the code lives

| Piece | Owner |
|---|---|
| the red marks (line stretch, fill region) | `src/svg/pathedit/editoroverlay.ts` (`data-cut-hint`, `data-cut-region`) |
| the gesture rules (pure) | `lib/pathedit/linegesture.ts`, `lib/pathedit/gesture.ts` (`cutRegionHint`, `pressPaint`) |
| compound fill + hole piece | `lib/pathedit/fill.ts` (`pieceAnchors`, `paintedPieceAt`) |
| partial-overlap Bezier boolean | `lib/pathedit/boolean.ts`, `lib/pathedit/curvecut.ts` (`clipLayerIfPartial`, `clippedRegionAt`) |
| the stretch maths (pure) | `lib/pathedit/stretch.ts` |
| the region maths (pure) | `lib/pathedit/region.ts` (`ringsAt`/`paintedSubAt`/`cutRegion`) |
| what paints where | `lib/pathedit/svgdoc.ts` (`fill`/`fill-rule`, `<g>` inheritance) → `SubPath.paints`/`fillRule` in `model.ts`, set by `objects.ts` |
| tests | `tests/pathedit_cut_between.test.ts`, `tests/pathedit_cut_tail.test.ts`, `tests/pathedit_region_cut.test.ts`, `tests/pathedit_object_move.test.ts`, `tests/pathedit_partial_cut.test.ts`, UI: `tests/pathedit_cut_between_ui.test.tsx`, `tests/pathedit_region_cut_ui.test.tsx` |
