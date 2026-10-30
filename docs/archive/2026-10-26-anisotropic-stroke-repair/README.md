# Automatic repair of transformed SVG strokes

## Diagnosis and plan (before implementation)

The supplied `tests/assets/bug with SVG export expl temp/icon-snowflake_AI_9_03.svg`
arrived in upstream commit c30ec49. Its central hexagon inherits stroke width 1
under `translate(64 64) scale(1.7320508075688772 1)`. This is valid SVG, not
corruption: baking its centreline plus a scalar stroke width cannot preserve its
anisotropic painted stroke. `bake.ts` currently refuses it, so preview and export
both fail whenever settings require preparation instead of byte-identical as-is.

1. Add failing real-file preview/preparation and vector-export regressions, plus
   analytic geometry, inheritance, skew/reflection, opacity, dash and atomic
   refusal cases. Retain clip/mask/filter and unsafe-paint failures.
2. At bake preflight, detect non-uniform accumulated transforms on strokes.
   Keeping source width: clone affected shapes with their effective paint and
   dash/cap/join context; expand in LOCAL coordinates with the existing outline
   model, then bake the filled outlines. Preserve the original fill, transforms,
   compositing order/element opacity and stroke opacity. Never average axis widths.
   Apply explicitly selected colour/endpoints before outlining.
3. If a final stroke width is explicitly configured, bake the centreline and let
   the existing post-bake restyle write that number verbatim in final pixels.
   Non-scaling strokes already have a scalar final width and need no outlining.
   Fail closed on unsupported gradient strokes/invalid dashes for outlining;
   explicitly restyled non-uniform dashed strokes require a separate dash-space
   model and remain named refusals rather than silently stretching dash spacing.
4. Build all repair replacements before touching the input DOM. Retain original
   SVG bytes and the as-is shortcut. Share the repair through `bakeGeometry`, so
   preview, placement probes, SVG/JPEG/EPS all use the same vector artwork.
   Local expansion keeps each shape's transform on its replacement group, so
   both fill and stroke are transformed together. Existing measurement probes
   already bake before expanding; they now obtain exact repaired bounds instead
   of falling back to conservative analytic bounds on this refusal.
5. Run focused regressions, types/lint/changed quality, fast/full verification;
   update current geometry/repair owners and selectors; append the measured
   ledger entry, commit with attribution and push the fixed session branch.

Shared presentation lookup is owned by `geom/stroke.ts` and reused by both the
existing DOM stroke expander and automatic repair, rather than duplicating their
inline-style/attribute inheritance walks. The already-green expansion and repair
tests form the equivalence gate for this small extraction.

## Acceptance

The supplied snowflake prepares without the old non-uniform-transform error,
retains all eight source shapes, honours chosen final stroke width/paint/caps,
fits its artboard and produces vector-only SVG/EPS. At source width its central
stroke retains the anisotropic outline. The supplied file is never rewritten.
No raster fallback, validation bypass, tolerance loosening or new dependency.

## Verification

- TDD witnessed all 13 initial repair regressions fail, including the exact
  snowflake refusal at both source width and configured width. The original
  refusal assertions were replaced by stronger automatic-repair/containment
  assertions; coordinate-definition safety assertions remain.
- Final focused equivalence/acceptance run: **168 tests / 7 files PASS**
  (`upload_stroke_repair`, `upload_bake`, `upload_prepare`, `upload_expand`,
  `upload_live_preview`, `upload_runexport`, `docs_navigation`).
- Standalone TypeScript, uncached lint (0 errors / 20 existing warnings), changed
  quality at base c30ec49 and whitespace checks pass. No dependency changes.
- Full verification before the final presentation-lookup extraction passed
  **2,982 tests / 283 files**, plus **30 native tests / 5 files**. The first
  earlier full attempt missed the unchanged native image-detection 200ms budget
  at **203.878ms**; the next complete run passed. Neither image algorithms nor
  tests/budgets/harness settings were edited. Both runs' coverage suites passed.
- Final post-extraction delivery: `npm run verify:fast -- --base c30ec49`
  and `npm run verify -- --base c30ec49`: **ALL LANES PASSED**. Each ran
  **2,982 tests / 283 files**; full additionally passed **30 native tests / 5
  files** (4.1s). Coverage suite times: 97.0s fast / 98.8s full; builds 7.7s /
  8.1s. Final lib statement/branch/function/line coverage:
  **95.43 / 89.99 / 98.23 / 98.31%**. New `strokerepair.ts`: **100% on all four
  metrics**. Types/lint/changed quality passed in both delivery gates.
  All current-doc budgets/routes and whitespace checks pass. Logs stay outside
  Git at `/home/user/svg-repair/verify-{fast,full}-delivery.log`.


### Independent browser paint comparison (supplementary)

[`pixels.json`](pixels.json) records Chromium 153.0.8010.0 at 1024×1024. Load the
real source and the real `prepareExportSvg` module in the Vite browser page. Use
`DEFAULT_UPLOAD_SETTINGS` + `AS_IS_SETTINGS` with `strokeColor: "#000000"` to
force preparation while retaining original source frame/width/caps and identical
black paint. Rasterize original and repaired SVG with `withIntrinsicSize` to two
transparent canvases through the same browser image renderer. Compare alpha:
`sum(abs(originalAlpha-repairedAlpha)) / sum(originalAlpha)` over all pixels.
This is a visual probe, not a test gate or proof of byte-identical rendering;
3-decimal coordinate/outline rounding and edge antialiasing can differ.

- Supplied snowflake: **147 differing pixels / 1,048,576**; normalized absolute
  alpha error **0.06548%**. Exactly one anisotropic stroke was outlined.
- Translucent fill + dashed affine stroke fixture: **830 differing pixels**;
  normalized absolute alpha error **0.16879%**. This independently exercises
  the repaired shape's single opacity composite and inherited channel opacities.
  Fixture: viewBox `0 0 128 128`; group `translate(20 25) scale(3 2)`, stroke
  black/2px/opacity .4/dasharray `2 2`, fill black/opacity .3; one path
  `M0 0H22V22Z`, opacity .5, round linecaps.

The browser toolchain lives outside the repository, uses only the local app and
adds no project dependency or generated binary. Source regression files remain
unchanged. Package tests inject only the browser JPEG transport with a valid
minimal JPEG encoder; all preparation/optimization/EPS/validation/filesystem
algorithms run for real. They prove the rasterizer receives the identical
prepared artwork plus intrinsic raster-size attributes, not a provider image.
