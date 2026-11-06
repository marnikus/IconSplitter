# Parallel SVG / image-edit runs and completion sound

## Problem / acceptance

A long SVG batch must not block a newly confirmed independent SVG generation,
SVG correction with a new saved prompt, or AI-source image regeneration. Work on
one pair must never overlap another writer/input change for that pair. Finished
icons should become available while the rest of their batch continues. Preserve
explicit preview/consent, immutable prompts/codes, version history, Stop and
unknown-request recovery. Notify once when a real process finishes.

The requested sound path is
`tests/assets/Sound/universfield-new-notification-037-485898.mp3`.
That directory/file is absent in the checkout at planning time. Tell the user;
provide a local completion-sound hook which embeds that exact file when supplied,
with an honestly labelled built-in tone meanwhile (not a fabricated replacement
claim). No external sound fetch or provider calls during development.

## Dependency / hazard map (before implementation)

- `svg/runcontrol.ts` serializes all SVG jobs through one abort ref and drain loop.
  `runqueuepath.ts` freezes prompts/codes but row actions bypass the prompt popup
  during a run. New corrections must retain the explicit prompt confirmation.
- `svg/runner.ts` executes requests sequentially inside a batch. Keep this and
  each request's existing validation/retry/stall logic unchanged.
- `svg/runstate.ts` has global progress/current setters and a whole-run sidecar
  reload. Parallel jobs need isolated progress/controllers; a finished run must
  not clear another run's progress or replace its in-flight row state.
- `svg/journal.ts` keys notes by batchId, which repeats across runs. Scope all
  runner begin/attach/end operations by (runId,batchId); keep legacy readers.
- SVG/image commits allocate versions and write the same verified pair sidecar.
  Reserve the pair (canonical metadata path) before either process begins. Hold
  image locks through Apply/Discard. Release SVG rows only after their terminal
  save/failure event, so completed rows can be corrected during the remaining run.
- `imgactions.ts` / `imgbatchrun.ts` keep one image-edit process, with a separate
  Stop and review. Let it coexist with independent SVG jobs, not another edit
  of a reserved source. Refuse conflicting image confirmation before any send.
- Root pick/rescan and review/preferred/main-version writes must not race leased
  pairs. Root/scan changes are refused while jobs exist; conflicting row writes
  explain why. Settings/connection edits remain usable: each confirmed SVG job
  freezes root, key, config, sampling, source set, prompt and code snapshots.
- `SvgPanel`, `RunRecord` and progress header keep legacy foreground surfaces;
  add a per-run list with independent progress/status/Stop, below the icon list.
  A shared foreground bridge must never count another run's request as its own.

## Scheduling contract

- Up to three SVG runs plus the existing single image-edit run can coexist.
  Implementation refinement: persisted user-selectable 1/2/3 SVG slots (default
  3) preserves a genuine serial/provider-throttling mode.
  Jobs with disjoint source leases start immediately. Conflicting SVG jobs wait
  in the visible session-only queue; scan for eligible disjoint jobs without
  blocking them behind a conflicting head. Keep explicit front/drop semantics
  for queue utilities, but row corrections now open the prompt popup.
- Acquire all a run's source leases synchronously before any await. Release each
  terminal SVG item only after persistence; hold any uncompleted items until
  finally. Always release on exception/cancel; never launch queued work after a
  global SVG Stop (drop waiting work first). Per-run Stop affects only that run;
  image Stop still keeps sent results/review and stops unsent image work.
- Unique run identities scope progress, journal entries and cancellation. Queue,
  controllers, credentials and completion notifications are session-only.
- One sound per completed process (including reported failures), not per icon or
  request. No sound on initial render, refusal, queue drop or user cancellation.
  Arm audio from confirmation user gestures; blocked/unavailable audio cannot
  fail a completed job. Include mute/test controls and serialize audible cues.

## Steps / verification (TDD)

1. Add failing regression tests: disjoint overlap, same-pair serialization,
   completed-row reuse, frozen settings, independent stop/cleanup/progress,
   journal id collisions and image/SVG conflicts. Verify RED before changing
   production scheduling. Add sound tests for once-only completion and failures.
2. Implement pure lease/admission rules and session job registry, then isolated
   SVG launch/progress and queue pumping. Update image reservation and row/root
   mutation guards. Add independent run display and restore explicit row prompt
   confirmation. Embed supplied sound if available; otherwise label fallback.
3. Run focused RED-to-GREEN including real provider-transport fakes and verified
   file writes. Update superseded serial-only test contracts without deleting
   assertions about consent, isolation, versions or cancellations.
4. Update owning docs/invariants/selectors/router and test inventory; types,
   lint, quality against 9cf6e27, fast/full verification with native budgets and
   unchanged coverage thresholds. Append measured ledger without reading it.
