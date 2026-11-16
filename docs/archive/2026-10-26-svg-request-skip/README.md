# Skip the current SVG request without cancelling its batch

## Diagnosis and implementation plan (before code)

The foreground request strip (`svg-batch-cancel`) is wired to the same
`cancelRun()` callback as global Cancel batch. That callback drops the queue and
aborts every active SVG run. A request-local action cannot use that controller.

1. Reproduce through the actual panel: confirm two icons as two requests in ONE
   run, cancel the current request, prove the next starts and saves. Keep global
   cancel/per-run Stop tests intact. Add runner cases for streaming, pre-send,
   retry backoff, fresh controllers, whole-run cancellation and grouped inputs.
2. Give each request a short-lived AbortController linked one-way from the owning
   run's signal. Publish/clear it through an optional runner lifecycle callback.
   The run's controller remains authoritative for full cancellation; request
   cancellation must never abort it. Always detach listeners/clear the request
   reference in finally. Do not resend skipped/uncertain work.
3. Route the request-strip button to a distinct skip-current action targeting
   only the foreground run's current request. Keep the bulk/global Cancel batch
   and per-run Stop semantics unchanged. Label the button "Skip current request"
   and clarify that icons sharing one provider request are skipped together;
   a composite cannot cancel one member independently.
4. Use the request signal for send/retry waits and reject late results if the
   request was skipped before saving. Retain completed versions and transaction
   safety; the next planned request and disjoint queued/parallel jobs continue.
   Preserve same-source uncertain-retry protection, progress, final cleanup and
   one normal completion cue for a batch that continues to completion.
5. Update behaviour/invariants/selectors and run focused, type/lint/quality,
   fast/full gates. Append the measured ledger without reading it; commit and
   push the active branch with attribution.

## Acceptance

Skipping current SVG generation never drops unrelated waiting batches, aborts
other processes or marks the whole owning run cancelled. Whole-batch Cancel still
stops unsent work and keeps saved results. With multiple icons in one HTTP
request, the skip applies to that entire request, then continues with the next.
No live provider calls, automatic retries of skipped requests or weakened gates.

## Verification

- TDD: the real panel regression fails with the old global Cancel wiring
  (`red-valid-fixture.log`) and passes with request-local skip. The fixture
  explicitly chooses one image/request, confirms two icons in ONE batch, queues
  a third independent source, skips the first, then observes the second and the
  queued third complete. The earlier default-size fixture grouped both icons;
  its incorrect assumption was corrected, then the old wiring was re-tested red.
- Additional witnessed failures: skipped-stream reason originally said only
  cancelled; a discarded late answer lost its known usage; whole-run late-answer
  text incorrectly promised continuation. Dedicated tests now pin all three.
- Final focused run: **89 tests / 8 files PASS** (`svg_runner`, `svg_queue_ui`,
  `svg_jobstate`, `svg_strip`, `svg_runlog`, `svg_runtotals`, `svg_queue`,
  `docs_navigation`). Tests cover fresh request controllers, independent parent
  scope, pre-send skip, interrupted retry backoff/no resend, grouped requests,
  whole-run abort, exceptional cleanup, late-answer rejection and truthful usage,
  foreground-only parallel isolation, preserved files/queue and one terminal cue.
- TypeScript and uncached lint pass (0 errors / 20 existing warnings). Changed
  quality at base 20da47f passes for all nine production files; doc budgets,
  links and whitespace checks pass. No provider calls or dependency changes.
- One early verification attempt was deliberately stopped during review to add
  the whole-run late-answer wording regression. It is not counted as a passed
  gate. Final fast/full gates ran against the completed code.

Final delivery gates at base **20da47f**:

| Gate | Result |
|---|---|
| `npm run verify:fast -- --base 20da47f` | ALL LANES PASSED; 2,992 tests / 283 files |
| `npm run verify -- --base 20da47f` | ALL LANES PASSED; 2,992 tests / 283 files + native 30 / 5 |
| Coverage statements / branches / functions / lines | 95.43 / 89.99 / 98.23 / 98.31% (unchanged lib coverage) |
| Native timing lane | PASS, 4.1s; no budgets or harness settings changed |
| Coverage-suite duration | 95.9s fast / 101.5s full |
| Single-file production build | PASS, 8.0s fast / 7.8s full |

Both delivery runs passed types, lint (0 errors / 20 existing warnings), changed
quality, tests/coverage and build. Logs are outside Git under
`/home/user/svg-request-skip/verify-{fast,full}.log`. Current docs/routes/budgets
and staged whitespace checks pass. No source SVGs, image files, dependencies,
provider configuration or existing full-batch cancellation assertions changed.
