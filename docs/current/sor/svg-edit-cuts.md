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
| Alt + Shift over a **filled area** | the closed ring that paints that area | cuts it out: the area becomes a hole |

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

Hovering a **painted area** with Alt + Shift marks that area's own outline; the
click cuts it out, so the paint inside it disappears (the classic "hole in a
sticker" edit — pin with a filled centre → red mark → white centre). The
artboard repaints each shape from the working model, so the hole is visible at
once — no Finish needed to see it. Rules:

- the region is the **innermost closed ring that paints the pointer**
  (`lib/pathedit/region.ts` `regionAt`; flattened cubics, ray casting, smallest
  area wins). "Paints" is the shape's own `fill-rule`: open lines are never
  regions, and neither is a point the rule leaves as a hole.
- **what the cut does depends on the rule**, because only the paint has to go:
  - `nonzero`, nested in another painting ring — the ring is walked the other
    way (winding cancels the ring around it); anchors and handles are unchanged
    in number and position, a curved ring keeps its shape byte for byte.
  - `nonzero`, nothing painting around it — the common one-ring icon: the same
    ring walked back paints the same pixels, so the click adds a reversed
    **twin** of it. The two cancel: the area is empty, and the drawn ring stays.
  - `evenodd` — direction means nothing, only the count of rings; the click adds
    **one extra ring** (same walk) and the parity makes the hole.
- a point that is **already a hole** is not offered: no red mark, no undo step.
  Undo (Ctrl+Z) is how a cut comes back; clicking the hole again does nothing.
- one drag = one undo step, selection cleared, and Ctrl+Z restores the exact
  previous path data.

## Where the code lives

| Piece | Owner |
|---|---|
| the red marks (line stretch, fill region) | `src/svg/pathedit/editoroverlay.ts` (`data-cut-hint`, `data-cut-region`) |
| the gesture rules (pure) | `lib/pathedit/linegesture.ts`, `lib/pathedit/gesture.ts` (`cutRegionHint`) |
| the stretch maths (pure) | `lib/pathedit/stretch.ts` |
| the region maths (pure) | `lib/pathedit/region.ts` (`ringsAt`/`painted`/`cutRegion`), `fill-rule` read in `lib/pathedit/svgdoc.ts` |
| tests | `tests/pathedit_cut_between.test.ts`, `tests/pathedit_cut_tail.test.ts`, `tests/pathedit_region_cut.test.ts`, UI: `tests/pathedit_cut_between_ui.test.tsx`, `tests/pathedit_region_cut_ui.test.tsx` |