5. Record results, commit only scoped files with Verified/attribution and push
   `arena/cf992ba5-iconsplitter`. Do not stage dist/dependency/cache output.

## Results

Implemented 2026-10-24 on `arena/cf992ba5-iconsplitter`.

- Session registry + atomic canonical sidecar leases, fair disjoint bypass,
  selectable 1/2/3 SVG slots, independent image process, immutable confirmation
  snapshots, run-scoped journals and controllers, per-run Stop and global SVG
  drop-before-abort. Terminal per-source release permits correction of saved
  icons while sibling requests stream, preserving both SVG histories.
- Real image/SVG regressions prove disjoint overlap and both histories survive;
  conflicting image send refuses before billing and requires explicit retry.
  Reverse SVG confirmation refuses an active image mutation instead of silently
  changing the previewed input. Waiting SVG previews block later main-image
  changes. Unknown/stopped results drop affected previously queued retries with
  an explanation; disjoint confirmations remain. Unexpected filesystem failure
  cleans leases and permits a fresh explicit retry without automatic resend.
- All-process progress header + per-run records. Completion cues are emitted
  once per actual completed process (not per request/icon), failures included,
  cancellation/refusal/drop excluded. Mute/Test and async first-click activation
  are covered. The MP3 was initially absent, then arrived in remote commit
  `7f9952b` during the first push. It was merged without overwriting either change;
  the final build embeds that exact recording. A byte-exact asset decode test
  proves it is not the fallback. No real provider requests or external sound
  downloads were made.

### Measured verification

Evidence directory: `/home/user/svg-parallel-runs/` (outside Git).

- Pre-implementation `red.log`: 4 RED / 22 GREEN; genuine explicit-correction
  failure in `correction-red.log`; then concurrent/journal regression GREEN.
- Additional input safety `input-safety-red.log`: 2 RED / 3 GREEN (waiting
  preview protection and unknown queued retry); both fixed in focused GREEN.
  `audio-activation-red.log`: first Test sound async activation RED, then GREEN.
- Focused integration `focused.log`: 160/160 across 11 files; final expanded
  scheduling/review/guard/audio/state suites `final-focused2.log`: 64/64 across
  5 files, including 22 real queue UI tests. Docs/audio: 8/8 across 2 files.
- `npx tsc --noEmit` PASS. Lint PASS: 0 errors, 23 existing warnings; new
  complexity warnings were refactored out. Changed quality against `9cf6e27`
  and the verification runner's default broader baseline PASS.
- Initial fast verification exposed two incomplete legacy test fixtures lacking
  the new `busy: null` model field; repaired fixtures and added scan/image-busy
  guard coverage without weakening existing assertions. Subsequent complete
  `verify:fast` and full `verify` PASS, 2,609 tests / 249 files each. Full native
  lane: 30 tests / 5 files PASS, unchanged budgets and harness.
- Coverage: 98.03% aggregate `src/lib` lines, 89.31% branches; new pure
  `joblocks.ts` 100% statements/branches/functions/lines. No threshold or scope
  reduction. Self-contained production HTML build 1,731.11 kB PASS.
- Owning behaviour/invariants, storage, owners, tests, selectors and router
  updated; append-only measured ledger updated without reading it. Generated
  build, dependencies and evidence are not staged.


### Supplied-sound integration follow-up

The first push was safely rejected because the user concurrently added the
requested 41,795-byte MP3 in `7f9952b`. Fetched and merged that commit on the same
branch, no force-push or discarded work. Repeated focused audio and complete
fast/full gates with the real inline asset before the merge commit. Final
measurements are recorded below after those gates; earlier missing-file notes
above describe planning/initial verification only.

The asset integration test first failed (still selecting fallback), revealing
that a cached empty optional glob did not track a newly supplied file reliably.
The final implementation uses an explicit required inline MP3 import, removing
the temporary fallback. It decodes exactly the supplied bytes, schedules decoded
recordings without overlap, and reports decoder failure silently/unavailable
instead of pretending another tone is that recording.

Final supplied-recording gates: `supplied-sound-green.log` 10/10 (audio + docs),
`quality-supplied-sound.log` PASS, `verify-fast-supplied-sound.log` and
`verify-full-supplied-sound.log` ALL LANES PASS: 2,611 tests / 249 files, native
30/5, 98.03% src/lib lines, 89.31% branches, 100% joblocks metrics. Production
single HTML 1,786.51 kB; byte-exact Base64 comparison confirms it contains the
entire supplied 41,795-byte MP3. The final implementation has no substitute tone:
missing asset fails build, decoder/browser failure is silent and cannot fail work.
