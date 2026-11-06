# Vector-only SVG → EPS: research and proposed design

Date: 2026-10-21. Status: **research only; not implemented or approved for release**.

## 1. Non-negotiable requirement

The exported EPS artwork must contain **zero raster elements**. This includes
shadows, gradients, masks, patterns, embedded images, rasterized fallback regions,
whole-page images, bitmap fonts, and embedded bitmap previews. An EPS extension,
a successful converter exit code, or a correct-looking preview is not sufficient.

A detected raster payload or raster drawing operation fails both the EPS export
and its verification test. Unverifiable output also fails closed. No automatic
fallback to Inkscape, a PDF intermediary, a bitmap, or a remote conversion service.
All production processing remains inside the browser, offline, without a separate
user-installed application or helper process.

This document proposes the implementation and tests. It does not change the
current converter, install application dependencies, or claim to have fixed export.

## 2. Recommendation

**Extend the existing browser-native EPS writer to emit PostScript LanguageLevel 3
vector shadings directly. Do not replace it with the evaluated SVG → PDF → EPS
pipeline.**

- Linear gradients: axial shading, `/ShadingType 2`.
- Radial gradients: radial shading, `/ShadingType 3`.
- Apply the SVG geometry as a vector clipping path and preserve the gradient's
  coordinate system with the appropriate transform.
- Represent gradient color functions as PostScript functions, not pixel samples.
- For supported transparent shadows, flatten the alpha mathematically into
  **opaque vector colors** against a proven backdrop. Do not flatten by rendering
  the SVG to a canvas or bitmap.
- Refuse any source feature or overlap whose visual result cannot yet be
  reproduced as vectors. Do not silently drop it or substitute a solid fill.

A native PostScript shading is a resolution-independent gradient object, not an
embedded raster. It need not consist of hundreds of ordinary filled paths. If a
particular receiving application cannot edit native shading, an optional future
path/mesh approximation would need explicit accuracy and size limits. That is a
separate compatibility decision, not permission to use pixels.

Among the libraries examined, I did **not** find a demonstrated drop-in,
browser-only SVG → EPS package that preserves the app's transparent gradient
shadow, has no raster fallback, and meets the existing self-contained build
constraints. This is a conclusion about the evaluated candidates, not a claim
that no other implementation can exist.

## 3. What the repository currently does

Inspected owners:

- `src/lib/upload/eps.ts`: recognizes solid paints; rejects `url(#gradient)`;
  skips definitions; has no gradient emitter. Its current opacity handling mixes
  solids with a supplied background, which is not a general overlap compositor.
- `src/lib/upload/epsdoc.ts`: EPS envelope and structural verification.
- `src/lib/upload/epscheck.ts`: checks the built-in writer's small operand-stack
  subset. It does not understand dictionaries, functions, clipping or `shfill`.
- `src/lib/upload/epsconv/builtin.ts`: invokes the writer and subset verifier.
- `src/lib/upload/epsconv/inkscape.ts`: delegates to a separately installed local
  application; checking that a response starts with `%!PS-Adobe` does not establish
  that it is vector-only.
- `src/svg/templates/shadow.svg`: a transformed radial gradient with grayscale
  stops at 0, 0.649038 and 1, stop opacities 1, 0.25 and 0, plus ellipse
  `fill-opacity="0.2"`. This is **not just an opaque gradient**.
- `docs/current/sor/upload-eps.md`: current behavior still documents the gradient
  limitation and partial EPS result. It remains the current contract until an
  implementation passes the new gates.

The source of the current refusal is real, not merely a warning string. Removing
that warning without extending the writer and validation would not solve it.

## 4. Framework/library comparison

Versions below were inspected on the research date. Registry package metadata,
published source archives and linked upstream source were examined; this is not
an exhaustive ecosystem survey.

