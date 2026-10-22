# Custom badge template — measured verification

Date: 2026-10-22. Implements the sibling pre-code README plan.

## Delivered

- Editor in global/icon Export settings: SVG code, validated isolated-image preview, Apply/Cancel/Restore default, Escape/backdrop cancellation, focus trap and inert parent.
- Validated `badgeTemplateSvg` defaults/applied/local pins with persistence, inherited reset, per-icon single-gesture undo/redo and enabled-only actual-template fingerprint. Editing does not toggle any badge or select icons.
- Shared actual preparation: non-412×20 geometry and nonzero viewBox origins, preserved aspect/relative strokes/paints, collision-free references, caps/expansion, native vector gradients and final bounds proof. Bundled renderer retained.
- Inert parsing/allowlist and honest refusals, size/depth/node limits, no network/provider calls or raw markup insertion. Simple CSS keeps class specificity, source order and inline precedence using the existing paint grammar.

## TDD / corrections

- Initial focused RED: missing template validator module; editor RED: five missing-trigger failures. Subsequent GREEN focused unit/UI/geometry/persistence tests.
- Added inline/stylesheet precedence and mixed-selector specificity RED tests, then implemented correct template-only folding; existing export clean behavior is unchanged.
- First fast gate: 2542 passed, one legacy defaults-shape assertion failed because it lacked the new empty template field. Updated the asserted documented shape, then reran BOTH complete gates sequentially.
- Restored workspace index was aligned to fetched 27b87fd without altering source files. `npm run setup` repaired foreign-platform dependencies; its line-ending-only tracked dependency changes were excluded/restored.

## Final measured gates

| Gate | Result |
|---|---|
| Final focused settings/template/editor/user-fixture-export/live-preview/docs run | 6 files, 94 tests PASS |
| Changed production quality, explicit base HEAD | 15 files PASS, no baseline/threshold changes |
| Scoped ESLint | PASS, no new warnings |
| `npm run verify:fast -- --base HEAD` | all 5 lanes PASS |
| `npm run verify -- --base HEAD` | all 6 lanes PASS |
| Full suite in both coverage runs | 237 files / 2544 tests PASS |
| Native uninstrumented perf lane | 5 files / 30 tests PASS, 2.9 s |
| src/lib coverage | lines 98.03%, statements 94.98%, functions 98.02%, branches 89.35% |
| Each new lib module | 100% line and function coverage |
| Single-file build | PASS, 1737.56 kB (513.08 kB gzip) |

Full lane times: types 14.1 s; lint 12.2 s; changed quality 0.7 s; native perf
2.9 s; tests+coverage 205.0 s; build 7.6 s. Fast coverage took 203.1 s.

`upload_badge_template_export.test.ts` uses the actual supplied
`tests/assets/SVG to JPEG or EPS export tests/icon-handshake-heart_7_03_v2.svg`
through the real export pipeline, optimization on/off, and preserves that source
and the supplied `icon-handshake-heart_7_01_v2.eps`. Asserts exact prepared artwork
reaches the JPEG raster API, committed clean SVG contains the replacement,
native EPS contains vector shadings and passes the final no-raster program gate,
and committed JPEG metadata/dimensions verify. Canvas encode/decode APIs are
simulated in unit tests; this is NOT an independent browser-pixel or external
EPS-interpreter acceptance claim. No live Adobe/Windows importer run was made.

No original fixtures, generated dist, dependencies or temporary outputs belong
in this feature commit. No canceled Windows metadata work was restored.
