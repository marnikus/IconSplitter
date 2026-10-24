# Automatic repair of Upload artboard fitting and source-viewport overflow

## Request and acceptance

Two reported SVGs fail Upload preset preview/export:

1. `the artwork did not settle in its artboard after 4 passes`.
2. Bulb: `source paint extends outside its viewBox/viewport; a shadow cannot preserve the original clipping`.

Detect and repair supported cases automatically on the export copy, without a
user repair dialog or manual SVG editing. The preview and exported SVG/JPEG/EPS
must agree. Preserve original source bytes, vector-only EPS artwork, intentional
visibility/clipping, proportions, configured stroke width, shadow, artboard and
metadata. Do not turn a failed validation into a false successful export.

## Investigation before implementation

- `src/lib/upload/place.ts`: clone → bake → restyle → optional stroke expansion
  → exact shipped-bounds measurement. Content/pinned/megapixel fits estimate
  scale-dependent painted edges from samples, with a strict 0.002 px tolerance
  and four-pass bound. Investigate quantization, unstable limiting edges,
  near-identical sample scales and stroke/curve expansion before selecting a
  bounded deterministic repair; simply suppressing the error is not acceptable.
- `src/lib/upload/prepare.ts`: the shadow overflow refusal protects the source
  viewport's implicit clipping. Removing it or blindly expanding the viewport
  can expose intentionally hidden paint. Determine whether the supplied bulb
  needs viewport normalization, painted-geometry repair or preserved vector
  clipping; verify the chosen representation through baking and EPS export.
- Existing tests explicitly protect clipped outliers and hidden/invisible
  shapes (`upload_shadow_geometry.test.ts`) and validate exact stroke widths,
  pinned artboards, MP area and finite placement passes (`upload_prepare.test.ts`).
  Preserve these assertions or replace a refusal expectation with stronger
  source-appearance-preservation assertions when repair becomes supported.
- Existing source fixtures contain a handshake SVG, not the two reported SVGs.
  A fetch of the active remote branch found no additional commits/files.
  Current upload directory contains only the earlier screenshot, no SVGs.
  Exact regression fixtures and failing preset settings are required to examine
  the user's two files rather than claim a synthetic reproduction is theirs.

## Implementation steps / TDD

1. Obtain both original SVGs and failing preset settings (preset name, artboard,
   stroke/expansion, padding and shadow values, or settings export/screenshot).
   Add immutable, clearly named regression fixtures under tests/assets following
   the repository's existing asset conventions; retain their original bytes.
2. Reproduce both messages through the real prepare/export path; witness RED
   tests before production changes. Inspect intermediate placement measurements
   and source viewport/paint bounds; record the concrete causes here.
3. Implement narrowly scoped automatic fitting/viewport repairs using shared
   geometry rules. Keep unsupported/unrepresentable content fail-closed. Keep
   work bounded and deterministic; no provider calls, raster fallback or source
   file overwrite. Account honestly for repair/placement in existing reports.
4. GREEN tests for both supplied files and failing presets, original-source
   immutability, repeated deterministic preparation, all paint inside the final
   artboard, source visibility preservation and valid vector SVG/EPS output.
   Cover strokes/caps/joins, expansion on/off, non-origin frames, hidden outliers,
   content/pinned/MP targets and shadows; preserve existing metadata/export gates.
5. Update owning geometry/exports/invariants, owner/test inventory and doc route.
   Run focused tests, types, lint, changed quality against e6e3988, verify:fast,
   full verify including unchanged native performance/coverage thresholds.
6. Append measured results to the ledger without reading it. Commit scoped
   code/tests/docs with Verified and attribution; push only the current branch.
   Exclude generated builds, dependency outputs and scratch evidence.

## Status

User supplied both fixtures in remote commit e6e3988 after the initial request
for files; integrated by fast-forward without discarding work. The fixtures are
`icon-lightbulb-idea_AI_5_02.svg` and `_5_03.svg` in
`tests/assets/bug with SVG export expl temp/`; originals remain byte-identical.

Both have a ray starting at y=0 with a 1px round stroke, painting to y=-0.5.
A shadow exposed the safety veto. Repair is limited to stroke-only overshoot
within 2% of the viewport's smaller dimension, with every visible geometric
centreline/fill in-frame. Genuine clipped geometry and large stroke overshoots
still refuse; no blanket disabling of the guard.

Reproduced the four-pass error on both exact fixtures with a 64px pinned board,
50px verbatim stroke and zero padding: the stroke outline's limiting edges
switch with scale, invalidating the affine edge model. The existing fast path
is retained. On failure, a bounded 32-probe measured search plus final centred
probe finds a verified fit, preserving pinned dimensions, padding and verbatim
strokes. A 0.008px size guard absorbs coordinate rounding; final painted bounds
are verified at existing precision. Max total 37 measured passes. Impossible
stroke/board combinations and unsupported geometry still fail honestly.

Witnessed 8 viewport RED tests / 10 GREEN, then the stroke/target matrix reproduced
two four-pass failures before changes (9 RED / 10 GREEN overall). Implementation
now passes focused regressions; final full-gate measurements follow below.

## Final verification — 2026-10-24

- 96 added tests: 88 exact-fixture/preset/matrix/determinism checks, 5 bounded
  viewport repair checks and 3 fallback/refusal tests. Genuine EPS writing and
  verification include both difficult wide-stroke/source-frame-shadow cases.
- Final `verify:fast` and full `verify`: ALL LANES PASSED; full suite 2715 tests
  in 253 files, plus native performance 30 tests in 5 files. No gate, budget,
  isolation, harness, coverage scope or existing assertion weakened.
- `npx tsc --noEmit`, lint (0 errors, 23 existing warnings), changed quality vs
  e6e3988 and docs navigation PASS. Initial prepare-function CC11 and a 9117-byte
  geometry page were corrected by cohesive extraction/document consolidation,
  not threshold changes. Final full test/coverage lane took 75.2 seconds.
- Full src/lib coverage: 95.01% statements / 89.31% branches / 98.03% functions /
  98.05% lines; new fallback 100% lines and 86.36% branches.
- Self-contained production build 1791.86 kB. No provider requests. Fixture
  originals unchanged. Generated build, dependency and coverage outputs excluded
  from the scoped change. Current repair contract, geometry, invariants, owner,
  tests and router updated; measured ledger entry appended without reading it.
