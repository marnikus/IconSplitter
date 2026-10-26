# Automatic flag viewport bounds correction — implementation

Date: 2026-10-26. Baseline: 5d1fcd6. Implementation authorized by the user.
Research: ../2026-10-26-shadow-viewport-repair-plan/README.md.

## Plan before production changes

1. Add failing actual-file preparation, live Upload preview and full package
   regressions for both supplied flags, preserving original hashes and genuine
   clipping refusals. Add pure tight-curve/extrema tests and measurement cases.
2. Implement bounded analytic extrema of the existing normalized outline curves
   in comparison coordinates. Keep conservative placement/EPS bounds unchanged.
   Validate non-finite data; distinguish unsupported, empty and measurable geometry.
3. Add shared source-viewport measurement: one detached bake/expand probe, cheap
   conservative-containment fast path, tight geometry/paint only for ambiguous
   overflow. Unsupported outline fallback may not authorize frame enlargement.
   Share the same measured paint between minor repair and final overflow veto.
4. Preserve source bytes/DOM, original frame for contained flags, 2% minor-stroke
   policy, 0.002 precision, pen/visibility/compositing semantics and all old
   unsupported-content guards. No source rewriting, tolerance widening, raster
   workaround, filename special cases or new geometry dependencies.
5. Verify actual source/factory shadow settings, artboard/width/expansion matrix,
   live preview and SVG/JPEG/EPS package pipeline. Document raster test boundaries
   honestly. Update canonical contracts, run unchanged full gates, append ledger
   without reading it, commit/push this branch.

## Evidence and outcome

Implemented in `geom/curvebounds.ts`, `geom/tightbounds.ts` and
`viewportbounds.ts`; `viewrepair.ts` and `prepare.ts` share the measurement.
Placement/fit and EPS retain their conservative bounds. The source SVG is never
mutated. One detached outline probe replaces the previous duplicated source-frame
probes. Conservative-contained unsupported stroke paints retain compatibility;
unresolved ambiguous outline overflow cannot authorize enlargement.

### Red → green

Before production changes, `upload_flag_viewport.test.ts`: **10 failures / 2
passes**, all 10 failures the reproduced original-clipping warning. After the
implementation: **12/12 pass**. Cases cover both exact originals with source and
factory settings, pinned and rectangular boards, explicit widths, expansion and
MP scaling, repeated preparation, SVG optimization/cleaning and genuine vector
EPS. Separate math/safety tests, actual Upload opt-in row previews and committed
SVG/JPEG/EPS package regressions also pass. The preview test deliberately toggles
per-icon Shadow: defaults alone must not opt unchecked icons into decorations.

Both measurements select `outlined-tight`, with no unsupported content. Paint
minimum Y is **7.560711 / 8.191972** (asserted within 0.00001). Original frames
remain **224×224 / 240×240**. Original SHA-256 values before/after:

- Flag3: `078e104b46057df33912ab4fbf65c8698fb8d2bc77fe075b20407326c8bb8785`
- Flag5: `fdf3f958c67da4875f53e9305230a072fbfa45329a9ee4b6bf7941ef5ffec4e9`

Safety coverage includes actual curve geometry exiting between contained
endpoints, very wide strokes, unknown stroke paint with ambiguous overflow,
hidden/opacity/inherited visibility, non-finite and empty bounds, affine controls,
and eligible curved minor-stroke repair. The 2% limit and 0.002 tolerance are
unchanged. No filename special cases, source-path/control edits, dependencies,
clipping engine, raster fallback or provider requests.

### Verification (2026-10-26)

- Focused preparation/math/repair/preview/package/stroke suites: **134 tests / 7
  files passed**; documentation routes/budgets: **4/4 passed**.
- `npx tsc --noEmit`: pass. `npm run lint`: pass (0 errors, 20 existing warnings;
  no warnings in the new modules). Explicit-base changed quality gate: pass,
  all 7 production files within frozen limits. `git diff --check`: pass.
- `npm run verify:fast`: **all lanes passed**, 3,094 tests / 294 files; production
  build passed. `npm run verify`: **all lanes passed**, same complete coverage
  suite plus **30 native/performance tests / 5 files** and production build.
- Overall statements/branches/functions/lines: **95.57 / 90.30 / 98.33 / 98.39%**,
  above the previous 95.54 / 90.23 / 98.32 / 98.37%. All new production functions
  covered; curve extrema module **100% across all four metrics**.
- Logs: `/home/user/flag-{red,focused,docs,lint,quality,verify-fast,verify-full}.log`.

JPEG uses injected render/encode transport with real preparation, metadata,
validation and commit paths; exact requested raster SVG is asserted. HappyDOM
row tests exercise real UI and shared preparation. These prove pipeline behavior,
not browser pixel fidelity, EPS application appearance or stock-provider ingestion.

