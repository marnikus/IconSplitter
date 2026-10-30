# Every tab — process completion sound

## Request and diagnosis

All completed processing runs should play the supplied notification recording,
regardless of which tab owns the run or which tab is currently visible.
Currently only Generate SVG and AI-image runners call the shared audio service.
Batch split/preview, Upload metadata/export, Selection bulk work and Single
sheets processing do not. Browser audio activation also happens only in SVG
confirmations or Test sound, so merely adding terminal calls is insufficient.

## Plan before implementation

1. Inventory actual runner boundaries (not individual items or React renders).
2. Add regressions that record actual audio starts while executing real runner
   paths: Batch, Upload, Selection and Single sheets, alongside existing SVG
   audio tests. Witness missing notifications before implementation.
3. Reuse the exact embedded MP3 and shared mute/queued playback. Unlock audio
   from shell pointer/keyboard gestures before async work/pickers lose user
   activation. Never play from mount/restored history or a progress component.
4. Give each real run one terminal cue, after its final writes/cleanup, even
   with item failures or while hidden. Keep duplicate finishes, cancelled or
   superseded runs, refusals, no-ops and automatic thumbnail/settings work silent.
   Include user-requested folder scans, bulk review, sheet import and exports;
   retain independent cues for metadata then export and parallel SVG/image runs.
5. Update current shared sound/progress contract, selectors and owners/tests.
   Run focused tests, types, lint, changed quality, verify:fast and full verify;
   do not relax gates or call live providers. Append measured unread ledger entry,
   commit scoped files with Verified/attribution, push only the active branch.

## Status

Implemented with the shared audio service, actual runner terminal boundaries and
shell pointer/keyboard capture. Existing SVG/image job identities and cancellation
behavior are preserved. Explicit scans distinguish user starts from mount/restore;
automatic Batch preview-review writes explicitly opt out so they cannot add cues.
Upload scans now wait for their asynchronous record/hash row assembly before
ending. Metadata→export keeps two independent terminal cues; Download all waits
for verified copies and never cues a cancelled picker.

Extracted the actual Sheet import/detection loop from the oversized App callback
into `src/sheets/importSheets.ts`, retaining real detection, per-file isolation,
ordering, state sinks and error messages. Failed image loads release their object
URLs. The export run cues after busy cleanup; exact recording/mute/serialization
are shared, no replacement tones or runtime fetches.

## Measured verification — 2026-10-24

- Genuine preimplementation RED: five missing-sound assertions failed, three
  cancellation/refusal/mute controls passed. Initial Preview test wiring was
  corrected to the real hook's named-parameter API before the recorded RED run.
- Added 18 tests; strengthened existing Upload phase-chain, hidden completion,
  cancellation and Download all, Selection bulk persistence, Batch warm-cache
  automatic-review, and shell activation cases. Focused 207 tests/12 files PASS;
  subsequent final integration/docs subset 94/4 PASS.
- A new wrapper cancellation test caught happy-dom DOMException not sharing the
  Error prototype; explicitly recognize browser DOMException too. No expectation
  removed. Single-sheet tests use synthetic browser image/canvas I/O with real
  detection/rendering. JSZip's Node-realm test adapter normalizes only Blob I/O;
  actual ZIP generation/compression still executes.
- Types, lint (0 errors / 23 existing warnings), changed quality vs b9c2a85,
  docs navigation, verify:fast and full verify ALL PASS. Scan's initial complexity
  failure was corrected by cohesive current-scan/error-report responsibilities,
  not thresholds or warning suppression.
- Full suite: 2733 tests / 255 files, plus native performance 30 / 5, unchanged
  algorithms/budgets/isolation/coverage scope. Coverage 95.18% statements,
  89.37% branches, 98.14% functions, 98.20% lines. Full coverage lane 77.0 seconds.
- Self-contained production HTML 1793.20 kB. Exact supplied MP3 byte regression
  still passes. Current contracts/router/handles/owner/test inventory updated.
  No live providers. Generated/dependency/coverage output excluded from staging;
  measured ledger entry appended without reading the ledger.