| Candidate | Installation/runtime | Gradient assessment | Decision |
|---|---|---|---|
| Extend the current TypeScript EPS writer | Already inside the browser; no external program or new production package required | Can emit Level 3 axial/radial vector shadings directly; alpha conversion and verification must be implemented deliberately | **Recommended architecture**, subject to actual fixture tests |
| `svg-to-eps@1.0.0` | npm package | Published `src/epsConverter.ts` returns the literal `Generated EPS content`; no EPS generator or gradient implementation. Its `eps` dependency is an unrelated web framework | Reject: placeholder, not a usable converter |
| `svg2pdf.js@2.8.1` + jsPDF | Browser JS, PDF output, not EPS | Has shading support, but the inspected published `Gradient.apply` collapses nontrivial stop opacity into one average graphics-state opacity. That is not faithful varying alpha for this shadow. An EPS conversion step is still needed | Reject as a drop-in solution to this requirement |
| `svg-to-pdfkit@0.1.8` + `pdfkit@0.17.2` + `@jspawn/ghostscript-wasm@0.0.2` | npm libraries; Ghostscript inside WASM, no OS application installation | The isolated transparent-shadow probe produced a full-artboard inline image. Even the opaque probe contained a raster fallback region in this tested configuration | **Reject the tested workflow**; successful conversion is not vector-only success |
| `@okathira/ghostpdl-wasm@1.1.0`, `ghostscript-wasm-esm@1.0.1` | Alternative packaged Ghostscript WASM builds | Embedding a newer interpreter does not remove PostScript's lack of alpha. Device availability, security, bundle integration and vector-only behavior need independent testing | Possible independent **test interpreter**, not an approved SVG → EPS solution; not executed in this study |
| CairoSVG + Cairo | Python library plus native Cairo dependencies; exports EPS | Cairo's PS implementation supports gradient shadings, but transparent operations over existing marks can cause fallback images. Also not a drop-in browser library for this app | Not suitable as the proposed production workflow |
| SVG-to-PNG/render-first converters, including resvg used as a raster renderer | JS/WASM/native variants | A PNG/canvas render is already pixel artwork; wrapping it in EPS is forbidden | Reject categorically for artwork generation |
| Inkscape/local bridge | Separate installed application and helper | Does not satisfy the no-separate-program requirement; vector-only output cannot be assumed for all transparency/effects | Not the solution requested here |

Licensing matters if WASM is adopted: the examined Ghostscript packages declare
AGPL-3.0 or AGPL-3.0-or-later. Before redistributing one, review the exact source,
version, security fixes and license obligations. Do not add a large interpreter
to the shipped app merely to solve an EPS syntax task. The existing app builds
into one self-contained HTML file; WASM loading and offline packaging would also
need a separate design and measurement.

## 5. Isolated feasibility probes actually performed

These were disposable research experiments under `/tmp/eps-research`, **not
production changes or repository regression tests**. No dependency was added to
`package.json` or the application lockfile. No artwork was uploaded to a service.

Environment: Node 22.22.3. Packages for the PDF route:
`pdfkit@0.17.2`, `svg-to-pdfkit@0.1.8`,
`@jspawn/ghostscript-wasm@0.0.2` (runtime banner: Ghostscript 9.56.0).

For the PDF route, the SVG was written to PDF with SVG-to-PDFKit; the PDF was fed
to WASM `eps2write`, requesting `-dLanguageLevel=3`. The emitted files actually
advertised `%%LanguageLevel: 2`. The requested switch must not be confused with
proof of the output language or absence of rasterization.

A second interpreter pass installed temporary `image`, `colorimage`, and
`imagemask` tripwires before executing each EPS with the `nullpage` device.

| Research artifact | Observed output | Executed raster tripwire | Verdict |
|---|---|---|---|
| Small direct Level 3 radial-shading EPS, with opaque black-to-white colors and an elliptical vector clip | Accepted by the interpreter | None; interpreter exit 0 | Establishes basic native radial shading feasibility, **not completion of SVG/shadow conversion** |
| Opaque radial-gradient SVG → PDF → WASM EPS | 206,819 bytes; includes an inline RGB image, 1000 × 52, 8 bits/channel, in the painting content | `RASTER_EXECUTED:image`; interpreter exit 1 | **Fails vector-only requirement** |
| App's transparent shadow template on a white rectangle → PDF → WASM EPS | 176,649 bytes; source PDF has `/SMask`; EPS contains an inline RGB image covering the 204 × 24 pt artboard at 2040 × 240 pixels | `RASTER_EXECUTED:image`; interpreter exit 1 | **Fails vector-only requirement** |

