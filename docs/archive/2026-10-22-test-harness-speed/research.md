# Research and controlled probes

Date: 2026-10-22. Before changing the shipped harness. Machine: Linux x86_64,
2 available vCPUs (Xeon 2.60 GHz), 3.85 GiB RAM, Node v22.22.3, npm 10.9.8,
Vitest 5.0.3. Source ecc5ffa, 237 files / 2544 tests.

## Authoritative sources

Upstream documentation was retrieved through GitHub API at main revision
7a5c083fc9ee460c5d724b062086f1ec62132ca9 (2026-10-22):

- https://github.com/vitest-dev/vitest/blob/7a5c083fc9ee460c5d724b062086f1ec62132ca9/docs/guide/improving-performance.md
  — profile phases before choosing an optimization; VM pools keep isolated
  contexts while sharing imported dependencies; do not infer wall time from
  aggregate parallel phase percentages. No-isolation is faster but not an
  acceptable substitute for this repository's isolation guarantees.
- https://github.com/vitest-dev/vitest/blob/7a5c083fc9ee460c5d724b062086f1ec62132ca9/docs/guide/coverage.md
  — V8 collects runtime coverage for all loaded modules and cannot restrict
  collection to src/lib; it can be slower than Istanbul on large module graphs.
  Istanbul instruments the selected sources. Both are official providers with
  equivalent AST remapping since Vitest 3.2.
- https://github.com/vitest-dev/vitest/blob/7a5c083fc9ee460c5d724b062086f1ec62132ca9/docs/config/pool.md
  — vmThreads have realm/memory/recycling costs; vmForks can avoid expensive
  worker teardown but retain realm caveats. Native Buffer/performance tests
  must remain in a real realm.
- https://github.com/vitest-dev/vitest/blob/7a5c083fc9ee460c5d724b062086f1ec62132ca9/docs/config/maxworkers.md
  — explicit worker limits are supported. Installed 5.0.3 implementation in
  `dist/chunks/index.DpLw24bj.js` actually defaults to available CPUs minus one:
  this 2-CPU machine runs the main suite on ONE worker. Do not assume the docs'
  current default matches an installed release.
- Installed @vitest/coverage-v8 runtime starts/stops inspector precise coverage
  per isolated file and filters node_modules only after collection. Thus React,
  happy-dom and test setup still incur runtime profiler cost even though the
  final report includes only src/lib.

## Measurements (sequential, no competing test process)

| Configuration | Wall seconds | Outcome |
|---|---:|---|
| Existing full verify | 242.80 | Types 14.2, lint 12.8, quality 0.6, native 3.0, coverage 204.6, build 7.4; coverage all 2544 PASS, native 2 strict timing failures |
| Existing suite without coverage | 76.11 | All 237 / 2544 PASS; 56.8 s summed file execution; existing main project effectively one worker |
| Native project, explicit one worker | ~4 | All 5 / 30 PASS with unchanged 400/200 ms algorithm limits |
| CLI vmForks + V8, all files | 224.25 | Rejected: slower and seven cross-realm/native failures; forcing one pool onto native is invalid |
| VM threads + Istanbul, default one main worker | 96.49 | 2543 PASS, one existing Upload mount readiness race (row-count container exists before async scan completes); no coverage generated on failure |
| VM threads + Istanbul, explicit two workers | 56.93 | All 237 / 2544 PASS; coverage generated, identical source set/lines/functions/statements |

The successful official-Istanbul/two-worker probe reduces the 204.6-second
coverage stage by 72.2%. Adding the unchanged static/build stages predicts ~95 s
full verification, just inside the 97.12 s end-to-end target; bootstrap and
supported incremental static caches should add margin. This prediction is NOT
final acceptance: measure the integrated workflow, including cold caches.

## Coverage equivalence

Compared both JSON summaries: exactly the same 167 production source files,
5746 total / 5633 covered lines (98.03%), 1820 / 1784 functions (98.02%),
7861 / 7467 statements (94.98%). No per-file differences for these metrics.
Branch denominators also match (5486); Istanbul reports four fewer covered
branches across selectshortcuts, svgregen, upload/cleandom and upload/xmp:
4898 / 5486 (89.28%) vs V8 4902 / 5486 (89.35%). Record this provider distinction;
do not hide it with lower thresholds or narrower coverage. Keep V8 available
for audits. Add coverage canaries that prove real uncovered functions/branches
and threshold failures under the selected provider.

## Rejected shortcuts / remaining risks

- Do not disable file isolation, run only changed tests, omit source coverage,
  reduce native budgets, skip test files, silence failures or cache test results.
- More workers are not automatically better: native maxWorkers=4 oversubscribes
  two CPUs and makes timing budgets flaky. Native must run serially and idle.
- A row-count element's presence is not scan completion; wait for the actual
  completed-scan UI signal rather than add a sleep or weaken row assertions.
- Warm transform caches were available in provider probes; measure cold behavior
  separately. Native failure in the original baseline is reported honestly;
  collect a passing correctness-normalized baseline if oversubscription persists.
- Existing teardown logs showed blocked outbound provider attempts; do not make
  intentional live provider requests as part of optimization.

Raw logs/JSON are outside Git at /home/user/harness-bench/ for this session.
The scratch Istanbul provider install was outside the repository and symlinked
only for probes; replace it with a pinned normal dev dependency before shipping.
