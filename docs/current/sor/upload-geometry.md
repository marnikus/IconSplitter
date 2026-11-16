# Upload geometry — bounds, bake and placement

[Settings](upload-settings.md); [I-60…I-62](invariants/upload.md).

* Geometry: the visible bounds include strokes (width/caps/joins), transforms
  and non-scaling-stroke; a shape whose fill is `none` and that does not
  stroke paints nothing and has no visible bounds (2026-10-09 — an icon set's
  invisible frame, the artboard rect); unsupported elements (text, image, use,
  foreignObject, risky `<style>`) are named, never guessed. **The artboard is
  the artwork as it SHIPS** (I-60, 2026-10-09, `lib/upload/place.ts`): the
  placement works on a CLONE of the cleaned source — bake(translate·scale) →
  the configured stroke (verbatim px, `lib/upload/restyle.ts`) → expansion when
  on — and MEASURES that candidate (`shippedBounds`: every stroke expanded into
  its real outline on a probe copy, so joins and caps are exact; the analytic
  hull only when the expander refuses), so the viewBox is the FINAL bounds
  plus the padding, including widened stroke reach. A pinned artboard with verbatim strokes is not linear in its
  scale, so the fit is corrected from the measurements (each edge is
  `k · geometry + a constant stroke reach`; two samples pin both) and
  re-measured in a four-pass fast path (0.002 px tolerance). If limiting
  edges switch under wide strokes, a bounded measured pinned-artboard search
  verifies a safe final fit; actual passes remain recorded. See
  [automatic repairs](upload-auto-repair.md) for the fallback and minor
  source-frame stroke overflow repair. Unrepresentable fits still fail honestly. The
  artwork is fitted proportionally into the padded artboard: in `content`
  mode each [side's padding](upload-padding.md) is a % of the artwork's largest side; on a
  PINNED artboard it is a % of the TARGET's largest side while the artwork is
  scaled by one uniform factor and centred within the inset rectangle (letterboxed — never stretched,
  never cropped), the pinned px are exact (`viewBox="0 0 W H"`). **Every transform is baked into the
  geometry** (2026-10-08, `lib/upload/bake`): the artwork's own `transform`s
  and the artboard's translate+scale become the shapes' coordinates (3
  decimals, in artboard px), so the shipped file carries NO `transform` and no
  placement wrapper (repair groups retain compositing) — a
  rect/ellipse/line/polyline/polygon keeps its element under
  an axis-aligned matrix, a circle under a uniform one, anything rotated or
  skewed (a rounded rect included, 2026-10-08) becomes a `<path>` from the one
  outline model (`geom/outline.ts` + `geom/ops.ts` + `geom/shapes.ts`, shared
  with the EPS writer). The stroke width is written AFTER that bake,
  **verbatim: the number in the setting is the number in the file**
  (`strokePx: 2` → `stroke-width="2"` on every visible stroke, whatever the
  artwork's transform or artboard scale). No transform can re-scale that width.
  A stroke width of 0 keeps the artwork's own strokes: each width follows its
  geometry (× the baked scale, ≤ 3 decimals; a `non-scaling-stroke` keeps its
  number and loses the attribute), dash arrays/offsets scale the same way, and
  containers lose their `stroke-width` because every shape now carries its
  own. **Non-uniform strokes are repaired automatically** (`strokerepair.ts`):
  source width (0) expands the local pen before affine baking; a configured width
  is written in final px after baking the centreline. Chosen colour/caps apply
  before outlining. [Policy, opacity/dash preservation and safe refusals](upload-auto-repair.md#non-uniform-stroke-transforms).
  User-space gradients, clips/masks/filters/patterns and unrepresentable repair
  paints/dashes remain named, atomic refusals; no raster fallback. A stroke COLOUR
  other than "artwork" is written onto every element that strokes visibly
  (fills, `stroke="none"` and gradient/pattern strokes are never touched, and
  a `currentColor` stroke becomes the chosen hex). **Each stroke property is
  then defined ONCE** (`lib/upload/strokeglobal.ts`, 2026-10-08 — the stock
  reviewer's `<svg stroke="#111"><g stroke="#000" stroke-width=".8">` with a
  width on every path): when every visibly stroked shape agrees on `stroke`
  (or `stroke-width`) the root carries it and no other element or inline
  style does — the group's `.8`, the per-path widths, the source root's own
  colour all go — and a shape that does not stroke (the background rect, a
  filled shape) says `stroke="none"` so the root's paint cannot reach it;
  when the shapes disagree (`artwork` colour over a mixed source, width 0
  over mixed widths) each stroked shape states its own and no container or
  root states any; when nothing strokes, nothing is written. With the
  defaults a line icon therefore ships `<svg stroke="#000" stroke-width="2">`
  and no other definition of either (the export test pins the SHIPPED text
  through SVGO; `PreparedSvg.globalStroke` records what the root defines).
  The root carries NO
  `width`/`height` — the `viewBox` is the size (every consumer that needs px
  — the rasterizer, the EPS — derives them; the browser rasterizer pins the
  render size on an in-memory copy only). **The artboard rect is always the
  first child** (I-60, 2026-10-09 — the user's definition: the full artwork is
  the icon plus the artboard): `fill="<hex>"` for a colour background,
  `fill="none"` for `transparent` (the default) — invisible, but an object, so
  "select all" in an editor is the artboard; it survives SVGO (as a
  `<path fill="none">`) and the clean-code report, has no visible bounds, and
  emits nothing in the EPS (whose `%%BoundingBox` is the artboard anyway); the
  JPEG, which cannot be transparent, flattens onto the colour or onto white. The JPEG
  rasterizes the VECTORS directly — at the artboard's px while
  `jpegMatchArtboard` is on, otherwise at the integer MP target in the
  artboard's ratio (15.1 MP on a square artboard → 3886×3886; 4 MP on 512×256 →
  2828×1414) — verified by decoding the SOF back. All of it happens on an export
  COPY — the approved source is never written.
* **Template shadow** (2026-10-20): optional vector radial-gradient ellipse
  copied from `src/svg/templates/shadow.svg`, never a raster, SVG filter or
  preview-only effect. Each placement candidate first bakes/restyles/expands
  the icon and measures its final painted bounds; shadow width is a percent of
  that width, the empty gap below is a percent of its height, centred on its X
  midpoint. Its gradient is normalized from the template's user-space unit
  circle to an equivalent ellipse-relative `objectBoundingBox` paint, so the
  bake/probe still measures exact stroke outlines; a collision-free gradient ID
  is referenced by the shadow, whose `stroke="none"` prevents an inherited
  border. The fit includes the union of icon and ellipse; with default/null
  padding the original source viewBox is a phantom layout frame, retained
  when the shadow fits and extended when it overflows. Source/content, pinned
  and MP artboards contain the whole composite without cropping; the artboard
  background remains first, the shadow is drawn before the icon. A source with
  width/height but no viewBox retains that frame before dimension cleanup. Transparent paint, `display="none"` subtrees and
  `visibility="hidden"` elements do not inflate the icon bounds or position
  the shadow; a child can override inherited visibility but not display. If
  paint outside the source viewport would be revealed, Shadow
  refuses it; only bounded minor stroke/cap overflow with in-frame geometry
  is repaired automatically; ambiguous hull overflow uses
  [tight paint bounds](upload-auto-repair.md#tight-source-viewport-classification);
  analytic stroke reach also ignores a zero-opacity stroke. Expanded stroke
  outlines retain their source display/visibility and explicitly use the
  effective stroke opacity for their fill, even under inherited zero fill
  opacity. Shadow-off as-is bytes are unchanged.
* **Corner badge:** the [artboard-relative vector](upload-badge.md) is appended
  after the icon/Shadow fit, so it never changes icon geometry or artboard size.
  Exact edge percentages and a uniform aspect-preserving scale keep its paint
  inside the final emitted viewBox, or preparation fails by name. With Expand
  strokes on, its six outlined handles become fills before append.
* **Size guide:** the [S/L repeats](upload-sizeguide.md) are clones of the
  finished icon alone (no artboard rect, no Shadow ellipse), each baked by one
  uniform matrix into artboard px and restyled to its own stroke width. They are
  appended after the stroke hoist and before the badge, never change the icon
  fit or artboard size, and shrink uniformly or fail as `no-fit` when the
  requested percentages cannot fit the chosen insets.

* Offset search: equivalent bounded checks, unchanged tolerance; [proof](../../archive/2026-10-25-harness-40/results.md).
