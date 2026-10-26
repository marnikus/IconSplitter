# Upload — automatic stroke, artboard and viewport repairs

Detail of [geometry](upload-geometry.md), [I-60](invariants/upload.md) and
[export](upload-export.md). [Owners](owners/upload.md), [tests](tests/upload.md).

## Non-uniform stroke transforms

Valid SVG can scale a stroke differently along each axis. The supplied snowflake
uses `translate(64 64) scale(1.7320508075688772 1)` for its central hexagon. A
single baked stroke width cannot represent that original pen, so this previously
failed with `a stroked <path> under a non-uniform transform`.

`bakeGeometry` now detects the accumulated artboard × source matrix (nested
transforms, reflections and skew included). With **source width (0)**, only the
affected shapes are cloned with their inherited fill/stroke/dash/colour context.
The existing stroke-outline model expands the pen in **local coordinates**, then
the normal bake transforms both fill and stroke outline. Unaffected strokes stay
editable. Shape opacity is applied once around the fill/stroke composite; stroke
opacity remains independent of fill opacity. Chosen colour/endpoints apply before
outlining. The result is vector geometry, not an averaged width or raster image.

With an **explicit final width**, the transformed centreline receives that width
verbatim in final pixels after baking, just like every other stroked shape.
A non-scaling stroke already has a final-pixel pen and keeps its width and dash
lengths without outlining. Changing settings always rebuilds from the original
source, so a previous outline never prevents a later width change.

All replacement copies are planned before mutation. Unsupported outline paints
(`url(#…)` unless replaced by a chosen solid colour), invalid dash patterns, and
non-uniform dashed strokes combined with an explicit final-width override remain
named failures rather than guessed spacing. Existing coordinate-definition
refusals (clips/masks/filters/patterns/user-space gradients) stay intact.
Preview, placement probes and SVG/JPEG/EPS share the repair automatically, with
no extra control, dialog or provider call. The source SVG is never rewritten;
fully default/as-is SVGs remain byte identical. Automatic outlines are included
in `PreparedSvg.strokesExpanded`, and their recolouring in `strokesRecolored`.

Owners: `lib/upload/strokerepair.ts`, `bake.ts`, `geom/stroke.ts`, `place.ts`;
shared presentation lookup: `geom/stroke.ts` (also used by `expand.ts`);
source/setting entry point: `prepare.ts`. Tests: `upload_stroke_repair.test.ts`
(analytic bounds, inheritance/compositing, local-space dashes, combined CTMs,
non-scaling pens, atomic refusal, real-file preparation, containment, SVGO/clean
and vector EPS), `upload_bake.test.ts`, `upload_prepare.test.ts`,
`upload_live_preview.test.tsx` (actual row, no unavailable note),
`upload_runexport.test.ts` (SVG/JPEG/EPS package commits, actual raster input,
unchanged approved source). Plan/evidence:
[2026-10-26 repair](../../archive/2026-10-26-anisotropic-stroke-repair/README.md).

## Wide-stroke pinned fitting

A verbatim stroke can change which part of an icon sets its painted extrema as
scale changes. The affine edge estimate may not settle in its normal four passes,
even when a valid pinned fit exists. After that fast path fails, the exporter
uses a bounded search over uniformly scaled, actually baked/restyled/expanded
candidates. It retains the pinned artboard and configured stroke/padding, then
centres on the same 0.001px coordinate grid as the baked geometry, then
re-measures the final candidate. An off-grid translation can re-round tiny
segments and radically change their wide-stroke extrema; snapping the translation
(not the stroke or artboard) avoids that false final-containment failure. The
maximum centring adjustment is 0.0005px per axis. A small 0.008px size guard absorbs
3-decimal coordinate rounding; final bounds must meet the existing 0.002px
containment tolerance. Up to 32 search probes and one final probe follow the four
fast passes (37 total); `tools.artboard.passes` reports that work honestly.

No artwork stretching, stroke reduction, arbitrary artboard enlargement, raster
fallback or unchecked success. Impossible stroke/board combinations still fail.
The recovery applies to pinned dimensions; existing content/MP fit rules remain.
The source-frame shadow path keeps its phantom source frame in every probe.

## Minor source-frame stroke overflow

A source whose ray ends exactly at its viewBox boundary can paint half a round
cap outside it. Enabling a shadow used to refuse even this small accidental
viewport defect. The exporter now compares visible geometry without stroke reach
against painted bounds. If all visible geometry lies inside the declared frame
and paint overshoot is at most 2% of its smaller dimension, the in-memory source
frame is extended only to contain that paint. Shadow placement then proceeds
normally. Transforms, hidden shapes and non-origin frames use the shared geometry
traversal. The source SVG file is never rewritten.

This is not permission to expose truly clipped geometry: out-of-frame shapes,
large stroke overflow, explicit unsupported clips/masks and other unsupported
content retain their existing failures. Fully default/as-is exports remain byte
identical. Corrections occur automatically in the shared preparation used by
preview and SVG/JPEG/EPS export, with no repair dialog or provider request.

## Planned tight viewport-bounds fix — not implemented

Both supplied waving flags are now available from fixture commit `8324120` and
reproduce the shadow warning. Negative Bézier control Y values (−18/−15) inflate
the conservative bounds, although measured represented paint starts at positive
Y **7.560711/8.191972**, inside the 224/240 source frames. This is a bounds false
positive, not demonstrated actual clipping. [Per-file evidence and ordered fix
plan](../../archive/2026-10-26-shadow-viewport-repair-plan/README.md) specifies tight
curve/paint classification, shared guard semantics and full export regression
steps. No path rewrite, viewBox enlargement or clipping engine is needed for
these examples. Genuine clipping refusals and 2% minor-stroke policy stay intact.

Research only: no fix is implemented or successful repaired export claimed.
Original fixture bytes remain unchanged; real preview/export acceptance must
follow before declaring the planned automatic correction complete.

## Real regression assets

The supplied snowflake (`icon-snowflake_AI_9_03.svg`) is retained unchanged in
that same directory and exercises the non-uniform-stroke repair above.

Both supplied bulb files in `tests/assets/bug with SVG export expl temp/` are
retained unchanged (`icon-lightbulb-idea_AI_5_02.svg`, `_5_03.svg`). Tests cover
shadow/source-frame and expanded variants, 512px and MP targets, the reproduced
64px/50px-stroke fit failure, a broader stroke/target matrix, deterministic
source-preserving preparation, final containment and genuine vector EPS output.

`upload_centred_fit.test.ts` pins the supplied leaf's exact final-containment
failure at stroke 50px, padding 8%, artboard 64×64. It also covers both bulbs,
nearby widths/padding, rectangular targets, expanded/unexpanded vector EPS,
shadows, final padding/centre precision, unchanged sources, deterministic output
through optimization/cleaning and refusal of impossible dimensions. EPS uses
representable geometry (40px for the gear/circle, exact 50px for the failing leaf);
zero-radius circles remain outside the existing EPS subset.
