# Shadow + source viewport overflow — research and automatic-repair plan

Date: 2026-10-26. Code baseline: `b32d1a3`.
Status: **research/design only; implementation is NOT authorized in this change**.
No production code, tests, dependency files or source SVGs are changed.

## 1. Request and available evidence

Reported preview error on two waving-flag icons:

> export preview unavailable — source paint extends outside its viewBox/viewport;
> a shadow cannot preserve the original clipping

Requested source paths, relative to the repository:

- `tests/assets/bug with SVG export expl temp/icon-waving-flag_AI_3_01.svg`
- `tests/assets/bug with SVG export expl temp/icon-waving-flag_AI_5_04.svg`

**Neither file is present in this checkout.** A filesystem search under `/home/user`
and the uploaded attachment directory found no matching flag SVGs. The directory
currently contains the two earlier lightbulb fixtures and the snowflake fixture.
The supplied attachments are screenshots (`image-1.png`, `image-2.png`), not SVG
source bytes. They show the warning and the fallback artwork but cannot establish
path coordinates, transforms, declared overflow, viewport size or exact settings.

Therefore:

- The code path producing the warning is confirmed.
- Bounds limitations and the current repair policy are confirmed by inspection.
- **The exact cause/overflow amount for either named flag is not yet confirmed.**
- No flag-specific successful repair, pixel comparison or export result is claimed.
- Obtaining the two original SVGs is the first implementation prerequisite, not
  something to replace with traced screenshots or invented path data.

## 2. Confirmed cause of this warning

### Call chain

1. `upload/exportpreview.ts::buildPreview` calls the same
   `lib/upload/prepare.ts::prepareExportSvg` used by actual export.
2. Preparation captures the source viewBox, or width/height frame, before cleaning
   removes root pixel dimensions. Fully AS-IS processing has its own early path.
3. With effective `shadowEnabled = true`, `shadowSourceFrame` calls
   `viewrepair.ts::repairStrokeFrame`.
4. Existing repair permits only small stroke/cap overshoot: visible geometry
   without stroke reach must be inside the frame within **0.002 source units**,
   and painted overflow must fit within **2% of the smaller frame dimension**.
5. `place.ts::overflowsSourceFrame` measures paint again, comparing all four
   edges against the repaired/original frame, with **0.002** tolerance.
6. Remaining overflow returns `unsupported` with the reported message.
7. Preview falls back to original source text and displays the error note. That
   displayed flag is **not proof of a successful export preview**. Export uses
   the same guard; this is not merely a toast or a performance/cache problem.

The safeguard has a real purpose. Adding a shadow can extend the source's layout
frame; simply expanding that frame may expose off-frame paths or parts of strokes
that the original viewport hid. Valid SVG can intentionally contain such geometry.
The warning does **not**, by itself, prove that the source file is malformed.

### A second confirmed issue to distinguish before repairing geometry

`geom/path.ts` explicitly computes Bézier **control-point hulls**, not tight curve
extrema. `geom/bounds.ts::shapeBounds` transforms that hull and adds conservative
stroke reach. `shippedBounds` attempts bake + actual stroke outlining, but then
measures the result using the same bounds traversal; it also falls back to the
analytic/conservative path if baking/expansion cannot provide the probe.
Outlining does not make a remaining filled curve's control hull a tight bound.

A control point can be outside a frame while the actual curve stays inside.
Analytic illustration, **not data from either missing flag**: a cubic with
P0=(10,50), P1=(10,-10), P2=(90,-10), P3=(90,50) has
`y(t) = 50 - 180t + 180t²`, whose minimum is **5** at t=0.5. The control hull
minimum is **-10**. An otherwise in-frame filled contour containing that cubic
can therefore be conservatively classified outside a 0…100 frame even though
its actual curve is inside. This illustration has not been added as runnable
code in this documentation-only change.

Wavy artwork makes this a relevant hypothesis, **not a diagnosis of the flags**.
First distinguish false-positive hull overflow, a small actual pen overshoot,
viewport-mapping differences and genuinely clipped paint. Do not jump directly
to changing source coordinates or adding a clipping engine.

## 3. Automatic repair policy

The objective is to export the artwork that was visible under the approved
source-rendering contract, with a correctly positioned vector shadow, without
revealing hidden geometry. Repair the **export copy**, never overwrite the
approved source, its version history or its original hash. No confirmation popup,
provider request, special filenames, coordinates or icon-type exceptions.

