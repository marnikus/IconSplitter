# Upload size guide — S/L repeats of the finished icon (2026-10-20)

The user asked for a second artboard decoration beside the Shadow and the corner
badge: the finished icon repeated at two smaller sizes in a chosen artboard
corner, each with a small `S` / `L` label underneath, as a size-reference
graphic for stock previews (the supplied reference screenshot). The user
supplied the two label outlines (7×11 `L`, 8×12 `S`) as plain filled paths.

## Decisions

1. **One control set, checked-only** (same grammar as Shadow/badge): the global
   Export settings popup carries a `Checked icons (N)` toggle plus one **Size
   guide defaults** block; changing those defaults never opts an unchecked icon
   in. The per-icon popup has its own checkbox, override markers and reset.
   General bulk apply preserves the pins.
2. **Sizes in % of artboard width** — S and L each get their own percentage
   (`sizeGuideSmallPct` 6, `sizeGuideLargePct` 12); aspect comes from the icon's
   shipped bounds. **Strokes in % of artboard width** as the user asked, one
   per logo (`sizeGuideSmallStrokePct`, `sizeGuideLargeStrokePct`, 0–20 %,
   default 0). 0 means "keep the artwork's own widths": the uniform bake scales
   them with the geometry, so a repeat at 6 % carries 6 % of the icon's own
   weight. Any value above 0 writes that width verbatim in final px.
3. **Group layout:** S then L left-to-right, icon bottoms aligned, labels
   baseline-aligned under their icon (label height 28 % of that logo's width,
   clear gap 10 % of the widest logo). Gap between the logos defaults to 2 % of
   artboard width. Corner (default `bottom-left`) + inward X/Y distances
   (default 3 % each) anchor the whole group, exactly like the badge. A group
   that does not fit shrinks uniformly, re-measured up to three times because a
   fixed stroke width does not shrink with the geometry (insets never move); a
   100 % inset fails `no-fit` by name and leaves the tree untouched.
4. **Reuse, not re-placement:** the copies are clones of the finished icon
   alone — the artboard background rect and the generated shadow ellipse are
   excluded — baked by one uniform matrix into each target rect, then restyled
   to their own stroke width. The module can expand a copy that still strokes
   (`SizeGuideSource.expand`), but the pipeline hands it the icon after the
   global Expand strokes pass: with Expand on the repeats are the finished
   outline, add nothing to `strokesExpanded`, and a per-logo width has nothing
   left to restyle (the dialog says so).
5. **Self-contained paint:** each copy hoists its own `stroke`/`stroke-width`
   (the same `unifyStrokes` policy) onto its `<g>` and blocks the export
   root's hoisted paint, so a fill-only icon never gains a stroke from
   inheritance. Duplicate ids are renamed with their `url(#…)`/`href`
   references, so two copies of a gradient icon stay valid.
6. **Labels** are the supplied paths, scaled with the logo, filled black,
   stroke-free — supplied art, never runtime text.
7. **Off by default; byte-identical as-is.** Only an enabled guide enters the
   fingerprint (corner, both widths, both stroke widths, gap, both insets and
   both supplied template contents), so existing packages do not turn stale
   (`36232c04` stays the defaults fingerprint). EPS carries the paths;
   SVGO/clean keep the copies. The guide is staged after the stroke hoist and
   **before** the badge, so the badge stays the last element.
8. **UI selection contract:** `upload-set-sizeguide-{selected,corner,
   small-width,small-stroke,large-width,large-stroke,gap,offset-x,offset-y}` in
   the global popup, `upload-set-sizeguide` + `upload-set-marker-sizeguide*` in
   the icon popup; edge labels follow the corner ("Distance from right edge %",
   "Distance from bottom edge %"); "All default" also turns the guide off.

Acceptance: red→green geometry/settings/pipeline/UI tests, `tsc`, lint,
changed-quality gate, `verify:fast` and full `verify`, current docs updated.
