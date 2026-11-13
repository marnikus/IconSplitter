# Selection response measurements

Chromium **153.0.8010.0**, Linux sandbox, 1440×1000, no CPU throttling. Browser tooling outside repository: Playwright Core **1.64.1**, portable Chromium package **153.0.0**. Baseline production source **0755387**; identical fixture/runner, SVG content, warmup and sample count before/after. Fresh browser per tab/size avoids cross-case heap accumulation. No other benchmarks/tests ran concurrently.

**Primary:** button event → committed DOM, including all layout-effect checkbox/class projections. **Frame proxy:** event → second requestAnimationFrame; includes frame scheduling and is not a compositor/presentation trace. Medians average both middle samples of 14 alternating select/deselect measurements after one warmup cycle. Original runner used the upper-middle sample; all tables/archived JSON consistently recompute the standard median from raw samples.

Scope: actual list components and real thumbnail/SVG/export-preview/format code; local native File/Blob fixture, no provider or network generations. Every sample asserts all 100/1000 native checkbox properties are correct. Scan, mount, initial reads/decoding and 2.5s settling are outside the timed interaction. The fixture does not model full-panel/history persistence overhead or all artwork complexities; results are not universal hardware guarantees.

## Production

| Tab | Rows | Commit before → after (ms) | Reduction | Frame proxy before → after (ms) | Reduction |
|---|---:|---:|---:|---:|---:|
| batch | 100 | 11.45 → 1.05 | 90.83% | 36.30 → 22.25 | 38.71% |
| selectionV2 | 100 | 6.95 → 0.60 | 91.37% | 45.25 → 24.30 | 46.30% |
| generateSvg | 100 | 68.90 → 0.95 | 98.62% | 107.95 → 21.45 | 80.13% |
| upload | 100 | 11.95 → 0.80 | 93.31% | 46.35 → 20.65 | 55.45% |
| batch | 1000 | 99.95 → 5.50 | 94.50% | 226.30 → 44.25 | 80.45% |
| selectionV2 | 1000 | 75.30 → 3.30 | 95.62% | 292.55 → 34.40 | 88.24% |
| generateSvg | 1000 | 402.90 → 3.75 | 99.07% | 551.35 → 36.50 | 93.38% |
| upload | 1000 | 90.15 → 3.75 | 95.84% | 319.10 → 25.10 | 92.13% |

## Development

| Tab | Rows | Commit before → after (ms) | Reduction | Frame proxy before → after (ms) | Reduction |
|---|---:|---:|---:|---:|---:|
| batch | 100 | 58.20 → 4.40 | 92.44% | 125.20 → 19.35 | 84.54% |
| selectionV2 | 100 | 37.50 → 2.80 | 92.53% | 82.75 → 24.35 | 70.57% |
| generateSvg | 100 | 128.50 → 3.10 | 97.59% | 179.80 → 21.45 | 88.07% |
| upload | 100 | 36.65 → 3.20 | 91.27% | 80.20 → 23.50 | 70.70% |
| batch | 1000 | 409.75 → 21.00 | 94.87% | 1675.70 → 57.75 | 96.55% |
| selectionV2 | 1000 | 424.00 → 16.90 | 96.01% | 1004.70 → 45.05 | 95.52% |
| generateSvg | 1000 | 807.25 → 17.95 | 97.78% | 1819.90 → 46.45 | 97.45% |
| upload | 1000 | 364.60 → 17.50 | 95.20% | 1524.15 → 37.25 | 97.56% |

## Interpretation

The **80% primary DOM-response target is met for every measured tab at both sizes**. At 1000 rows the secondary frame proxy also improves by at least 80% for all tabs, in both builds. Small-list frame percentage gains are lower in several cases because frame scheduling is now the floor; do not claim 80% next-frame gains for every 100-row case.

Memoization alone was insufficient: production 1000-row Batch/V2/Upload commit reductions were approximately 75–77%; Batch/V2 frame timings did not improve reliably. The final design adds one committed-snapshot DOM projection pass and removes per-row background animations. Both intermediate runs are retained in `measurements.json`, not hidden or substituted. The first nonisolated browser run ended when the shared browser closed during the 1000-SVG case; it is not the comparison baseline. Missing Linux browser libraries were supplied from the portable package outside the repository.

## Reproduce

1. `npm run setup` if needed. Install browser-only tools outside the repository: `npm install --prefix /absolute/external/browser --no-save --ignore-scripts playwright-core@1.64.1 @sparticuz/chromium@153.0.0`.
2. Set `SELECTION_BROWSER_TOOLS=/absolute/external/browser`. On minimal Linux, extract the package’s `bin/al2023.tar.br` with Node `zlib.brotliDecompressSync`, untar externally, and prepend its `lib` folder to `LD_LIBRARY_PATH` if NSS/NSPR libraries are absent. No browser/project dependency or lockfile changes.
3. Development: `npm run dev -- --host 0.0.0.0 --port 5174`, then `node tools/selection-response-bench.mjs http://127.0.0.1:5174 /absolute/output.json`. To reproduce the old source without changing branches, use the production baseline loader below or a separate external source copy; never overwrite active working files.
4. Production before: `SELECTION_BENCH_REF=0755387 SELECTION_BENCH_OUT=/absolute/external/production/before npx vite build --config tools/perf/vite.selection.config.ts`. After: omit `SELECTION_BENCH_REF`, set a distinct external output directory, rerun. The pre-loader reads original `src/` files directly from git; fixture/compiler/browser remain identical.
5. Serve the external production parent directory on a local port (e.g. `python3 -m http.server 5175 --bind 0.0.0.0 --directory /absolute/external/production`), then run the same browser runner against `http://127.0.0.1:5175/before` and `/after`. Keep raw JSON; compare medians using `(1 - after / before) × 100`. Do not compare different build modes, CPU loads, browsers or workloads.

The localhost addresses above are runner-to-server inside the sandbox only. App/browser-facing code does not call another service on localhost. Benchmark HTML is development-only, absent from the application production entry/build.
