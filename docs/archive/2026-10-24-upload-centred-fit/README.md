# Automatic repair of centred SVG fit failures

## Request

Repair `export preview unavailable — the measured artwork cannot fit the requested
artboard with these strokes` automatically. Understand the cause, document steps
before implementation, preserve source/strokes/proportions and vector export.

## Initial diagnosis

The exact message is emitted by `src/lib/upload/placefallback.ts`, after the
32-probe pinned-artboard fallback finds a fitting origin-based candidate but
rebuilds it at the final centred translation and rejects that new measurement.
A valid intermediate fit is therefore not proof that the serialized, centred
artwork fits. Geometry is baked to 3 decimals; translation can change rounding
of short stroked segments, their tangent directions and painted extrema.
This is a hypothesis to test, not a claim that the user's current file is known.
No new fixture or settings have yet been supplied; remote fetch found no new
commits. Existing exact bulb assets and repository SVG export fixtures are
available for reproduction.

## Plan and steps (before production changes)

1. Reproduce the exact final-containment message through real prepare/export
   code. Exercise the existing fixtures across stroke widths, artboard dimensions,
   padding, source-frame/shadow and expansion settings; retain a deterministic,
   minimal failing case. Record RED evidence before editing production code.
2. Trace measured origin and centred geometry to confirm the cause. Distinguish
   rounding/placement instability from genuinely impossible strokes/padding.
3. Repair placement automatically with bounded actual-geometry verification.
   Prefer preserving the already-measured geometry rather than repeatedly
   changing its rounded tangents. Keep exact target dimensions, configured
   strokes, proportions, padding, clipping/visibility and truthful pass counts.
   Never disable the final containment check, stretch/rasterize artwork, or
   silently reduce strokes/enlarge a pinned artboard.
4. Verify regression success, source immutability, determinism, final painted
   containment and vector EPS; retain honest failures for impossible requests.
   Exercise shadows/phantom source frames and normal fast-path behavior.
5. Update current geometry/repair ownership/tests contracts. Run focused tests,
   types, lint, changed quality, verify:fast and full verify with unchanged gates.
   Append measured ledger entry without reading it; commit scoped code/tests/docs
   with Verified and attribution, then push the current branch.

## Status

Reproduced the exact message on the original supplied leaf
`icon-lightbulb-idea_AI_5_03.svg`: 64×64 board, 50px stroke, 8% padding. The
initial real-prepare diagnostic was RED before production changes. Trace evidence
confirmed the centring-rounding hypothesis: the origin candidate's painted bounds
were 50.006×51.971, while rebuilding at offsets (31.997, 32.9795) changed them to
54.883×54.883 and violated the required 5.12px padding. This is not evidence that
this stroke/artboard request is intrinsically impossible.

The final translation now uses the shared `geom.fmt` 0.001px coordinate grid.
Translation changes by at most 0.0005px/axis, preventing the half-grid phase change
without lowering strokes, altering the requested dimensions or widening tolerance.
The existing final actual-geometry re-probe, containment guard, 32-search/37-total
pass bound and normal four-pass fast path are unchanged. The exact failing leaf
now prepares and exports through real vector EPS, expanded and unexpanded.

Added 20 independent tests rather than retaining the diagnostic's long matrix
loop. Focused 255 tests / 8 files PASS: both bulbs across widths/padding and a
rectangular target, centring/padding/offset precision, expansion, shadow, real EPS,
source immutability, deterministic optimization+cleaning and impossible-fit refusal.
No console tracing remains. New EPS exploratory tests also found the existing
gear/circle fixture can shrink its circle below representable radius at 50px /
64px / 8%; that separate zero-radius EPS limitation predates this fix. EPS tests
use 40px on that fixture to retain its circle, while preserving the exact failing
leaf's 50px setting. No existing test or subset guard was relaxed.

Full verification and delivery results follow below.

## Final verification — 2026-10-24

- Types, lint (0 errors / 23 existing warnings), changed quality vs e8aecf1 and
  docs navigation PASS. `verify:fast` and full `verify`: ALL LANES PASSED.
- Full coverage suite: 2753 tests / 256 files. Native performance: 30 tests /
  5 files PASS, unchanged budgets/algorithms/isolation/harness and coverage scope.
- Full src/lib coverage: 95.25% statements / 89.62% branches / 98.14% functions /
  98.25% lines. Fallback: 100% lines / 86.36% branches. Coverage lane 88.3 seconds.
- Self-contained production HTML 1793.22 kB. Source fixtures unchanged; no live
  providers. Scoped delivery excludes build/dependencies/coverage and scratch
  diagnostic logs. Current repair contract and owner/test inventory updated;
  existing router links still target that contract. Measured ledger entry
  appended without reading the ledger. No guard, threshold or assertion relaxed.
