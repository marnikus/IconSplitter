# Thumbnail zoom and preview colour fidelity — design (2026-10-02)

Reported after the preview-colour round:

* *"was not fixed. see ref."* (the reference screenshot)
* *"zoom also zoom both thumbnails."*

## What the zoom actually did

The Generate SVG row shows two thumbnails of one source: the approved AI image
(`svg-ai-*`) and the newest saved SVG (`svg-prev-*`). The zoom slider
(`src/svg/SvgBulkBar.tsx`, 48–240 px, `src/lib/reviewprefs.ts`) is one value,
`thumb`, handed to both:

* the SVG side is a **square frame** of exactly `thumb` px
  (`SvgPreview.tsx` → `style={{ width: size, height: size }}`) — it zooms;
* the AI side is an `<img height={thumb}>` whose CSS is
  `width: auto; max-width: 116px; object-fit: contain`
  (`src/index.css` `.svg-thumb`) — above ~116 px the box is clamped, so
  `object-fit: contain` letterboxes the picture and the image **stops growing**
  while the SVG frame keeps growing.

That is the defect: one slider, two geometries. At the default 84 px the pair
matches; at 240 px the AI thumbnail is still 116 px wide and the pair is visibly
mismatched.

## The fix — one geometry for both sides

Both thumbnails become the same square of the zoom size, and the AI image is
fitted into it with `object-fit: contain` — exactly what the SVG frame already
does with `preserveAspectRatio="xMidYMid meet"`. One value, one geometry, no
per-side cap:

* `SvgThumbs.tsx` — the `<img>` gets an explicit `width` beside its `height`, so
  the element is the square the zoom asked for instead of an aspect-driven box
  with a pixel cap.
* `src/index.css` — `max-width: 116px` is gone from `.svg-thumb`; the border,
  radius and background stay, so a letterboxed image still reads as a card.

A very wide source (512×128) is letterboxed inside the square, which is the same
treatment its SVG twin already gets — the pair stays comparable.

## The defect the first attempt caused: the row overlapped itself

Making both thumbnails the square of the zoom exposed the next problem, reported
straight away: *"UI is brocken no correct zoom. some overlapping of SVG part.
overlating text as zoonm bigger"*. The row is a grid whose **second column held
both thumbnails at a fixed 220px**:

```css
.svg-columns, .svg-row {
  grid-template-columns: 34px 220px minmax(280px, 1fr) 122px 118px 130px 158px 210px;
}
```

Two 84px thumbnails fit inside 220px, so nothing showed; two 240px ones are
488px, and a grid item does not shrink its column — it overflows it, straight
across the file / status / review columns. The zoom itself was never broken; the
column it grows into was.

**The fix.** `src/svg/SvgList.tsx` publishes the zoom as `--svg-thumb` on the
list (the same idiom `src/selectionv2/ReviewList.tsx` already uses), and the
column is derived from it:

```css
grid-template-columns: 34px calc(var(--svg-thumb) * 2 + 8px) minmax(280px, 1fr) 122px 118px 130px 158px 210px;
```

Two squares plus the 8px gap of `.svg-thumbs`, at whatever the zoom is. The
column header and every row compute the same width from the same variable, so
they stay on the same columns at every step, the row's `min-height` (which
already read the variable) becomes truthful instead of stuck at 84px, and a row
that no longer fits simply scrolls — `.svg-rows` is `overflow: auto`, and the
row was already wider than a laptop screen before the zoom existed.

`tests/svg_layout.test.ts` reads the stylesheet for this contract, because a
cascade regression is invisible to a DOM assertion; `tests/svg_ui.test.tsx`
asserts the variable reaches the DOM at the zoomed value.

## And the header that labels those columns

A row wider than the panel is scrolled by `.svg-rows` (`overflow: auto`) — the
row was already wider than a laptop screen before the zoom existed. The column
header, however, sat in its own 30px grid row of `.svg-panel`, which is
`overflow: hidden`: at a zoomed width its right-hand labels were simply cut off
while the rows scrolled underneath them. The header now lives **inside** the
scroll area as a `position: sticky` first child, so it travels with the rows it
labels at every width, and the panel reserves one row less. Both the base
template and the `max-width: 1360px` override derive their column from the same
variable — the override carried the same fixed `200px`, and a narrow screen
would have kept the overlap.

## About the colour report

The previous round removed the only colour the app injected
(`PREVIEW_INK` moved to `#000000` in the shadow-root stylesheet, nothing written
into the document's own `style`), so a `currentColor` icon paints the UA default
black and explicit `fill`/`stroke` values survive byte-for-byte
(`docs/archive/2026-10-01-svg-preview-rendering/design.md`, D4 corrected).

What is left is a **legibility** problem, not a fidelity one, and the zoom is
what answers it: an icon authored on a 512-unit viewBox with unit strokes is
drawn at 84 px with sub-pixel strokes, which anti-alias into pale grey — *white
lines* in a small thumbnail and *black lines* in the file. Both thumbnails must
be inspectable at a usable size before anyone can judge the artwork's colours,
which is why the zoom fix and the colour report arrive together.

## Tests

* `tests/svg_ui.test.tsx` — at a zoomed thumb size, the AI thumbnail and the SVG
  frame report the same square size (width **and** height), so a future per-side
  cap fails the suite.
