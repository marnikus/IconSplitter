# Waving flags — false viewport-overflow warning: research and automatic-fix plan

Date: 2026-10-26. Production baseline: `b32d1a3`; supplied fixtures: `8324120`.
Status: **research/design only — NO repair code implemented**.

## 1. Request, supplied files and availability timeline

Reported error:

> export preview unavailable — source paint extends outside its viewBox/viewport;
> a shadow cannot preserve the original clipping

Inputs:

- `tests/assets/bug with SVG export expl temp/icon-waving-flag_AI_3_01.svg`
- `tests/assets/bug with SVG export expl temp/icon-waving-flag_AI_5_04.svg`
- Two screenshots showing original-source fallback and the unavailable note.

The flags were absent during the initial checkout investigation. While publishing
that first draft, push detected remote commit **`8324120` — “svg new issue”**, which
contained both requested files and an additional copy of the first flag at
`tests/assets/icon-waving-flag_AI_3_01.svg`. The supplied commit was merged without
replacing its files. **Both originals are now available and were examined.**
The initial missing-file prerequisite is resolved; no re-upload is required.

Original SHA-256 hashes (the repair must preserve these):

| File | SHA-256 |
|---|---|
| `icon-waving-flag_AI_3_01.svg` | `078e104b46057df33912ab4fbf65c8698fb8d2bc77fe075b20407326c8bb8785` |
| `icon-waving-flag_AI_5_04.svg` | `fdf3f958c67da4875f53e9305230a072fbfa45329a9ee4b6bf7941ef5ffec4e9` |

This delivery changes documentation only. User-supplied fixture files were
incorporated unchanged from their own commit. No production/test code, source
coordinates, settings, guards, tolerances or dependencies are modified.

## 2. Confirmed per-file reproduction and root cause

**Both warnings are bounds false positives in the current geometry pipeline.**
The negative Y values are Bézier controls, not positions the curves necessarily
reach. Neither example needs a larger source viewBox, path rewriting or an actual
clipping operation to address this warning.

### Inputs

- Flag 3: viewBox `0 0 224 224`, fill none, black stroke width 1, round caps/joins.
  Its first waving cubic includes control Y **−18**.
- Flag 5: viewBox `0 0 240 240`, fill none, black stroke width 1, implicit default
  cap/join semantics. Its first waving cubic includes control Y **−15**.
- Both are simple paths plus a circle/ellipse, without source transforms or
  authored clip paths in these supplied files.

### Original production behavior, executed without replacing algorithms

A temporary stdin-only diagnostic loaded original TypeScript modules through Vite
SSR with Happy DOM. It called `visibleBounds`, `shippedBounds`, `repairStrokeFrame`
and `prepareExportSvg` on the actual supplied source bytes. No diagnostic script,
new test or prototype repair was added to the repository.

Both files fail with the exact reported `unsupported` message using:

1. Source/default visual settings (`AS_IS_SETTINGS`) plus Shadow enabled.
2. Factory `DEFAULT_UPLOAD_SETTINGS` plus Shadow enabled.

Source/default settings with Shadow disabled remain successful and byte-identical
AS-IS. These are controlled reproductions, not a claim that every setting from the
screenshots was captured.

### Measured bounds

A separate read-only calculation evaluated endpoint/derivative extrema of M/L/C/Z
outlines, first for source geometry, then for a detached copy baked and outlined
by the **existing** `bakeGeometry` / `expandStrokes` routines. Both probes had no
bake veto and expanded two stroked shapes. This is tight measurement of the
pipeline's represented vector curves, not a browser raster test or a deployed fix.

| Measure (source coordinates) | Flag 3 | Flag 5 |
|---|---:|---:|
| Source frame | 224 × 224 | 240 × 240 |
| Current geometry control-hull minY | −18 | −15 |
| Current analytic paint minY | −18.5 | −16.003772 |
| Current `shippedBounds` paint minY | −2.121 | −0.580 |
| Tight source-curve minY | **8.060529** | **8.688296** |
| Tight represented painted minY | **7.560711** | **8.191972** |
| Tight represented painted minX | 32.5 | 30.5 |
| Tight represented painted maxX | 189.500322 | 187.5 |
| Tight represented painted maxY | 215.499894 | 218.027135 |
| Existing repaired frame | unchanged | unchanged |
| Existing overflow result | true | true |

