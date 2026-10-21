# Vector-only EPS gradients

Owner: the native EPS path in [upload-eps](upload-eps.md). Design/research:
`docs/archive/2026-10-21-vector-only-eps/research.md` and `implementation.md`.

## Native conversion

The built-in browser writer (`builtin-vector-3`) emits PostScript Level 3
`ShadingType 2` axial and `ShadingType 3` radial gradients, clipped to the original
vector path (`clip`/`eoclip`). No canvas, image encoder, PDF intermediary, external
application, local helper or production WASM dependency is used for EPS.

Supported: sRGB, `spreadMethod=pad`, local gradient references/inheritance,
multiple strictly increasing stops (end colors extend to 0/1), percentages,
`objectBoundingBox`/`userSpaceOnUse`, gradient transforms, and fill-rule. Geometry
bounds exclude the stroke for object-bounding-box coordinates. A gradient fill
and a separate solid stroke preserve the original path across fill/clip.

The supplied template shadow is supported as vector shading, including its
varying stop alpha, ellipse fill opacity, and affine transform. Badge and S/L
paths remain vectors and may accompany it. Supported shadows show no routine
EPS warning in the toolbar, rows or either settings scope. Actual EPS failures
retain their normal stage error and partial-package reporting.

Unsupported input fails explicitly, never rasterizes: repeat/reflect spreads,
linearRGB, external/missing/cyclic/ambiguous references, duplicate/decreasing
stops, singular/invalid transforms, zero-radius/degenerate gradients, nonzero
radial start radius, focal points on/outside the outer circle, gradient strokes,
filters, masks, external clips and group opacity. Existing source subset limits
(text, images, unhandled CSS) still apply. This is not universal SVG support.

## Transparent gradients

PostScript has no general alpha compositing. The writer evaluates
`color(t) * alpha(t) + backdrop * (1-alpha(t))` before constructing its opaque
vector color functions. Simply mixing the original stops first is not correct
when both color and alpha vary. Adaptive piecewise-linear vector functions bound
the per-channel interpolation error to 1/8192, plus numeric serialization error
(9 decimal places). They are color functions, not raster samples or images.

A conservative paint-order analysis must establish a uniform backdrop. An
opaque axis-aligned solid rectangle (including its optimized four-edge path)
can establish one. Previous overlapping nonuniform marks block flattening;
subsequent foreground paint is unaffected. With no prior mark in the region,
the explicit export flatten color is used (white for transparent settings).
The opaque shading itself paints that backdrop contribution inside its vector
clip, so the result does not rely on the receiving page color there.

The writer does not pretend arbitrary overlap/soft-mask/filter compositing is
supported. Unproven alpha overlap is an honest failed EPS stage; SVG/JPEG may
still commit as a partial package. No EPS bitmap fallback is available.

## Verification and delivery

Every converter's final EPS must pass DSC checks AND the closed executable
vector grammar (`verifyEpsDocument`). The native stack checker now understands
vector clipping and a restricted shading-dictionary grammar: DeviceRGB,
validated Type 2/3 shadings, numeric Type 2/3 color functions, strict array sizes,
coordinates and function domains. Procedures, pixel streams, images/image masks,
bitmap-font definitions, unknown operators, opaque data blocks and bitmap
previews are refused. An unrecognized external converter program is **not
certified** just because it has an EPS header. This can reject real Inkscape
prologs; choosing Inkscape never bypasses the no-raster policy.

Metadata is permitted only when its entire executable envelope matches the
app's canonical XMP emitter byte-for-byte. Marker comments cannot hide injected
code. Raster-related words in valid metadata are harmless text.

The gate runs after XMP insertion, at artifact validation, on temporary write
readback and final saved bytes. Final bytes must also equal the intended bytes.
Cached EPS eligibility is rechecked even when settings fingerprints match;
Download all refuses invalid EPS before copying and compares the destination's
readback byte-for-byte. A bad EPS is never reported/copied as successful; old
failed-stage EPS is detached from the current package record.

## Owners and tests

- `src/lib/upload/epspaint.ts`: solid/reference paints and inheritance.
- `src/lib/upload/epsgradient.ts`, `epsgradientcoords.ts`: references, stops,
  coordinates and units; `epstransform.ts`: strict EPS transforms.
- `src/lib/upload/epsgradientfunction.ts`, `epsgradientfill.ts`: color-function
  error bound and clipped vector shading; `epsscene.ts`: backdrop analysis.
- `src/lib/upload/epspsdata.ts`, `epsshading.ts`, `epscheck.ts`: restricted data,
  shading schema and executable-program audit.
- `tests/upload_epsgradient.test.ts`, `upload_epsvectorcheck.test.ts`: native
  shading, real template, nonlinear alpha error bound and raster-negative cases.
- `tests/upload_runexport.test.ts`: actual package export/readback, metadata,
  raster-injected cached/downloaded EPS and post-tmp saved-file corruption.

The two requested SVG files at `tests/assets/svg to EPS` were absent at
implementation time. Their input-specific export verification is not claimed.