Important qualifications:

1. These measurements apply to the exact tested route and configuration. They
   do not prove that every Ghostscript workflow rasterizes every opaque gradient.
2. The direct vector EPS probe was authored to test the shading primitive; it
   was **not exported by IconSplitter**, and did not test varying alpha.
3. Merely finding `shfill` in a converter's output was misleading: both failing
   EPS files had it in their generic prolog. Conversely, the successful native
   shading file contains no image drawing. A generic prolog can also contain
   the words `image` and `imagemask` without any raster artwork.
4. Tripwires demonstrate these particular raster drawing calls. They are not a
   complete security proof for arbitrary PostScript: aliases, dictionaries,
   bound procedures, resources and dynamically constructed programs must be
   considered. The production guarantee should come from a closed output
   grammar plus independent interpretation, not just monkey-patched operators.
5. The old WASM loader failed under Node's default fetch handling for a local
   `.wasm` path. Running the disposable probe with `node --no-experimental-fetch`
   worked. This is another reason not to adopt that old build unquestioningly.

### Supplied fixtures: blocked, not passed

The requested directory `tests/assets/svg to EPS` was not present in this
checkout when inspected. Only `tests/assets/grid-lightbulb.png` was present under
`tests/assets`. The two named SVG inputs were not available to inspect or export.

**Neither supplied SVG has been tested.** They must be attached or synced to the
repository before making an input-specific support claim. Do not replace them
with invented substitutes and report their tests as passed.

## 6. Why transparency needs a design, not another converter switch

PostScript Level 3 can describe smooth vector gradients, but not general
SVG/PDF-style transparent compositing. Gradient support and transparency support
are different questions. Ghostscript's upstream vector-device documentation
explicitly describes rasterization when transparency cannot be preserved.

For a gradient over a known constant opaque backdrop B, a supported normal
source-over blend can be evaluated as:

`opaqueColor(t) = alpha(t) × sourceColor(t) + (1 − alpha(t)) × B`

Here `alpha(t)` includes the applicable stop and paint opacity. Group opacity is
not generally equivalent to multiplying every descendant opacity when descendants
overlap. The implementation must follow the SVG color-interpolation/compositing
rules actually in use and verify them against an independent reference.

**Do not simply preblend the original stop colors and assume linear interpolation
is exact.** When both color and opacity vary between stops, their product can be
nonlinear. Use an appropriate PostScript function representation of the composed
curve, or an explicitly bounded adaptive vector approximation. The app's shadow
has both varying color and varying alpha, so this detail is material.

On a nonuniform backdrop, substituting the export background color can paint over
underlying objects incorrectly. For version one:

- Support opaque gradients on supported geometry.
- Support alpha gradients only where the actual backdrop is proven uniform and
  opaque over the gradient's entire affected region, or where a specifically
  verified vector compositing construction handles the overlap.
- Check the generated shadow's actual placement, artboard and overlap before
  claiming the known-backdrop case. Its appearance alone is not proof.
- Otherwise return a precise unsupported-vector-compositing failure. A later
  vector subdivision/mesh/geometry-intersection compositor is possible, but is
  a larger project with explicit error limits, not a raster fallback.
- An actual blur filter, image input or soft mask is not automatically equivalent
  to the app's radial-gradient shadow. Classify each fixture before choosing a
  supported representation.

Exact general SVG → vector-only EPS for every SVG feature is not a promise this
format or a generic conversion package can make. Output must never be falsely
certified in order to make every input appear to succeed.

## 7. Proposed implementation boundaries — future work only

### Pipeline

`prepared export SVG → supported vector scene + paint analysis → gradient and
backdrop resolution → vector-only EPS emitter → final metadata insertion →
strict vector audit + document validation → atomic save → persisted-byte readback`

No canvas, PNG, JPEG, image encoder, image embedding or render-to-bitmap step is
allowed on the EPS artwork-generation path. SVG/JPEG exports retain their own
separate pipelines.

