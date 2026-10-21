# Native vector EPS — implementation verification

Date: 2026-10-21. Implementation follows `implementation.md`; original research
and rejected converter experiments are in `research.md`.

## Delivered behavior

- Browser-native Level 3 axial/radial gradient fills, vector clipping (including
  even-odd), solid strokes retained across gradient fills, local gradient
  references, coordinate systems and transforms.
- Template shadow converted to vector shading, including varying alpha. Color
  and opacity are composed before constructing bounded-error vector functions.
- Conservative uniform-backdrop analysis: unsafe transparent overlap is refused,
  not flattened to pixels or silently recolored.
- No production converter dependency, external application or helper added.
- Every converter's final EPS is subject to the restricted vector grammar;
  generic unverified external PostScript cannot bypass it. Validated canonical
  XMP is the only admitted executable metadata envelope.
- Image operators, image-bearing programs, bitmap previews, opaque data blocks
  and unknown code fail verification. This is not a keyword-only raster scan.
- Final metadata-bearing bytes, temporary readback and actual saved bytes are
  checked. Cached EPS is re-audited; Download all rejects a corrupted/raster EPS.
  A deliberate post-temporary-write corruption test fails commit and removes
  the invalid final EPS instead of publishing a successful record.
- Writer identity is `builtin-vector-3`; EPS-only refresh remains selective.
  Old blanket "cannot draw gradient shadows / choose Inkscape" messages are
  replaced by truthful vector-only capability notes.

Support limits, owner modules and tests are documented in
`docs/current/sor/upload-eps-gradients.md`. In particular, this implementation
does not claim universal SVG transparency, filters, masks or gradient-stroke
conversion. Unsupported inputs fail without a raster fallback.

## TDD and automated verification

Initial new production-writer suite: **5 failed / 7 passed** before implementation.
The failures included missing axial/radial shading, the real template shadow,
backdrop handling and final EPS verification.

Final focused suites:

`npx vitest run tests/upload_epsgradient.test.ts tests/upload_epsvectorcheck.test.ts tests/upload_runexport.test.ts`

**85/85 passed.** These include actual package exports using real preparation,
optimization, EPS writing, XMP insertion, filesystem commit and saved-file
readback over binary-safe filesystem fakes. The JPEG transport is faked; EPS
logic, vector audit, metadata and delivery logic are not mocked.

Additional UI/documentation checks passed, including vector capability notes,
converter selection, Download all, valid EPS package fixtures and doc routes.

`npm run verify:fast`: **ALL FIVE LANES PASSED**:

- Types: passed.
- Lint: passed, 0 errors / 23 existing warnings.
- Changed-code quality: passed.
- Tests + coverage: **2396/2396 tests**, 224 files passed.
- Build: passed.

Overall `src/lib` line coverage: **97.80%**. New gradient, coordinate, function,
scene, shading-data and transform modules have 100% function coverage; the
extended EPS stack checker also has 100% function coverage in the final run.

`npm run verify` was also executed twice. In both runs types, lint, quality,
tests/coverage and build passed, but the separate uninstrumented native lane
failed the existing `algo_efficiency` synthetic 1000px grid `<200ms` wall-clock
budget. Its standalone rerun passed **4/4**, including that case at **180ms**.
No algorithm or performance threshold was changed for this EPS task. The full
aggregate gate is **not green**, so these results do not authorize a push under
the repository's full-gate policy.

## Independent interpreter and visual cross-check

Disposable tools only, installed outside the repository: Ghostscript WASM
`@jspawn/ghostscript-wasm@0.0.2` (Ghostscript 9.56.0), resvg 2.6.2 and pngjs 7.
None is an application dependency or a prerequisite for the user.

The real production `writeEps` and metadata emitter generated two EPS samples:

| Sample | Final EPS size | Strict final-byte vector audit | Independent interpreter with raster tripwires |
|---|---:|---|---|
| Original app shadow template | 4094 bytes | Passed | Exit 0, no raster painting detected |
| Axial red-to-blue gradient with varying opacity | 6320 bytes | Passed | Exit 0, no raster painting detected |

The tripwires intercept `image`, `colorimage` and `imagemask`; their negative
controls in the research experiments correctly detected actual raster-producing
converter output. They corroborate the native output audit; they are not claimed
as a universal analyzer for arbitrary hostile PostScript.

For visual measurement only, the EPS samples were rendered at 384 DPI and the
SVG references rendered independently with resvg against white. Comparison
excluded a three-pixel outer border:

| Sample | Comparison size | Maximum interior channel difference | Mean absolute channel difference |
|---|---|---:|---:|
| Shadow | 816 × 96 | 2 / 255 | 0.7085 / 255 |
| Axial | 400 × 400 | 2 / 255 | 0.5711 / 255 |

These temporary PNGs are **test measurements only**. No image payload or bitmap
is embedded in either EPS artwork file. The strict source/output grammar and
independent execution checks are separate from visual similarity checks.

## Unavailable supplied inputs

The user's two files at `tests/assets/svg to EPS` were still absent from the
checkout. Their exact content and exported EPS files have **not** been tested.
The tests above use the real application shadow and explicit gradient inputs;
they are not substitutes claimed to be those missing files.

Target-editor/stock-site compatibility with Level 3 native shading still needs
verification in the actual target application. A PostScript shading is vector
content, but editor-specific editability is a separate acceptance question.