| Classification | Automatic action |
|---|---|
| Conservative bound exceeds frame, trustworthy tight paint stays inside | Correct the viewport classification; do not change artwork or frame |
| Proven small stroke-only overflow covered by existing policy | Keep the existing bounded in-memory stroke-frame repair; do not increase 2% |
| Genuine root-viewport clipping, representable by supported vector geometry | Flatten the clipping into the icon's painted vectors; then add/fit the shadow |
| Explicit visible overflow supported by the source-rendering contract | Preserve that visible paint; do not invent a clip merely because a viewBox exists |
| Unknown mapping, unsupported compositing/paint, failed intersection or invalid numeric geometry | Preserve the named refusal; no silent guess, hidden crop, raster fallback or fake success |

A viewBox is a coordinate mapping, **not universally the viewport clip itself**.
Capture root width/height, viewBox, `preserveAspectRatio` and applicable root
`overflow` before cleaning. Match the canonical source/reference renderer rather
than assuming arbitrary embedding CSS. `meet`/letterboxing, `slice`, `none`,
non-origin frames and size-only SVGs require explicit mapping tests. Unsupported
nested viewports, authored clip paths/masks and root transforms do not become
supported accidentally through this repair. Where the source rendering contract
cannot determine clipping unambiguously, report that limitation rather than
claiming visual preservation.

## 4. Ordered implementation steps (future work)

### Step 1 — obtain originals and pin the reproduction

- Add both exact original SVGs as immutable fixtures at the requested paths;
  record hashes and retain their bytes unchanged.
- Capture effective settings, especially Shadow, padding/artboard mode, stroke
  width/colour/caps and Expand strokes. Reproduce using actual `prepareExportSvg`
  and the full Upload preview, not only a standalone SVG viewer.
- Record per-edge original frame, conservative geometry/paint bounds, tight bounds
  where available, overflow distances and which existing repair precondition fails.
  Record measurement provenance: outlined geometry versus conservative fallback.
- Confirm whether each flag is a bounds false positive, minor pen overflow,
  actual clipping or a viewport mapping case. If originals have additional
  unsupported features, document those separately; screenshots cannot rule them out.

### Step 2 — tighten the decision before changing the picture

- Add failing regressions for an in-frame Bézier with out-of-frame controls,
  a curve that really exits the frame, extrema near a boundary and degenerate
  derivatives. Include C/S/Q/T, arcs, closing segments and nested affine transforms.
- Introduce a focused viewport-measurement helper, initially without globally
  changing conservative placement/EPS bounds. Evaluate endpoints and derivative
  roots in [0,1] **after mapping into the comparison coordinate system**.
- For cubic/quadratic coordinates use analytic extrema; for arcs/ellipses use
  transformed extrema or the validated represented-curve model with an explicit
  approximation error budget. Stroke bounds must use the real supported pen
  outline (caps, joins, miters, dashes, anisotropy and non-scaling pens included),
  then tight bounds of those represented curves—not their control polygon alone.
- Keep conservative bounds as a quick containment filter, not conclusive evidence
  of actual overflow. Distinguish unsupported/uncertain measurement from empty
  geometry. Do not fix numerical uncertainty by increasing the current tolerance.
- If this resolves both originals, they need no source geometry rewrite. Retain
  the actual-clipping safety cases and continue to implement only proven needs.

### Step 3 — support genuine rectangular viewport clipping safely

For a supported source that really is clipped, preserve that clipping in vector
geometry before extending layout for its shadow:

1. Resolve the original clip rectangle in the same coordinate space as the icon.
2. Classify paint as wholly inside, wholly outside, or crossing. Inside geometry
   stays unchanged/editable; fully outside paint contributes nothing to the icon
   or its shadow; crossing paint needs actual curve/region intersection.
3. Intersect **painted regions**, not just centreline endpoints. A trimmed stroke
   centreline would create new caps and different joins. Outline only affected
   strokes in the correct pen space and intersect the filled outline with the
   viewport rectangle. Preserve fill then stroke, fill rules, compound holes,
   path order and compositing. Do not union independent translucent paint layers.
4. Apply the original viewport restriction to the **icon only**. The new shadow,
   artboard background, size guide and badge are not clipped to that old frame.