### Suggested owners

- Extend `src/lib/upload/eps.ts` with typed solid/gradient paints and explicit
  eligibility checks. Keep geometry/path emission reusable.
- Add small EPS-specific modules for gradient reference resolution, transforms,
  stop/color-function construction, supported alpha flattening and shading
  emission. Names and splitting must follow RULE 16 rather than expanding a
  single writer into a monolith.
- Extend/replace the relevant portion of `src/lib/upload/epscheck.ts` with a
  parser for the **documented emitted grammar**. It must understand the newly
  allowed shading dictionaries, clipping, functions and metadata envelopes.
  Do not disable the old executable-program check just to accept `shfill`.
- Add a converter-neutral vector-only gate near the existing EPS export
  verification path. Header/DSC checks alone remain insufficient.
- Update `src/lib/upload/epsconv/builtin.ts` writer identity so the planner
  invalidates stale EPS artifacts without forcing unrelated JPEG rendering.
- Inspect final metadata insertion, atomic commit/readback, cached-file reuse
  and Download all. The invariant must apply to **delivered file bytes**, not
  just an intermediate writer string or an export record claiming success.
- Only after supported cases pass, replace the blanket built-in gradient warning
  with accurate capability/failure messaging. No silent converter switching.

### Gradient semantics to cover explicitly

- Linear and radial coordinates, `gradientUnits`, geometric object bounds,
  nested transforms and `gradientTransform`; noncircular radial ellipses.
- Multiple stops, stop opacity, fill/stroke opacity, boundary offsets,
  repeated offsets, inheritance through `href`/`xlink:href`, missing IDs/cycles.
- SVG paint/style inheritance, fill rule, and clip behavior for supported fills.
- `spreadMethod`, focal points, color-interpolation and degenerate gradients:
  either implement correctly with tests or reject explicitly.
- Gradient strokes require correct vector stroke-outline/clip semantics; do not
  certify them merely because gradient fills work.
- No dropping masks, filters, images, opacity groups or unsupported paint effects
  to make an EPS pass. Every unsupported visual feature must be reported.

## 8. Mandatory no-raster export-verification design

### A. Closed writer grammar: primary production guarantee

For native output, accept only the known EPS envelope, approved metadata syntax,
vector path operations, transforms, clipping, color operations, and approved
shading/function dictionaries. All numbers and references must be validated.

Reject image-bearing content and unsupported or unrecognized executable content:
`image`, `colorimage`, `imagemask`, image dictionaries/streams, image-bearing
patterns/forms, Type 3 bitmap glyphs, binary/hex/ASCII85 pixel payloads, embedded
bitmap previews and opaque imported programs. A shading function's color
parameters are not pixel data; distinguish them structurally.

Reject actual raster payloads even if they are unused or outside the visible
artboard. A generic unused procedure definition mentioning an image operator is
not itself proof of raster artwork, but it is outside the native writer's
necessary output vocabulary and need not be admitted into that closed grammar.

A regex searching for image keywords is **not** the certification mechanism.
Comments, strings, metadata and generic prologs must be distinguished from code
and payloads. Unknown constructions mean "not verified", never "probably vector".

For other converters, do not pretend this restricted parser accepts arbitrary
PostScript. Require an independently specified, tested verification path, or
refuse to certify their files as vector-only. In particular, an Inkscape response
cannot bypass the gate just because its converter was chosen explicitly.

### B. Independent interpreter check

Use a vetted, pinned, sandboxed PostScript interpreter build as a test dependency
without requiring a user-installed application. Establish supported devices and
license obligations before choosing a WASM package. Isolate the interpreter in a
worker/process with time/memory limits; disable filesystem/network access.

For each final EPS, execute it and verify the supported expected program, and
use instrumentation capable of observing raster operations through the supported
procedure/resource paths. Test the instrumentation itself with negative controls.
An optional conversion to PDF followed by recursive image-object/inline-image
inspection is useful corroboration, but **not the sole proof**: that conversion
can itself alter representation, and must not create the delivered artwork.

