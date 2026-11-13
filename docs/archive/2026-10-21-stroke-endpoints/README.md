# SVG/EPS stroke endpoints — plan (2026-10-21)

## Problem and scope

SVG root/group caps are inherited correctly by the geometry pipeline, but
`epspaint.strokeOf` substitutes butt caps and miter joins for inherited EPS
paint. Child shapes therefore lose rounded (or square) endpoints when the
native EPS writer resolves their paint. Local caps can mask this bug.

Default exports must preserve source caps and joins. Add Export settings
**Stroke endpoints**: **Keep source** (default), **Cut (butt)**, **Rounded**.
The override affects all visible strokes, including size-guide copies and
badge handles, consistently in the live preview, SVG, JPEG and EPS. It must
run before bounds measurement and stroke expansion; source files stay intact.
Square remains supported in Keep source mode. Do not change joins via this
new control, gradients, vector-only audits, or decoration selection semantics.

## Implementation steps

1. Write failing regression tests for root/group/style cap and join
   inheritance, local overrides, and square caps in real native EPS output.
2. Add validated `strokeLinecap: source | butt | round` defaults/row pins,
   persistence, equality/undo and output fingerprint handling. Old saved
   settings load as source. All default resets it to source and byte-for-byte
   as-is export is permitted only in source mode.
3. Apply the override through stroke restyling before expansion/measurement;
   preserve it in size-guide copies and apply it to badge handles before
   badge expansion/fitting. Add the shared settings control to both scopes.
4. Fix the EPS inherited cap/join bridge and bump native writer identity so
   existing cached EPS gets regenerated. Keep strict vector-only checks.
5. Test settings validation/lifecycle, both UI scopes, live preview, source
   fidelity, all-stroke overrides, expansion and artboard bounds. Run focused
   suites, types/lint/quality, fast verification and full verification.
6. Update current owner/selector docs, append measured quality results,
   commit scoped changes (never generated dist) and push the session branch.

## Acceptance and limitations

Inspect the actual `setlinecap`/`setlinejoin` operators and run strict EPS
audit, not only UI state. Source mode must leave mixed caps intact; forced
modes must replace inherited and local inline caps. Filled shapes are not
restroked. Test expansion and decorated exports. The user's earlier two SVG
fixtures are still absent; do not claim fixture-specific acceptance.

## Results

Implemented all steps. The shared select is available in global and icon
Export settings; default is Keep source. Native EPS inherits both caps and
joins faithfully, including square source caps. Forced caps reach badge
handles and size-guide copies before their expansion/fitting. Native writer
identity is `builtin-vector-4`, so old EPS cannot be reused as current.

The new row undo/redo test also exposed an existing `overrideactions.ts` bug:
its history `after` payload was always null. It now records the actual row
settings; endpoint selects are discrete undo gestures. Global defaults retain
the existing persisted-but-not-undoable behavior and never create row pins.

### Measured verification

- TDD witness: new focused domain regression suite initially **17 failed /
  1 passed** before implementation. Final focused domain/settings/preview/
  package/converter/documentation suites: **133 passed**.
- `npm run verify:fast`: **all five lanes passed**; **2419 tests / 225 files**.
- First `npm run verify`: types, lint, quality, coverage and build passed;
  unrelated native image-detection timing test took **260.03 ms** against its
  unchanged 200 ms budget. Standalone rerun: **4/4 passed**.
- Complete second `npm run verify`: **ALL SIX LANES PASSED** — types 14.4 s,
  lint 10.7 s, changed quality 0.7 s, native performance 2.6 s,
  coverage 166.5 s, build 6.8 s. **2419/2419 tests**, **225/225 files**;
  library line coverage **97.81%**. `strokecaps.ts`, `restyle.ts` and
  `settings.ts` each have **100% statements/branches/functions/lines**.
- Independent, disposable check: production EPS writer emitted inherited
  butt/round/square source cases. Each passed strict vector audit and
  Ghostscript 9.56 with `image`, `colorimage` and `imagemask` execution traps
  (exit 0). At 400×400, five endpoint/interior probes per case matched resvg;
  the probes distinguish flat ends, round ends and square corners.
  Comparison rasters are test-only, not part of EPS or app dependencies.
- No separately installed converter is required; the app dependency set and
  strict no-raster delivery gates are unchanged.
- The two earlier user-provided SVG fixtures remain absent. Synthetic and
  package-level regressions passed; fixture-specific acceptance is not claimed.