5. Derive icon/shadow bounds from the resulting visible paint and run existing
   uniform placement, source margins, pinned/MP fitting and final containment.

**Integration order is essential:** configured stroke width is in final artboard
pixels. Do not outline/clip it once in source space and later pretend the width
control still works. For each placement candidate, bake/restyle using existing
stroke semantics, map the original viewport into that candidate's coordinates,
outline/intersect affected paint, measure the clipped icon, then append the shadow
and measure the composite. Source-width, anisotropic and non-scaling pens must
retain their current coordinate-space rules. Every settings change rebuilds from
the original SVG, not a previously outlined result. Avoid restroking newly created
clipping edges through inherited/global stroke properties.

`geom/ops.ts`/`outline.ts` provide an M/L/C/Z representation, **not a general
curve-region Boolean intersection engine**. A rectangle-aware, curve-preserving
intersection capability or vetted browser-compatible geometry dependency must
be proven before this branch is called implemented. Demonstrate winding/holes,
tangent contacts, disjoint components, degenerates and numeric determinism. Plain
polyline clipping of control points, canvas raster masks, retained `<clipPath>`
wrappers or an assumed EPS clipping shortcut are not acceptable substitutes.
No dependency is selected or installed in this research change. A library decision
must include licensing, offline/single-HTML bundling, curve precision, resource
limits and test/runtime support; WASM or a server is not assumed available.

### Step 4 — preserve paint and refuse unrepresentable cases atomically

- Plan replacements on detached copies; commit only after all affected layers
  validate. A failed repair leaves the source and existing committed outputs intact.
- Preserve inherited visibility, hidden/zero-opacity subtree behavior, fill versus
  stroke opacity, per-element/group opacity and paint order. Use the existing
  repair compositing rules, rather than duplicating opacity on split fill/stroke.
- Clipping changes object bounds, which can change `objectBoundingBox` gradients.
  Freeze/retarget supported gradient coordinates to the pre-intersection paint
  space so clipping does not stretch the gradient. EPS representability must be
  verified separately. Keep existing named refusals for unsupported paints,
  gradients, dash/transform combinations, masks, filters, patterns and group
  compositing; do not silently flatten them incorrectly.
- Retain vector curves/regions through optimization and clean export. Unsupported
  general clips/masks must not bypass `bake.ts` coordinate-definition vetoes.

### Step 5 — share preparation and make repair traceable

- Main integration owners: `prepare.ts`, `viewrepair.ts`, viewport-bound helper,
  `geom/path.ts`/`outline.ts`/stroke measurement and `place.ts` candidate staging.
  Proposed new geometry/viewport-repair helpers must follow existing lib ownership
  and quality limits rather than growing `prepare.ts` into a monolith.
- Preview, SVG, JPEG raster input and vector EPS all consume the same repaired
  prepared document. No preview-only fix or format-specific artwork divergence.
- Reuse the existing non-uniform-stroke repair; do not regress editable unaffected
  shapes, selected endpoints, exact final widths or previous bulb/leaf repairs.
- Add concise repair mode/revision/counts to preparation/export diagnostics using
  an explicitly reviewed backward-compatible record shape. Keep original source
  hashes; do not log full SVG, prompts or private content. Refresh preview cache
  versioning for changed preparation and verify failed/partial exports can rerun;
  review committed-package invalidation rather than assuming unchanged settings
  imply identical output after a repair algorithm change.
- Existing full AS-IS export stays byte identical when no new processing is
  requested. Do not sneak an automatic source rewrite into the fast path.
- Successful supported repair should show a valid prepared preview, not the old
  unavailable note. Genuine unsupported cases keep a precise reason. Do not hide
  the warning while still exporting the wrong picture.

### Step 6 — verify actual appearance and all outputs

Required regressions, written failing before implementation:

- Both exact flag SVGs: settings from the report, then Shadow on/off; source/
  content/pinned/MP artboards; null/explicit padding; source/final widths; cap/join
  choices; Expand strokes on/off; anisotropic/reflected/nested transforms.
- False-positive control hulls versus true exits; near-edge and >2% cases;
  deliberately clipped wide pens; far-off-frame objects; partial/multiple crossings;
  compound holes and winding; non-origin, width/height-only, viewport aspect modes.
