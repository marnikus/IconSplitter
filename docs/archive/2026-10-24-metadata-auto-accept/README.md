# Automatically accept newly generated metadata

## Request and diagnosis

All newly generated metadata should become accepted without a second “Accept
metadata” confirmation. The existing runner auto-accepts only the Export selected
flow; ordinary Generate and Regenerate leave successful responses as drafts.

## Plan (before implementation)

1. Add real UI/runner regressions for automatic acceptance after ordinary Generate
   and Regenerate, including single-row and checked bulk entry points. Witness RED
   before production changes. Keep actual parser/validator and fake browser/provider
   I/O rather than mocking metadata algorithms.
2. Make valid, complete generated responses accepted in one publication/cache
   write across every metadata runner entry point. Remove the flow-specific
   acceptance flag, not the validation gate. Keep malformed/invalid/truncated
   results unaccepted; failures/cancellation retain previous metadata and usage.
3. Preserve user-entered Creator/Copyright. Persist accepted state against the
   source hash so reload does not ask for acceptance again or resend paid calls.
4. Reuse sequential export with the run's own accepted-state map: explicit
   Export selected still exports the whole promised selection; ordinary generation
   updates existing packages after successful completion but does not create
   unsolicited new packages. Cancellation/failure does not start chained exports.
5. Keep initial exact-input paid-provider confirmation. Keep manual acceptance
   available for legacy drafts and manually edited/corrected fields; fresh valid
   model results must not require it. Do not silently promote old drafts on reload.
6. Update old tests to the new requested outcome without deleting their validation,
   scope, rights, persistence, cancellation or request-count assertions. Add tests
   for the changed automatic path and existing-package refresh.
7. Update current contract/handles/owner/test docs. Run focused tests, types, lint,
   changed quality, verify:fast and full verify with unchanged budgets/harness.
   Append measured ledger entry without reading it, commit scoped work with
   Verified/attribution and push only the active branch.

## Delivered

- Removed the obsolete per-flow acceptance flag. Every newly generated, complete,
  validated response goes directly to accepted state/cache, with one acceptance
  log and no intermediate generated-draft write.
- All four row/selected Generate/Regenerate entry points share the same gate.
  Explicit Export selected still carries its whole promised selection and the
  run-local accepted-state map. Ordinary metadata completion refreshes existing
  packages sequentially without creating unwanted packages for unexported rows.
- Creator/Copyright, initial paid-input confirmation, cancellation and per-item
  isolation remain intact. Mixed batches report the actual accepted count;
  invalid/malformed/truncated responses never gain new acceptance. Failed or
  cancelled regeneration keeps previous accepted text/cache. Partial cancellation
  keeps completed acceptance without starting the chained package refresh.
- Manual acceptance tests now seed real legacy drafts through the real source-hash
  cache, rather than expecting new valid provider results to remain drafts.
  All scope, invalidity, persistence, rights and no-new-paid-request assertions
  remain. One restore test now explicitly awaits the rows after asynchronous
  hash/read assembly instead of assuming the earlier audit means rows exist.
- Current generation/acceptance contract split into linked bounded read pages;
  router, selector handles, owners and test inventory updated.

## Evidence

- Genuine pre-production RED: three new real UI cases failed on generated drafts
  instead of accepted results (row Generate, row Regenerate, selected batch).
  Log: `/home/user/metadata-auto-red.log`. Browser/provider transports alone are
  substituted; real metadata parsing, validation, persistence and export run.
- Ten added UI regressions cover row/bulk generation/regeneration, automatic
  package refresh, reload, rights, exact request counts, invalid/malformed/
  truncated answers, mixed accepted counts, unsuccessful regeneration and partial
  cancellation. Focused **140 tests / 7 files PASS**, including existing cache,
  acceptance, runner, identity, actual SVG/JPEG/EPS carriers and doc-navigation
  suites (`/home/user/metadata-focused.log`).
- Types, lint (**0 errors / 23 existing warnings**), changed quality vs `55e34d0`,
  documentation navigation, `verify:fast` and full `verify` all PASS.
- Full gate: **2763 tests / 256 files**, plus **30 native budget tests / 5 files**;
  `src/lib/` coverage **95.25% statements / 89.62% branches / 98.14% functions /
  98.25% lines**, unchanged. Coverage lane **89.0 s**; production self-contained
  HTML **1793.09 kB**, gzip **556.41 kB**. Logs:
  `/home/user/metadata-{types,lint,quality,docs,fast,full}.log`.
- No live provider calls, test skips, test-harness/budget/threshold changes, source
  SVG changes, or generated/dependency artifacts staged. Ledger is append-only,
  not read. Final verification/commit/push recorded by the task completion.

## Repeat-run timing alarm (not hidden)

The first full aggregate passed all lanes. After strengthening an already
accepted-state assertion to check that the row Accept button is disabled, the
repeat full aggregate passed all 2763 functional tests and coverage but failed
one unchanged native timing budget: synthetic 1000 px grid detection took
244.4 ms against 200 ms (`/home/user/metadata-full-final.log`). `git diff`
confirmed no changes to detection algorithms, native tests, harness or budgets.
Three independent complete native-lane diagnostic runs then each passed all
30 tests / 5 files (`/home/user/metadata-native-diagnostic-{1,2,3}.log`). No budget
was widened and no assertion removed. Final aggregate rerun **ALL LANES PASSED**
(`/home/user/metadata-full-confirmed.log`): native 30/5, functional 2763/256,
unchanged coverage, 89.6 s coverage lane. Final fast aggregate also passed
(`/home/user/metadata-fast-final.log`).