Independent visual comparison may render temporary reference/test images. These
are test measurements, **never components of the exported EPS**. If even temporary
rendering is unwanted, do not use it; retain structural/interpreter tests, while
acknowledging the weaker visual-fidelity evidence.

### C. Check the bytes that will actually be delivered

Audit after metadata insertion, not only before. Read saved files back and run
the vector audit/document checks on those exact bytes. Apply the same policy to
reused cached EPS and files copied through Download all. An old raster-containing
EPS cannot be grandfathered in by a matching settings fingerprint.

On a detection or unverifiable program:

- EPS stage result is **failed**, with the precise reason.
- Regression/export-verification test fails too; no expected-failure exception
  for one of the supplied fixtures once claimed supported.
- Do not publish/copy the rejected EPS or mark it successful in `export.json`.
- Preserve existing atomic-save and stale-output rules. Other independently
  verified SVG/JPEG stages may still succeed, but the overall row must clearly
  report the failed EPS stage, never full export success.

## 9. TDD/export-verification acceptance plan

1. **Fixture intake first.** Obtain both exact SVGs in
   `tests/assets/svg to EPS`; record paths, hashes, gradient/effect inventory and
   dimensions. Missing fixtures block their tests; do not silently skip them.
2. **Witness current failure.** Export both through real production preparation
   and the selected built-in EPS converter. Capture current explicit refusals.
   For a fixture that instead exposes a different unsupported feature, record
   that fact before changing scope.
3. **Negative raster controls first.** Require the audit/test to reject: direct
   image/colorimage/imagemask calls; aliases and bound procedures in any admitted
   grammar; ASCII85/hex/compressed pixel data; inline images; raster patterns,
   masks, bitmap glyphs, previews; hidden/outside-artboard raster payloads; and an
   injected raster payload after metadata insertion. Unknown code fails closed.
4. **Avoid false certification and false detection.** A blank EPS is not success.
   Require actual expected artwork and shading. Distinguish harmless metadata
   text from executable tokens; admit only the specified grammar. Demonstrate
   that the known raster outputs from the isolated PDF-route probes fail audit.
5. **Gradient behavior tests.** Opaque linear/radial, multiple/transformed stops,
   alpha over supported white and colored backdrops, true transparent outer
   edge, opacity/color product, stop inheritance and coordinate systems. Validate
   overlap handling, including explicit failure where not implemented.
6. **Actual exported-file tests for both supplied SVGs.** Use real production
   export preparation, final metadata insertion, folder commit and readback.
   Assert EPS envelope/bounds, expected vector drawing and gradient shading,
   successful independent interpretation, **zero embedded raster payloads and
   zero raster painting operations**. Compare geometry/colors to the reference
   within a documented tolerance; visual correctness alone never overrides a
   raster finding.
7. **Failure propagation.** Inject a raster-producing converter result and a
   post-write raster mutation. Assert export failure, no successful EPS record,
   no rejected file delivered, proper stale-file handling and failed test.
   Cover cached EPS reuse and Download all as well as new exports.
8. **Regression and delivery.** Update writer version, planner tests, truthful UI
   guidance and owning docs; run focused suites, types, lint, quality and full
   verification. Report measured fixture results and unresolved cases honestly.

**Release condition:** both exact supplied inputs pass actual-file vector audits
and interpretation, plus visual-fidelity checks agreed for the supported scope.
If either contains raster content or cannot be certified, the EPS export and
its test remain failed. No raster escape hatch.

## 10. Research outcome and open decisions

Established:

- Native Level 3 radial shading can be executed without raster painting in a
  small isolated EPS feasibility probe.
- The evaluated npm `svg-to-eps` package is a placeholder, not a solution.
- The evaluated PDF intermediary route actually produced raster artwork and
  therefore fails the requirement, despite successful conversion exits.
- The app's shadow requires varying-alpha handling, not just gradient syntax.
- The proposed solution can avoid a separate user-installed application and
  avoid adding a production conversion framework.

Not established / blocking before implementation claims:

- Exact content, eligibility and exported results of the two supplied SVG files:
  **files missing from this workspace**.