Every tight painted edge is inside its source frame. These are not tiny tolerance
violations: the true represented top edges have over seven/eight source units of
space. There is **no justification to expand the frame or reveal hidden artwork
for these files**. Original DOMs were unchanged during both probes; source bytes
and hashes remain unchanged.

Raw evidence: [measurements.json](measurements.json). Diagnostic logs outside Git:
`/home/user/viewport-research/flags-probe.json` and `flags-tight-probe.json`.

### Why current code rejects them

1. `upload/exportpreview.ts::buildPreview` calls the same
   `lib/upload/prepare.ts::prepareExportSvg` as real export.
2. Preparation captures the source viewBox (or width/height frame) before cleaning.
3. With effective Shadow enabled, `shadowSourceFrame` calls `repairStrokeFrame`.
4. `geom/path.ts` uses Bézier **control-point hulls**. `geom/bounds.ts::shapeBounds`
   transforms those hulls and adds stroke reach. A hull is a conservative envelope,
   not the tight bounds of the curve.
5. Existing minor repair requires geometry inside the frame within **0.002 source
   units**, and paint overshoot within **2% of the smaller frame dimension**.
   The negative control hull fails that geometry precondition for both flags.
6. `shippedBounds` attempts actual baking/pen outlining but measures those remaining
   curve outlines through the same hull-based bounds traversal (or falls back to
   conservative analytic geometry when outlining cannot supply a probe). For these
   flags it still returns negative top bounds despite the represented paint being
   inside. “Outline first” alone does not guarantee tight curve bounds.
7. `overflowsSourceFrame` sees the false negative minY and returns `unsupported`.
8. Preview shows original source plus the warning. That image is **not** proof that
   the prepared export succeeded. This is not a toast/cache/performance failure.

The safety invariant is valid; its bounds evidence is too conservative for this
classification. Do not remove that invariant or treat Bézier controls as painted
vertices. Valid SVG can also contain genuinely clipped geometry; that is a
separate case, not the cause demonstrated by these two files.

## 3. Recommended automatic fix — focused scope

**Introduce trustworthy tight curve/paint measurement for source-viewport
classification; keep artwork and original files unchanged.**

| Classification | Automatic action |
|---|---|
| Hull overflows but tight painted bounds are inside | Continue normal preparation, original frame and artwork unchanged |
| Tight geometry inside, actual minor stroke/cap overflow within existing policy | Keep bounded in-memory minor stroke-frame repair using tight measurements |
| Proven true geometry outside / deliberately large clipped pen | Retain current named refusal; do not reveal previously hidden paint |
| Unsupported/uncertain measurement | Keep an honest unsupported result; do not substitute “empty” or success |

The fix applies to **any future icon with the same curve-bound issue**, not flag
filenames, specific negative numbers or particular shapes. No manual repair popup,
provider request, control removal or permanent stroke expansion in the source.
The user’s chosen cap/join/width/colour and source/approved-version identity stay.

A viewBox is a coordinate mapping, not universally the viewport clip itself.
The focused fix must preserve the application's existing source-frame contract;
root overflow, width/height, `preserveAspectRatio`, non-origin frames and embedding
semantics must not be casually reinterpreted. Broader source clipping semantics
are separate from correcting these demonstrably wrong bounds.

## 4. Ordered implementation steps — future work, no code now

### Step 1 — lock actual-file failures and source preservation (prerequisite resolved)

- Use both supplied originals and the hashes above, without editing their bytes.
- Add failing tests around actual `prepareExportSvg` and the Upload preview:
  both must currently reproduce this exact unsupported message with Shadow on.
- Pin both tested settings families above, then the precise reported UI settings
  if available. Do not claim the latter were inferred from screenshots.
- Pin source curve extrema and inside/outside classification independently of the
  production hull algorithm. Tests that merely compare two callers of the same
  wrong bound function would not prove the fix.
- Keep shadow-off AS-IS bytes identical; record both source hashes before/after.

### Step 2 — implement reusable tight represented-curve bounds

- Proposed owner: a focused helper in `lib/upload/geom/`, consuming the existing
  outline/segment model. Do not grow `prepare.ts` into a geometry implementation.
- For each supported segment include endpoints plus interior extrema. For cubic
  and quadratic coordinates, solve derivative roots and keep valid roots in [0,1].
  Support implicit/smooth/relative commands by reusing the existing normalization
  for C/S/Q/T and M/L/H/V/A/Z rather than creating another lenient path parser.
