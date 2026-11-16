# Test harness: additional 40% full-system time reduction

## Understand the request and acceptance (before implementation)

Research, document the plan/steps, then implement a test-architecture improvement.
Use current commit **281edd6**, not historical pre-optimization baselines. Interpret
"at least40% faster" conservatively as **>=40% less complete verification time**
(>=1.6667x throughput), stronger than merely1.4x throughput. Preserve every feature
test/assertion, isolation, actual application algorithms, full src/lib coverage
scope/thresholds, real native performance alarms and all verification gates.
No cached test successes, skips, reduced budgets, no-isolate or stale results.

Two fresh successful full warm baselines on this machine:
- `/home/user/harness-40/baseline-warm1.{json,log}`: **91.85s**.
- `/home/user/harness-40/baseline-warm2.{json,log}`: **96.16s**.
- Median approximately94.00s, target approximately**56.40s**. Use exact JSON
  durations in the final calculation; report variance and all failed runs too.
- Node22.22.3, Linux, 2 CPUs, ~3.85GiB RAM. Full2849 tests/267 files plus
  native30/5, coverage95.32%stmt/89.72%branch/98.20%fn/98.29%line.

## New research hypothesis (not another global pool switch)

Current architecture reuses expensive external DOM/React imports via isolated
VMs, but a contextified Window puts V8 interceptors on each global lookup.
The hot mathematical code was already moved to native threads in the last task;
ordinary DOM suites still execute source and Istanbul counters inside a proxied
VM global. Global native-thread/V8 switching was previously measured slower and
is not repeated without a distinct hypothesis.

Sources retrieved using gh (copies outside Git):
- `https://github.com/vitest-dev/vitest/blob/main/docs/config/pool.md`:
  VM globals are slower; import reuse helps, worker recycling costs CPU.
- `https://github.com/nodejs/node/issues/31658`: contextified globals use
  interceptors; cache injection is only a partial workaround.
- `https://github.com/nodejs/node/blob/main/doc/api/vm.md`:
  **vm.constants.DONT_CONTEXTIFY** (supported since Node22.8, below the repo's
  Node22.12 minimum) creates a separate VM context whose global is not proxied.
  It does NOT imply sharing globals or disabling per-file isolation.
- `https://github.com/vitest-dev/vitest/blob/main/docs/guide/environment.md`:
  public custom Environment.setupVM and vitest/runtime builtinEnvironments /
  populateGlobal APIs support supplying a fresh Node VM context.
- Installed pinned Vitest5.0.3 confirms these APIs are in `vitest/runtime`
  (not older `vitest/environments`, which is not exported).

A diagnostic arithmetic loop (NOT full-system speed evidence) using identical
10million Math.sqrt iterations measured default VM1238ms, cached Math646ms,
non-contextified VM19ms. Need actual suite equivalence and end-to-end proof.
Happy-dom's current Window already caches Math; another cache tweak is insufficient.

## Proposed architecture

Keep the supported vmThreads file isolation/module execution and shared external
package imports. Supply a custom DOM environment that creates a **fresh**
DONT_CONTEXTIFY context and delegates DOM population/teardown to pinned Vitest's
public built-in happy-dom `setup`/`teardown`. Thus a fresh global/module graph and
DOM per file remain, while ordinary JS global lookup runs natively. Preserve
Node pragma handling and native performance project. Do not fork happy-dom,
patch node_modules, monkeypatch Vitest internals, or replace real geometry code.

## Steps

1. Record at least two complete warm baselines (above) and a cache-bypassed full
   baseline before source/config changes. Snapshot real coverage summary.
2. Prototype the environment privately using public APIs. Test representative
   Upload/Selection/React/IndexedDB/geometry/DOM cleanup suites; then all tests
   with unchanged official Istanbul and thresholds. Reject semantic differences.
3. Add RED contracts before shipping: actual vm.isContext and direct-global
   identity, DOM/window/defaultView behavior, unique globals/intrinsics/DOM across
   two contexts, teardown/timer cleanup, Node bootstrap unchanged, plus actual
   per-file VM/isolation canaries. Test unsupported runtime failures clearly.
4. Implement a small typed custom environment, route only the DOM default to it.
   Preserve first-line Node overrides, three-way exact-once inventories, worker
   budgets, native quarantine, all source coverage and the existing lane runner.
   Promote/simplify placement only if measured; no speculative over-subscription.
5. Measure full verification, not just tests. Compare at least two warmed candidate
   runs with same-machine baseline median; cold-to-cold separately. Use successful
   reports only but retain/disclose failures. Claim >=40% only if real comparable
   full-system evidence passes. Include first-transform cost separately.
