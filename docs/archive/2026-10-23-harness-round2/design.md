# Round-two decision and steps — 2026-10-23

Written after profiling/isolated probes, BEFORE any shipped code change in this
round. See README.md for the original >=50% further wall-time reduction target.

## Decision

The user subsequently explicitly selected harness-only / application unchanged;
application/compiler optimization is outside this round.

No tested execution-architecture change yet meets that target safely. Keep
current two-worker isolated VM execution, serial native performance stage,
development React, original test fixtures/assertions and Istanbul scope.
Do not ship slower or semantically broken alternatives merely to show activity.
Do not claim a 50% win from a partial suite or an old pre-redesign baseline.

Remaining execution is predominantly actual React/DOM work, not a long idle
runner queue. Four workers consume ~113 CPU-seconds in ~59 wall seconds on two
CPUs; oversubscription cannot turn this into <=37–40s full verification. This
is a measured limit of these probes, not proof that all future optimization is
impossible. Reducing actual work (e.g. separately designed application render
optimization) or more compute needs independent investigation and acceptance.

## Small tooling change justified by the new request

The existing comparison tool hardcodes the PREVIOUS 60% target. Add an explicit
`--required-reduction 50` comparison option while preserving the existing default
60%. Validate a finite percentage strictly between 0 and 100. Keep median
aggregation, successful same-machine evidence checks and nonzero failure exit.
This makes the new request checkable and reusable; it is NOT a harness speedup.
No benchmark command, source coverage policy, native budget or verification gate
changes as a side effect.

## Implementation / verification steps

1. RED comparison tests for exact 50% boundary, miss, repeated-run median,
   invalid/missing/nonnumeric targets and unchanged default 60%.
2. Implement target parsing/reporting in the existing small comparison tool.
3. Focused GREEN; preserve all existing tests. Run types/lint/quality and full
   fast/full workflows. Profile/resource/experimental reports remain outside Git;
   retain compact measured records and explicit rejected/failed classifications.
4. Run same-source comparisons with target50, including a negative control where
   current performance correctly fails. No performance success is asserted.
5. Update harness commands/current ownership and history route; append ledger
   WITHOUT reading it. Scoped commit/push, report target as unmet and identify
   the next research boundary honestly.