- Correct vector-only alpha flattening for those files and for every app shadow
  placement/overlap.
- Compatibility of the eventual output with the user's target EPS editor or
  stock-upload validator. Native PostScript shading is vector content, but
  editor-specific editability/version acceptance needs actual testing.
- A selected modern independent interpreter package and a fully tested no-raster
  verification implementation. Disposable tripwires are not that implementation.

No application code or automated export tests were implemented in this research
phase. The next phase is fixture intake and implementation against this design,
not a claim that the two requested exports already pass.

Documentation check attempted: `npx vitest run tests/docs_navigation.test.ts
--reporter=dot` could not start because the checkout lacks the optional native
module `@rollup/rollup-linux-x64-gnu`. No test result is claimed. The dependency
tree was not reinstalled or modified for this research-only documentation change.

## 11. Sources inspected

Primary sources; inspected 2026-10-21. Registry metadata/archive inspection was
performed directly rather than relying only on search snippets.

1. [`svg-to-eps@1.0.0` registry metadata](https://registry.npmjs.org/svg-to-eps/1.0.0)
   and [published source archive](https://registry.npmjs.org/svg-to-eps/-/svg-to-eps-1.0.0.tgz).
   The actual converter source is a placeholder. The unrelated
   [`eps` package](https://registry.npmjs.org/eps/0.1.0) describes a reactive web framework.
2. [`svg2pdf.js` upstream README](https://github.com/yWorks/svg2pdf.js/blob/664ed8668d3765061a409714e9a82f940f2dbd52/README.md),
   [gradient implementation](https://github.com/yWorks/svg2pdf.js/blob/664ed8668d3765061a409714e9a82f940f2dbd52/src/nodes/gradient.ts),
   and [published 2.8.1 archive](https://registry.npmjs.org/svg2pdf.js/-/svg2pdf.js-2.8.1.tgz).
   The installed archive's `dist/svg2pdf.es.js` also contains the averaged-opacity
   logic described above; this was not inferred only from a development branch.
3. [SVG-to-PDFKit supported features](https://github.com/alafr/SVG-to-PDFKit#supported)
   and [0.1.8 registry metadata](https://registry.npmjs.org/svg-to-pdfkit/0.1.8).
   This is a PDF library, not an EPS writer.
4. [Ghostscript vector-device documentation](https://github.com/ArtifexSoftware/ghostpdl/blob/26abd9b92ad9460e2416b04ed95b898dbb68f3eb/doc/src/VectorDevices.rst):
   high-level device behavior, transparency caveats and `eps2write`.
5. [Ghostscript Level 3 shading support](https://github.com/ArtifexSoftware/ghostpdl/blob/26abd9b92ad9460e2416b04ed95b898dbb68f3eb/Resource/Init/gs_ll3.ps):
   shading types and `shfill` implementation.
6. [`@jspawn/ghostscript-wasm` usage](https://github.com/jsscheller/ghostscript-wasm),
   [tests](https://github.com/jsscheller/ghostscript-wasm/blob/master/tests/all.js),
   and [0.0.2 package metadata](https://registry.npmjs.org/@jspawn%2Fghostscript-wasm/0.0.2).
7. [`@okathira/ghostpdl-wasm` build/runtime documentation](https://github.com/okathira/ghostpdl-wasm/blob/410bf6a5359e0b8f79c795b13342ea35083805d6/README.md)
   and [1.1.0 registry metadata](https://registry.npmjs.org/@okathira%2Fghostpdl-wasm/1.1.0).
8. [`ghostscript-wasm-esm@1.0.1` metadata](https://registry.npmjs.org/ghostscript-wasm-esm/1.0.1).
9. [CairoSVG README](https://github.com/Kozea/CairoSVG) and
   [Cairo PS source mirror](https://github.com/Distrotech/cairo/blob/adb896e8c5f4e1fb22db32c8bfb5f0a9625c4869/src/cairo-ps-surface.c):
   gradient emission with `shfill` and the documented transparency fallback
   analysis. The Cairo mirror is historical source evidence, not a measurement
   of a newly installed CairoSVG release.