- Transform curves into the comparison coordinate system **before** taking extrema;
  transforming a precomputed local bounding box is not tight under rotation/shear.
  Cover degenerate/linear derivatives, repeated roots, close commands, isolated
  moves and numeric precision. Nonfinite/malformed geometry must fail by name.
- Arcs/ellipses need transformed extrema or the validated represented-cubic model
  with explicit error accounting. Do not label cubic arc approximation or offset
  approximation mathematically exact source-SVG paint without validation.
- Retain conservative hull bounds as cheap containment filters where useful. A
  hull wholly inside is safe; a hull crossing a border is **not proof** of overflow.
  Compute tight bounds only for ambiguous/relevant candidates where practical.
- Add synthetic in-frame curves with out-of-frame controls **and** true exiting
  curves. Include transforms, compound subpaths and all four viewport edges.

### Step 3 — measure painted regions, not just centrelines

- Build a detached measurement probe using current bake/outline semantics, then
  measure its represented fill curves tightly. Respect cap, join, miter, dash,
  visibility, inherited opacity, non-uniform and non-scaling stroke behavior.
- Do not substitute centreline-only bounds for paint: a round cap can really cross
  an edge while the centreline stays inside. Do not use a fixed half-width growth
  for every transformed/mitered pen when the actual outline is available.
- Keep source-width and explicit-final-pixel width semantics distinct. A preflight
  source-frame classification cannot permanently outline the icon and disable
  later stroke controls. Placement still rebuilds from the original for each
  settings change; existing anisotropic repair stays in its correct pen space.
- Expose measurement provenance: tight supported outline, conservative fallback,
  empty or unsupported. If expansion refuses, do not silently promote its
  conservative fallback to trustworthy tight paint or pretend no paint exists.
- Preserve source DOM and compositing; measurement must never change the source
  document or the document subsequently sent to export.

### Step 4 — use consistent trustworthy bounds throughout the shadow decision

- Primary integration owners: `prepare.ts::shadowSourceFrame`,
  `viewrepair.ts::repairStrokeFrame`, `place.ts::overflowsSourceFrame` and the new
  focused viewport measurement API. Audit all callers before changing signatures.
- Both the minor-repair geometry/paint check **and** the final overflow veto must
  agree on measurement semantics. Tight preflight followed by the old conservative
  hull veto would simply reintroduce this warning.
- For these flags, accept tight contained paint without changing the source frame.
  Do not extend to a false negative hull minY as a workaround.
- For actual minor stroke-only overflow, preserve existing **2%** policy and
  **0.002** precision. The source frame may extend only under that existing policy.
- Keep refusal for actual off-frame geometry, deliberately clipped wide strokes,
  unsupported clips/masks/filters/patterns, unsupported paints and other vetoes.
  Do not globally turn `overflowsSourceFrame` into `false` or catch-and-ignore it.
- Avoid globally replacing conservative placement/EPS bounds in the first change.
  The source-frame check is the proven fault. `placeShadowFrame` and its candidate
  measurement still need regression coverage: passing the preflight alone does
  not prove final fit, source margins, shadow positioning or export correctness.

### Step 5 — share real output and verify the complete pipeline

- Preview and SVG/JPEG/EPS must consume the same preparation. No preview-only fix,
  source rewrite, raster fallback, ad hoc `<clipPath>` wrapper or different export
  image. Source/approved version and original source hash remain unchanged.
- Both flags: Shadow on/off; source/content/pinned/MP artboards; null/explicit
  padding; source/final stroke widths; rounded/butt/square and supported custom
  endpoints; Expand strokes on/off. Test nested/reflected/anisotropic/non-scaling
  variants without breaking earlier snowflake/bulb/leaf repairs.
- Test near-edge curves, large negative controls with wholly in-frame paint,
  actual exits, wide pens, genuine off-frame shapes, size-only/non-origin frames,
  hidden/zero-opacity outliers and explicit unsupported clipping/compositing.
- Retain existing real-clipping refusal tests and all old minor-repair limits.
  They need **no expected-success migration** for this focused bounds correction.
  Add positive flag tests; do not delete safety cases or loosen their assertions.
