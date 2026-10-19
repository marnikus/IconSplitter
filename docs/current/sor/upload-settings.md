# Upload settings, artboard and geometry

The settings and output geometry for [SVG to upload](upload.md); see [I-60 and I-62](invariants/upload.md).

## Current settings and output geometry

* Settings: global defaults (padding %, background — `transparent` (the
  default) or one hex, stroke width in px — the file's own units, written as
  typed (2026-10-08; a stored `strokePt` from before reads as the same number
  under `strokePx`), stroke
  colour — one hex, `#000000` by default (2026-10-08), or the artwork's own,
  JPEG target MP, JPEG quality, SVGO
  optimize on, optional EPS, artboard) plus per-icon overrides; the effective
  settings are defaults under,
  overrides on top, and the settings dialog marks every field inherited or
  overridden. "Apply settings to selected" pins the current defaults onto the
  selection as ONE undoable `uploadSettings` history entry; per-icon set/reset
  pushes one entry each; global-defaults edits are persisted but NOT undoable
  (the same class as presets). The checkbox selection is session-persisted but
  not on the undo timeline.
* **Scale to N MP** (2026-10-09, I-62, design
  `docs/archive/2026-10-09-eps-executable-artboard-megapixels/design.md` D5):
  two more settings fields, `scaleToMegapixels` (default off) and
  `artboardMegapixels` (default 5, clamped 1–64 like the JPEG; junk → 5). On,
  and only in `content` mode, the artboard is the content fit (icon + padding)
  scaled uniformly so `artW × artH = N × 10⁶` (`fitArtboard` with a
  `{ megapixels }` target; `artboardTarget` makes a pinned size win) — the
  padding keeps its meaning (how small the icon sits in the artboard), strokes
  keep their verbatim px (the placement loop re-measures, so the area lands
  within the file's precision; exact in one pass when the artwork is all
  fills), and the JPEG is untouched (it still renders at `jpegMegapixels` in
  the artboard's ratio — the MP target is about the vector's artboard, which
  is what a stock measures). The fingerprint appends `["mp", N]` ONLY while the
  box is on, so the defaults' fingerprint (`36232c04`) and every existing
  package stay as they are; the number is dormant while the box is off (it
  does not move the fingerprint, but `settingsEqual` sees it). The record's
  `tools.artboard.scaledTo` is N while it applies and null otherwise (a pinned
  artboard with the box on records null — the px decided); the row's settings
  line appends `· artboard N MP` under the same rule. UI: the row under the
  artboard select in `src/upload/UploadArtboardSettings.tsx` — the checkbox
  `upload-set-mp-scale`, the number `upload-set-mp-target` (disabled while the
  box is off) and the note `upload-set-mp-scale-note` (`the artboard (icon +
  padding) is scaled to N MP · strokes keep their px`; with a pinned artboard
  the checkbox is disabled and the note reads `the pinned size decides the
  megapixels`). "N fields overridden" after a bulk apply is 14.
* The artboard (2026-10-08) is one more settings field, with three modes:
  `content` (the artboard hugs the artwork, as before), a square px preset
  (256/512/1024/2048/4096 — "512×512 and other popular") or an exact CUSTOM
  W×H, which is what lets the user set the output aspect ratio. Read back
  through `clampArtboard`: 16–8192 px per edge, a 64 MP total area ceiling that
  shrinks BOTH edges together so the ratio survives, and a preset that snaps to
  the nearest offered size; a corrupt value becomes `content`. Only a
  non-`content` artboard is written into the stored overrides.
* The JPEG resolution is NEVER blocked by the artboard (2026-10-08, the user's
  correction: "a small artboard must not cap the resolution"). `jpegMatchArtboard`
  (default true) says whether the JPEG follows a PINNED artboard's exact px;
  unticking it — which typing a megapixel value does in the same gesture —
  renders `jpegMegapixels` instead while keeping the artboard's aspect ratio, so
  a 512×512 artboard can still ship an 8000×8000 JPEG. With a `content`
  artboard the question does not exist (the artboard follows the MP), so the
  checkbox is not shown. Both the flag and the megapixels are ordinary settings
  (defaults + per-icon overrides), the flag is in the fingerprint because it
  changes the output, and the ONE canonical `SETTINGS_FIELDS` list (which
  `overridesEqual` in the undo path derives from) names every overrideable
  field, so a change confined to the artboard or the flag can never be
  swallowed as "nothing changed".
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
  plus the padding and nothing visible lies outside it (the field report: a
  1 px source stroke widened to 8 px lay 3.5 px outside the old viewBox on
  every edge). A pinned artboard with verbatim strokes is not linear in its
  scale, so the fit is corrected from the measurements (each edge is
  `k · geometry + a constant stroke reach`; two samples pin both) and
  re-measured — at most 4 passes, settled when every edge is within the file's
  own precision (0.002 px); the count is recorded (`tools.artboard.passes`;
  1 when the first fit was exact — fills only, or width 0) and a candidate
  that never settles is an honest `no-fit` failure, never a guess. The
  artwork is fitted proportionally into the padded artboard: in `content`
  mode the padding is a uniform % of the artwork's largest side, and on a
  PINNED artboard it is a % of the TARGET's largest side while the artwork is
  scaled by one uniform factor and centred (letterboxed — never stretched,
  never cropped), the pinned px are exact (`viewBox="0 0 W H"`). **Every transform is baked into the
  geometry** (2026-10-08, `lib/upload/bake`): the artwork's own `transform`s
  and the artboard's translate+scale become the shapes' coordinates (3
  decimals, in artboard px), so the shipped file carries NO `transform` and no
  wrapper group — a rect/ellipse/line/polyline/polygon keeps its element under
  an axis-aligned matrix, a circle under a uniform one, anything rotated or
  skewed (a rounded rect included, 2026-10-08) becomes a `<path>` from the one
  outline model (`geom/outline.ts` + `geom/ops.ts` + `geom/shapes.ts`, shared
  with the EPS writer). The stroke width is written AFTER that bake,
  **verbatim: the number in the setting is the number in the file**
  (`strokePx: 2` → `stroke-width="2"` on every visible stroke, whatever the
  artwork's transform or the artboard's scale — the reviewer's
  `2.6224000000000003` was a width finalised in local units that SVGO
  re-multiplied when it baked the transforms; with nothing left to bake the
  optimizer cannot touch a width, and the export test pins the SHIPPED text).
  A stroke width of 0 keeps the artwork's own strokes: each width follows its
  geometry (× the baked scale, ≤ 3 decimals; a `non-scaling-stroke` keeps its
  number and loses the attribute), dash arrays/offsets scale the same way, and
  containers lose their `stroke-width` because every shape now carries its
  own. What a bake would distort is refused by name before the tree is touched
  (`unsupported: a stroked <path> under a non-uniform transform`, `a
  userSpaceOnUse <linearGradient>`, `a <clipPath>` / `<mask>` / `<filter>` /
  `<pattern>`) — a deliberate narrowing recorded in the 2026-10-08
  stroke-width design (the `a rounded <rect> under a rotation or skew` refusal
  of that design was retired the same day: the outline model now draws rounded
  corners, so the rect bakes to a `<path>`); a stroke COLOUR
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
