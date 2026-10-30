# Selected test architecture and implementation steps

Date: 2026-10-22. Written after the controlled probes in research.md and BEFORE
editing shipped configuration/setup/runner code. Acceptance is defined in README.md.

## Architecture

1. Keep the existing two-project split and command compatibility: `main` is
   every test except the canonical five native files; VM threads still give
   each file a fresh module graph/window. Existing Node environment pragmas
   remain authoritative. `native` stays real threads, isolated, groupOrder 1,
   exactly one worker. Do not remove any test or relax its limits.
2. Centralize native inventory, explicit worker budget and coverage policy in
   a small tool-side policy module. Main workers use available parallelism,
   capped at four and by a conservative memory budget; two workers on this
   2-CPU/4-GiB sandbox rather than Vitest's implicit one. Retain explicit per-file
   isolation and filesystem transform cache. Avoid oversubscription on small CI.
3. Default to pinned official @vitest/coverage-istanbul 5.0.3, limiting
   instrumentation to the EXISTING src/lib include list. Keep V8 dependency and
   CLI provider override for comparison/audit. Keep all thresholds and report
   outputs. Coverage is recomputed on every run, never cached as a success.
4. Split bootstrap by actual environment: setup dispatcher loads React/root
   tracking, owner-stack diagnostic optimization and quiet timers ONLY when a
   DOM exists. Node-only files do not import React or DOM cleanup infrastructure.
   Retain actual root unmount/body cleanup and per-file isolation, with regression
   canaries for teardown and no cross-file global/module/storage/timer leakage.
5. Keep verification stages sequential and native perf idle. Use TypeScript's
   supported incremental no-emit checking and ESLint's content-addressed cache
   for static lanes (not test-result caching). Put artifacts under node_modules
   cache, invalidate correctly on file/config/tool changes, expose `--cold` to
   bypass static/transform caches for honest first-run comparison. Build and
   complete tests/coverage always run. Preserve --plan/--json/--base and fail any
   lane failure; no alternate unchecked fast path.
6. Add a small cross-platform benchmark recorder/comparator: run a specified
   command, record wall time/exit/environment and compare successful measured
   runs against >=60% reduction. Never accept failed runs as performance proof.
   Capture cold/warm separately and retain file/test discovery comparison plus
   source coverage equivalence. Record raw reports outside Git or ignored cache.
7. Fix only the measured Upload fixture readiness race: await completed scan
   (not merely a row-count container), preserving every existing assertion and
   using the existing bounded quiet/wait helper. No new arbitrary sleep.

## Tests first / implementation order

- RED policy tests: correct exclusive/complete native split, min/max CPU/memory
  worker budgets, isolate=true, native serial/ordered, unchanged coverage scope,
  official provider pin and real provider override.
- RED setup canaries: pure Node bootstrap does not load React; DOM root cleanup,
  body cleanup and quiet tracking still work; two isolated files intentionally
  share marker names to detect cross-file leakage. Existing unit/UI suite is the
  broader equivalence gate.
- RED verification plan/cache tests: static caches/cold bypass, native stage,
  full coverage stage, exit-code propagation; retain existing runner contracts.
- RED coverage integration fixture: an intentionally uncalled branch/function
  stays uncovered and a 100% threshold fails; complete execution passes.
- RED benchmark tests: nonzero command exits are recorded/propagated, invalid
  or failed comparison inputs cannot pass, 60% boundary is computed correctly.
- Implement policy/config/bootstrap/dependency, fixture readiness, runner/cache
  flags, benchmark utility; then focused GREEN and complete gates.
- Measure passing baseline (with only serial native calibration if necessary),
  redesigned cold full verification and two warm full verification runs, no
  overlaps; compare source/test manifests and JSON coverage summaries. If cold
  runtime misses the target, continue tuning without weakening correctness.
- Update current harness/verification docs, append measured ledger, scoped
  commit/push. Final report distinguishes local measured speed, provider branch
  accounting difference, and any unresolved failure; no universal speed promise.