- Validate final painted icon plus shadow is inside its final artboard within the
  existing precision contract, preserves source margins appropriately and doesn't
  reveal previously hidden geometry. Repeated preparation must be deterministic.
- Run prepare → optimize → clean → SVG/JPEG/vector EPS, actual export commit,
  record/readback, metadata and output-flag tests. Preserve genuine vector
  gradients and format-specific honest failures. Use the existing real export
  fixtures too, not just these new small SVGs.
- Compare actual browser/native raster output against the source/reference under
  the same style and viewport, excluding the newly added shadow. Combine bounded
  antialias tolerance with analytic/region assertions. A similarity score alone
  cannot authorize loss of a small feature or exposure of unseen geometry.
- Review preview cache/preparation revisioning and compatibility of committed
  repair diagnostics. Unchanged source/settings must not accidentally reuse a
  failed preview after preparation changes. Do not log full SVGs or private inputs.

### Step 6 — performance, documentation and release gates

- Reuse one trustworthy source measurement per preparation where safe; don't
  repeat full outline work in both guard stages. Use cheap contained-hull paths
  and complete source/style/revision keys. No cross-source cached success.
- Bound curve-root/outline work and preserve the recent Upload warm-gesture,
  single-row projection and bulk-map budgets. Measure actual complex-icon tab
  behavior before any browser latency claim; Node diagnostics are not paint time.
- Run new failing-then-green tests; unchanged viewport/shadow/stroke/fit/preview/
  export/format tests; types, lint, changed quality, docs, `verify:fast`, `verify`.
  Keep all native alarms, source scope, isolation and coverage thresholds intact.
- Update current automatic-repair/geometry/export contracts and source/test owners;
  append measured evidence to the quality ledger without reading it; commit/push
  only approved implementation scope. Every production function must meet limits.
- Completion requires both actual flag previews and real supported exports to pass,
  no unavailable note for this false-positive class, unchanged originals and
  preserved real-clipping refusals. **That outcome is not yet claimed.**

## 5. Separate future feature — genuine viewport clipping (not needed here)

If a different source truly paints outside its viewport, changing measurement
cannot safely reveal that paint. An optional future capability could intersect
supported painted vector regions with the original viewport, then add the shadow
outside that old restriction. That is a separate feature requiring a proven
curve-region Boolean engine, paint/compositing/gradient preservation and correct
candidate-space pen handling; the current outline model is not such an engine.

Do not build this machinery merely to resolve these flags: their tight paint is
already inside. Do not introduce a library, raster mask, arbitrary source crop,
control-point polygon clipping or retained clip wrapper as a quick workaround.
Current general clips/masks/filters/patterns/unknown viewport semantics remain
honest refusals. No Boolean dependency is selected or installed by this plan.

## 6. Verification of the research delivery

Existing real production tests ran unchanged: viewport repair **5/5**, shadow
geometry **9/9**, stroke repair **19/19** — **33 tests / 3 files passed**. Docs
navigation **4/4** and whitespace passed. Initial `verify:fast` / `verify` against
`b32d1a3` passed all lanes: **3,066 tests / 292 files** each; full uninstrumented
native/performance **30 / 5**; types/lint/quality/build passed. Coverage unchanged:
statements/branches/functions/lines **95.54 / 90.23 / 98.32 / 98.37%**.

After the supplied-file merge, actual-file diagnostics reproduced both failures
and measured the tight bounds above without modifying source or adding code.
Final post-merge focused/docs checks passed **37/37**. Both aggregate commands
against supplied-fixture commit `8324120` again reported **ALL LANES PASSED**:
`verify:fast` ran **3,066 / 292** (coverage lane 83.6 s); `verify` ran
**3,066 / 292** (87.2 s) plus native/performance **30 / 5** (3.3 s). Types,
lint, changed quality, build and whitespace passed; coverage remained unchanged.
Source hashes were rechecked and still match. Logs: `post-merge-focused.log`,
`post-merge-verify-fast.log`, `post-merge-verify-full.log` under the directory below.
These checks establish research/current-baseline behavior, **not successful
execution of a future fix**.

Logs: `/home/user/viewport-research/` (not committed build/log artifacts). Current
contract entry: [automatic repairs](../../current/sor/upload-auto-repair.md).

**Next action:** implement the focused tight-bounds repair only after approval to
write code. Original files are present; the root cause is reproduced; the proposed
fix is general and does not require changing their authored paths or viewport.