- Hidden shapes, visibility overrides, opacity, inherited paints, dashes and
  representable gradients; empty or fully clipped icons; malformed/nonfinite or
  unrepresentable data must fail honestly rather than look like a successful icon.
- Render equivalence against the original's **defined viewport/clip**, excluding
  the newly requested shadow. Use actual browser/native raster rendering and an
  explicitly bounded antialias tolerance plus geometric assertions. Image
  similarity alone cannot authorize loss of a small feature or exposure of hidden
  geometry. Source-with-settings references must use the same pen/styling policy.
- Validate all final artwork plus shadow is inside the final artboard within the
  unchanged precision contract. Validate no hidden/out-of-source paint was revealed.
- Run real SVG → optimize → clean → SVG/JPEG/vector EPS, record/readback and metadata
  checks. EPS is not allowed to rasterize artwork or rely on a separate app. Use
  the existing real export test assets too; local readback is not stock ingestion
  proof. Unsupported EPS compositing stays an honest partial-output result.
- Repeated preparation is deterministic, original hashes/bytes stay unchanged,
  preview equals the actual prepared export, toggling settings does not accumulate
  outlines, and batch failure isolation/cancellation/undo/controls remain intact.

Existing `upload_shadow_geometry.test.ts` includes a refusal-based test to prevent
revealing an out-of-frame rectangle. Do **not** simply delete it or flip `false`
to `true`. For a newly supported clipped case, replace refusal-as-proxy with
stronger visible-region/output assertions and retain explicit unsupported-refusal
cases; document that expected-behavior migration. Existing `repairStrokeFrame`
helper limits and its negative tests can remain unchanged. No harness isolation,
assertion strength, native alarm, source scope or coverage threshold may weaken.

### Step 7 — bound work and release only after gates pass

- Cheap inside/outside tests first; intersect crossing regions only. Bound path
  complexity, Boolean work, placement probes and memory. No unbounded retries,
  arbitrary point dropping or silent low-resolution fallback. Cache only with
  complete source/viewport/style/revision keys; no cross-source result leakage.
- Probe placement cost with both supplied flags and a realistic multi-icon Upload
  tab. Preserve the recent boot/summary/map/preview response budgets. Do not claim
  a browser speedup from Node timings or a clipping repair from synthetic assets.
- Run focused new tests and existing viewport/shadow/stroke/fit/live-preview/export
  tests, types, lint, changed quality, docs, `verify:fast` and `verify`. Preserve
  original tests/assets and all format acceptance gates.
- Update current repair/geometry/export owner contracts and diagnostics; append
  measured verification to the quality ledger without reading it. Commit/push
  only the approved implemented scope. Do not declare both flag failures fixed
  until exact-file preview and real exports pass with unchanged originals.

## 5. Work completed now / verification

Research only. Existing real production tests ran unchanged:

- `tests/upload_viewrepair.test.ts`: **5/5 passed**.
- `tests/upload_shadow_geometry.test.ts`: **9/9 passed**.
- `tests/upload_stroke_repair.test.ts`: **19/19 passed**.
- Total **33 tests / 3 files passed**. These confirm today's guard/repair contracts;
  they do not validate missing flag files or a not-yet-implemented repair.

Focused log: `/home/user/viewport-research/focused.log` (not a committed artifact).
Current contract entry: [automatic repairs](../../current/sor/upload-auto-repair.md).
Documentation navigation: **4/4 passed**; whitespace passed. Both
`verify:fast -- --base b32d1a3` and `verify -- --base b32d1a3` completed with
**ALL LANES PASSED**: each ran **3,066 tests / 292 files**, and the full gate's
uninstrumented native/performance lane passed **30 tests / 5 files**. Types,
lint, quality and build passed. Coverage stayed **95.54 / 90.23 / 98.32 / 98.37%**
(statements/branches/functions/lines). Changed-production quality correctly found
no production changes. Logs: `/home/user/viewport-research/verify-fast.log` and
`verify-full.log`. These gates validate the unchanged current implementation and
documentation, **not the proposed future repair**. No new code/tests/assets,
dependency changes, generated build outputs or weakened gates are committed.

**Next action:** obtain both actual SVG files, then execute Step 1 before writing
repair code. This delivery documents the solution and ordered work; it makes no
production repair or per-file success claim.