6. Run focused canaries, all types/lint/quality/docs, fast and full gates. Update
   current harness/verification docs and router, append quality ledger without
   reading it. Commit scoped files and push only arena/cf992ba5-iconsplitter.
   Keep generated profiles/logs/reports/build/dependencies outside Git.

## Acceptance and fallback

Do not trade away any correctness/isolation/coverage/performance guarantee for
speed. If custom DOM integration changes semantics or misses the target, reject
it or report the remaining gap explicitly. A microbenchmark or the earlier118s
reference cannot be used to manufacture success. No application code changes are
planned; the target is test-execution architecture rather than altered algorithms.

## Evidence-driven plan amendment (before implementation)

Cold baseline129.92s PASS. Direct-global VM prototype: all2849 tests pass and
ALL173 files have exactly identical covered/total lines/functions/statements/
branches, but warmed coverage80.63s versus the original~76–81s. REJECT it: the
microbenchmark does not predict the real workload. UI worker profiling instead
shows actual DOM allocation/GC and React rendering; the previous profiles show
actual geometry search. No custom environment or dependency switch will ship.

Broaden the implementation to remove mathematically redundant work in the REAL
geometry code (not replace it in tests), with exact-output equivalence controls:
- Capture original281edd6 offset outputs as deterministic hashes before edits.
- Short-circuit independent tolerance checks once any fails. Preserve TOL0.01,
  quarter/half/three-quarter checks, Tiller–Hanson and depth8.
- Evaluate the SAME Bernstein expressions/squared distance without temporary
  vector/weight arrays; preserve operation order, not a different cubic formula.
- A derivative/Lipschitz bound may certify that every point in the remaining
  golden-search interval is on the same side of the unchanged tolerance. Include
  floating-point slack; never certify nonfinite or near-threshold cases. Otherwise
  keep the original forty iterations and final comparison. Exact reference/fuzz
  and near-threshold tests must pass; real supplied SVG/EPS tests remain untouched.
- This IS a production computational optimization, not just a harness setting.
  Disclose that scope and reject any output difference or quality regression.

Redesign verification as bounded pipelines: native timing alarms alone first,
then one serial static/build queue alongside the complete coverage suite on
>=2CPU/>=3GiB hosts. Lower-resource hosts and --serial retain sequential execution.
No overlap during native budgets; no gate removed; all failures propagate. Keep
canonical command inventory but expose execution groups in --plan. Tests use
real child fixtures to prove order, overlap, isolation, cancellation and failures.
Measure end-to-end after both changes; do not count only the fastest subset.

### Lifecycle investigation

Four VM workers did not help (warmed complete coverage69.15s after geometry
optimization; ~1.84CPU utilization on the first run). Reject oversubscription.
The bounded runner alone is not a40% gain on two busy CPUs. Investigate proper
per-test ownership of asynchronous work: root unmount currently clears the DOM
but leaves tracked timers/immediates until file teardown. Cancel abandoned tracked
work ONLY after the test and root cleanup, never during assertions. Add canaries
for cancellation and subsequent fresh timers; keep all timing behavior/budgets
inside each test unchanged. Reject if any full-suite semantics regress.

### Final selection checkpoint

Unqualified cancellation of shared immediates was WRONG: IndexedDB operations
lost their scheduling callback, causing13 feature/hook timeouts (291.75s failed
run, retained). Do not ship it. Correct cleanup cancels only abandoned tracked
TIMEOUTS after root cleanup, preserves shared immediates, and resets the quiet
helper's virtual offset; targeted IndexedDB/native/quiet controls23/4 PASS.

Measured full successful overlap82.05s vs serial82.37s is within timing noise.
Therefore preserve SERIAL DEFAULT. Expose bounded overlap as explicit --overlap
only, with resource fallback and --serial override; do not call it a proved speed
improvement. No four-worker or custom VM environment switch ships. The geometry
optimization is real and separately disclosed, but40% acceptance remains unproved.

### Lifecycle final disposition

Do NOT ship automatic cancellation of any tracked work. Although the narrower
"timeouts only" variant passed the full suite, it has no demonstrated speed gain
and cannot establish ownership of module-lifetime awaited work. Restored the
existing quiet helper/setup/tests exactly to281edd6 (including the prior proven
Promise-ordering fix). Keep both successful and failed prototype evidence, not
an unneeded asynchronous-semantics change. Final implementation is the equivalent
real geometry kernel plus tested opt-in execution pipelines; existing lifecycle,
worker pools and provider stay unchanged. Repeat final measurements on that code.

### Measured disposition

See [final results and raw evidence](results.md). The additional40% target is
NOT met: warm median94.00s→91.23s (nominal2.95%); cold129.92s→117.85s (9.29%).
All three40%-required comparisons correctly fail. Serial remains default; only
equivalent real geometry computation and opt-in bounded execution are retained.
