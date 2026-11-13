# Full-system test harness speed — research and implementation plan

**Deliverables:** [research](research.md) · [selected design/steps](design.md) ·
[measured outcome and cold-run limitation](results.md) · [evidence](measurements.json).
Normal repeat full verification: **68.66% faster**. Cold bypass: **53.97% faster**,
not a 60% cold-run success. The original plan below is retained unchanged.


Date: 2026-10-22. User requirement: understand/research/redesign the test architecture, document steps before implementation, and make full-system testing at least 60% faster.

## Acceptance contract (before experiments)

- Primary metric: wall-clock duration of the complete `npm run verify -- --base <fixed revision>` workflow, including types, lint, changed-code quality, isolated native perf tests, the entire test suite with coverage, and the single-file build. Target: redesigned duration <= 40% of the existing workflow on the same machine and source revision. Also measure full-suite/no-coverage and coverage-only durations separately.
- Preserve every pre-existing test and assertion, real production algorithms, per-file module/DOM isolation, cleanup, native real-realm/performance checks, coverage scope (`src/lib/**`) and thresholds. No focused/changed-only shortcut, skipped slow tests, reduced coverage or weaker assertions may count as the speed improvement.
- Benchmark honestly: record Node/OS/CPU/memory, command, exit status, test/file counts and times. Separate installation, cold transform-cache and warm runs. Never overlap benchmark runs. Report reproducible local evidence, not a universal hardware guarantee. If 60% is not demonstrated, report the gap instead of claiming completion.
- Existing branch restored with source matching fetched ecc5ffa; align HEAD/index without altering working-tree contents. Preserve prior features and user fixtures. Generated reports/profiles/cache remain untracked under ignored storage or outside the repository; do not commit dependencies/build outputs.

## Research steps

1. Read current harness/config/setup/quiet timer tracking, verification gates and regression tests; inspect machine limits and install the pinned dependencies via setup if required.
2. Measure unchanged full verification and JSON per-file timings. Identify test execution vs worker/environment/module loading vs coverage collection/remapping vs command startup/build/type/lint costs.
3. Consult upstream Vitest/V8 performance/isolation/coverage documentation and implementation. Record authoritative GitHub sources and relevant conclusions in a separate research note.
4. Run bounded isolated configuration experiments (pool/worker topology, environment classification, coverage mode, cache boundaries). Retain isolation and complete coverage. Use results, not the previous Windows figures or assumptions, to select the architecture.
5. Write the concrete selected redesign and implementation steps as a design document BEFORE editing the shipped harness.

## Implementation / verification steps

6. Add regression tests for configuration, suite partition/completeness, worker budget, cleanup/isolation, coverage ownership, command exit behavior and benchmark comparison; witness focused REDs before implementing changed behavior.
7. Implement measured redesign in small responsibility-owned modules. Keep one authoritative test/config manifest, cross-platform commands and an explicit native perf stage that runs without concurrent CPU work. Avoid a custom untested runner or cache that could silently omit failures.
8. Run focused harness regressions, then complete fast/full gates. Measure redesigned workflow sequentially against the fixed baseline, including cold/warm behavior and unchanged test discovery; compare coverage and new-test counts.
9. Update current harness/gate docs and router/owners where needed, retain plan/research/verification evidence, append one measured quality-ledger entry without reading it, commit scoped changes with verification/attribution and push the current feature branch.

## Initial observations (not a final design)

The existing runner executes six stages sequentially. Most tests use isolated vmThreads; native tests use threads after the main project. Setup imports React and quiet tracking for every file, even Node tests. Historical task logs measured ~240 s full verification, ~205 s coverage on this sandbox, while older documentation describes a different Windows machine (~30 s coverage). These are clues only: a fresh baseline and controlled probes must adjudicate pool, VM coverage and bootstrap overhead.
