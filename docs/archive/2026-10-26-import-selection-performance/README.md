# Import selection performance redesign — 2026-10-26

## Request and source

Import the performance fix from `arena/0216b05e-iconsplitter` into the current
`arena/cf992ba5-iconsplitter` branch. Source implementation: `cde75d1`, with the
plan/history in `a9a9deb`. Source base: `2e131d4`; the intervening `c30ec49`
only adds the supplied snowflake fixture already present on the current branch.
Current delivery base: `74b05d49` (reversible state sorting).

## Plan before integration

1. Fetch/read the source diff and the explicitly named redesign plan. Import
   only performance code/tests/tooling and its documentation, not unrelated
   history or a wholesale branch replacement. Preserve the existing append-only
   quality ledger and add a fresh import record without reading it.
2. Apply a three-way patch from the common performance base, resolving overlap
   with request-local SVG cancellation and reversible state sorting. In
   particular, Batch's selection-only mirror optimization must still subscribe
   to canonical checks when sorting selected/not-selected. Selection's stable
   API must retain checked-order-aware navigation; SVG skip/full Cancel remain
   separate. Keep all main-branch source/metadata/export fixes.
3. Run imported delta/history/render-budget tests plus current sorting, SVG
   skip, undo/navigation, selection-response and docs tests. Fix integration
   issues with regression tests, not weaker assertions or performance budgets.
4. Run types, lint, changed quality, verify:fast and full verify at 74b05d49;
   update current contracts/handles/owners/test routing as needed. Record exact
   evidence and scope, commit with attribution and push only the current branch.

## Verification

## Imported scope and integration adjustments

Imported `a9a9deb`'s named plan plus `cde75d1`'s implementation/tests/tooling
using a scoped three-way patch, excluding the append-only quality ledger and
already-present artwork. No unrelated source-branch changes were imported.
Working files initially matched the current remote delivery, while checkout Git
metadata still pointed at the initial snapshot; with no staged work, a mixed
reset aligned the branch/index to existing remote 74b05d49 without changing files.

- Resolved the one textual conflict in Batch's visible-list memoization by keeping
  the optimization AND canonical-check subscription for explicit selected sorts.
- Added red/green integration regressions for live selected sorting, reorder-exact
  undo (Shift after sorting) and duplicate insertion ids. Source-only behavior
  failed all three; ordered common ids now represent moved ids in the delta,
  and insertion deduplicates within a run as well as against existing ids.
- A second witnessed regression showed source caching hid reference/output path
  changes behind unchanged sort fields. Replaced its unescaped field signature
  with the existing all-field row-data comparison ignoring only `selected`.
  Ordinary mirror-only updates still retain the identical visible array, while
  every other field stays reactive. The original performance assertions pass.
- Retained current request-controller cancellation code, whole-batch Cancel,
  binary sorting, accepted-version selection, SVG repair and export algorithms.
  No gate/harness settings, dependencies or existing assertions were weakened.

## Verification results

- Initial tests could not start because restored node_modules lacked the native
  Linux Rollup optional package. `npm run setup` (locked npm ci) restored it;
  package.json/package-lock.json unchanged. Startup failure is not a TDD red.
- Witnessed TDD: 3 failures/24 passes in imported tests with new edge cases
  (`integration-red.log`), plus one stale-reference test failure
  (`data-invalidation-red.log`), all now green.
- Focused imported history/delta/budget + sorting/SVG runner/job tests: **70/6 PASS**.
  Existing real-panel sorting/skip, undo, navigation, projection, apply and docs
  regression suite: **244/11 PASS**. After the final cache hardening, focused
  **53/5 PASS**, including all original selection-response work budgets.
- Types, uncached lint (**0 errors / 20 existing warnings**), changed quality
  (**36 production files**), docs links/read budgets and whitespace PASS.

Final gates at base **74b05d49**:

| Gate | Result |
|---|---|
| `npm run verify:fast -- --base 74b05d49` | ALL LANES PASSED; 3,035 tests / 287 files |
| `npm run verify -- --base 74b05d49` | ALL LANES PASSED; 3,035 tests / 287 files + native 30 / 5 |
| Coverage statements / branches / functions / lines | 95.52 / 90.21 / 98.31 / 98.37% (all improve) |
| New selectiondelta module | 100% lines/functions, 99% statements, 98.41% branches |
| Native performance lane | PASS, 3.3s; original budgets unchanged |
| Coverage-suite duration | 90.9s fast / 79.1s full |
| Single-file production build | PASS, 6.6s fast / 6.2s full |

Both runs passed every lane, including types, lint and changed quality. Full-suite
logs are outside Git at `/home/user/perf-import/verify-{fast,full}.log`. Existing
UI fixtures attempted blocked model-catalog lookups; no live generation was used.
The imported source's serialization measurements remain historical evidence;
no new end-to-end browser latency percentage is claimed. No Chromium comparison
was run here. Current docs explicitly distinguish these facts and route the
updated history/projection/state-sort contracts and tests.
