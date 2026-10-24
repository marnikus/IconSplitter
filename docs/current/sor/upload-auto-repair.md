# Upload — automatic artboard and minor viewport repairs

Detail of [geometry](upload-geometry.md), [I-60](invariants/upload.md) and
[export](upload-export.md). [Owners](owners/upload.md), [tests](tests/upload.md).

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

## Real regression assets

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
