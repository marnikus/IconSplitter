# Download all: shared batch progress

## Request / diagnosis

Download all must display real progress like the other batch processes. It
currently copies committed files sequentially and plays completion audio, but
only sets a generic busy label: no progress reporter or shared header exists.

## Plan (recorded before production edits)

1. Add failing real download UI tests: zero → per-file progress → complete;
   portal outside a hidden panel; cancellation retains verified files and stops
   unsent copies; missing/kept/failed files settle without blocking the next.
2. Add an independent download slot to Upload's existing shared reporter/reducer
   and header. Reuse accessible percentage/count/remaining, terminal summary,
   review/dismiss and existing completion sound, without duplicate cues.
3. Snapshot source/plan, reserve the download before the async destination picker,
   reject duplicate runs, and keep cancelled picker/empty plans silent with no
   false progress. Count only settled, verified file attempts. Show current file.
4. Cancel prevents starting the next file; let an in-flight atomic verified copy
   settle honestly before publishing cancellation. Keep copied files, source
   packages, no-overwrite/readback/EPS checks, selected scope and failure isolation.
5. Update owning current progress/export/selector/owner/test documentation; retain
   bounded documentation pages. Run focused tests, types, lint, quality, docs,
   fast and full verification with unchanged harness and budgets. Append ledger
   unread; commit and push only the active feature branch.

## Delivered

- Download all now owns a third independent Upload progress slot and uses the
  existing shared header/portal. It displays current filename, settled files /
  total, remaining, percentage, Cancel, and retained completion/error/cancelled
  summaries with Review and Dismiss. The toolbar uses that same slot/count.
- Each real copy outcome advances once, after readback for writes. Saved, kept,
  missing and failed are processed attempts, not fabricated all-success counts.
  Cancellation finishes verification of the active copy and stops the next;
  successful files remain in the destination. Other progress slots stay intact.
- Capture the source/plan and reserve the run synchronously, including while the
  destination picker is open. Rapid same-render duplicate clicks cannot launch
  parallel copies. Cancelled pickers and empty plans never show a false run or
  play completion sound. The shared reporter supplies exactly one completion cue
  for completed/error runs, including while the panel is hidden; cancel is silent.
- Existing no-overwrite, collision planning, byte verification/removal on mismatch,
  EPS verification and selected scope are unchanged. No provider operation added.
- Current progress/export/selector/owner/test pages and router updated within
  unchanged documentation size budgets.

## Verification

- Genuine pre-production RED: two real download UI tests failed because neither
  the per-file progress track nor hidden-panel portal existed. Existing download
  tests passed. `/home/user/download-progress-red.log`.
- Eight added regressions: verified 0/33/67/100% file progress and one cue;
  hidden-panel cancellation through both header and toolbar; hidden completion,
  sound and Review without recopying; mixed kept/missing/failed outcomes plus
  continuing verified copies; synchronous duplicate picker protection and repeat
  runs; empty/cancelled picker silence; independent download slot (459 files),
  stale updates/dismissals and toolbar counts. Actual planning/copy/readback/EPS
  logic runs; only browser I/O is gated. Focused **132 tests / 8 files PASS**.
- Types, lint (**0 errors / 23 existing warnings**), changed quality vs `bcdf9a8`,
  docs navigation, `verify:fast` and final full `verify` **ALL LANES PASSED**.
  Final full: **2771 tests / 256 files**, native **30 tests / 5 files**; unchanged
  `src/lib/` coverage **95.25% statements / 89.62% branches / 98.14% functions /
  98.25% lines**. Coverage lane **82.0 s**. Self-contained HTML **1794.39 kB**,
  gzip **556.78 kB**. Logs `/home/user/download-{focused,types,lint,quality,docs,
  fast-final,full-confirmed}.log`.

## Recorded diagnostics (not hidden)

- Restored dependencies with the repository's `npm run setup` after missing native
  Rollup prevented test startup. No dependency or lockfile changes shipped.
- Initial fast verification found an invalid tab ID in the new test (fixed to the
  actual `generateSvg`) and an existing audit-before-row-assembly test race.
  The test-local mount now explicitly awaits scan/hash/assembly completion. A
  focused coverage run also exposed an existing accepted-row-before-terminal-toast
  race; the test explicitly waits for the real summary. Every original assertion
  remains; no harness/algorithm/threshold change or test skip.
- A full aggregate passed every functional test but hit the unchanged synthetic
  native grid budget: **249.0 ms against 200 ms**. Detection/native/harness files
  have no diff. A standalone native diagnostic then passed all 30 tests with
  synthetic **147.5 ms**, exact-image **172.3 ms**; the final full aggregate also
  passed every lane. Both failure and success logs retained:
  `/home/user/download-{full,native-diagnostic,full-confirmed}.log`.
- Local Git metadata initially lagged the already-pushed prior fix while those
  exact files were present in the workspace. Fetched the active branch and aligned
  only its HEAD/index to its existing remote tip `bcdf9a8` with a mixed reset;
  no working files changed or discarded. The final diff contains only this task.
