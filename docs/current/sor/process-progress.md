# Shared batch process progress

[Shared shell](shared.md) · [SVG to upload](upload.md) ·
[Batch](batch.md) · [Generate SVG](svg-generation.md)

## Shared presentation and reusable API

`src/ui/ProcessProgressBar.tsx` is the ONE header/track/stats layout used by
`BatchProgressHeader`, `SvgProgressHeader` and `UploadProgressHeaders`. Reuse
it for future batch tasks instead of copying a header. Callers provide a
stable selector prefix, the existing SVG/Batch theme, title/detail, processed
counts/percentage, and React slots for a thumbnail/status icon and actions.
It never starts requests, persists state, or owns task-specific cancellation.
Both existing headers retain their thumbnails, cancel confirmations, review
and dismissal behavior. One responsive rule stacks the shared header on
narrow screens. The track has `role=progressbar`, a task label, 0–100 bounds,
current percentage and a textual processed fraction.

`src/lib/processprogress.ts` owns generic arithmetic and reporting:

- `processTotals({done,total} | null)` sanitizes finite nonnegative integer
  counts, clamps done to total and returns done/total/left/percent. Batch's
  `batchTotals` reuses it too.
- `createProcessReporter(total, publish)` immediately publishes a new running
  snapshot with a unique run ID. Call `advance()` after each completed item
  and `finish(completed | cancelled | failed)` exactly once on exit. Snapshots
  are immutable; late advances/finishes after termination are ignored.
- Counts mean processed attempts, **not all-successful outputs**. Item failures
  remain visible in the task's rows. Do not count aborted items as completed.
  Cancellation keeps the real processed percentage and remaining count.
- This is in-memory presentation state, not a job journal or an undo record.
  Existing restart/interruption rules remain authoritative.

## Upload lifecycle

Metadata generation/regeneration, package export and Download all each own a progress slot.
They start at zero, advance only when the real runner settles a non-aborted
item, and retain a complete/cancelled/error summary until dismissed or replaced
by a new run of that kind. Each header shows current filename(s), processed
count, remaining count, percentage and Cancel while running; terminal headers
have Review results and Dismiss. Review opens SVG to upload without restarting
or remounting it. Cancel uses the existing abort path and keeps completed work.

`src/upload/processprogress.ts` adapts the generic reporter to the reducer.
Run identity/terminal guards reject stale publications and stale dismissals;
finishing metadata cannot clear an active export, or vice versa. The existing
toolbar text counter is derived from running slots, never a second counter.
`metabatch.ts` owns bounded metadata workers and terminal cleanup; export uses
`exportactions.ts`; download uses `downloadactions.ts`. Workers publish progress independently of React rerenders.
A failed/cancelled metadata phase never launches a chained Export selected.
A successful phase leaves its summary while the export header starts at zero.
Existing exact-request provider confirmation and acceptance rules are unchanged.

Download starts at zero after destination selection, using the captured plan's
**file** count (not icon count). Its detail names the current file; verified
saved, kept, missing and failed attempts each advance once. Missing/failed files
produce an error summary without stopping later copies. Cancel finishes the
active write/readback before stopping the next file; it retains actual counts
and verified copies. Empty plans and cancelled pickers create no bar or sound.
Duplicate clicks cannot launch overlapping pickers/copies. The toolbar uses the
download slot/counts while active, without resetting metadata/export summaries.

Upload mounts lazily on its first visit, then remains hidden rather than
unmounting on other tabs, like the other running panels. Its progress portal
is above navigation in Workbench, outside the hidden panel. Hidden Upload does
not own Q/E or arrow navigation. Page reloads do not revive an in-flight bar
or resend provider work; journals still report interrupted items.

## Handles

- Shell: `upload-progress-mount`, `upload-shell` (`hidden` when inactive).
- Prefixes: `upload-metadata-progress-*`, `upload-export-progress-*`, `upload-download-progress-*`.
- Suffixes: `header`, `title`, `file`, `track`, `completed`, `remaining`,
  `percent`, `cancel` (running), `review` and `dismiss` (terminal).
- Existing `batch[-preview]-progress-*`, `svg-progress-*` and Upload toolbar
  `upload-estimate`, `upload-progress`, `upload-cancel-run` remain compatible.

## Tests and safety

`upload_download_ui.test.tsx`: gated real per-file readback progress, hidden-panel
portal/cancel, mixed outcomes, duplicate run protection and completion audio.
`process_progress.test.tsx`: arithmetic, immutable snapshots, bounds, terminal
reporting, generic accessible layout. `upload_process_progress.test.tsx`:
independent channels, stale events, portal outside a hidden panel and actions.
`upload_ui.test.tsx`: gated real metadata/export pipelines, 0/50/100% counts,
regeneration after dismissal, cancellation without export handoff, aborted
items excluded, actual tab-switch completion/review and silent hidden hotkeys.
`workbench_ui.test.tsx`: lazy retained panel; `batch_progress.test.tsx` and
`svg_queue_ui.test.tsx`: existing header behavior. Queue-test teardown cancels
unfinished runners before restoring fake transports, preventing late retries
from escaping the test transport. No live provider sends are needed to verify
this feature.

## Completion sound on every tab

`src/ui/completionSound.ts` is the one local audio service for **all** tabs, not
only Generate SVG. One enabled cue follows each real process reaching its terminal
boundary (including completed attempts with item errors). It does not depend on
which tab is visible, a progress header mounting or React re-rendering.

- Single sheets: one cue after an entire import/detection run; ZIP, sequential
  downloads, folder save, single-icon Save/Copy cue after output work settles.
- Batch folders: explicit scans, preview/regeneration queues, approved splitting
  and manual review writes cue once per operation, never once per item. Preview
  auto-review and restored-cache synchronization stay silent.
- Selection V2: explicit scans, confirmed bulk decisions/reset and Retry writes
  cue after persistence. Ordinary row selection/filter/zoom and undo are not jobs.
- Generate SVG: existing independent SVG/image jobs retain their per-run cues;
  explicit scans and review writes use the same service.
- SVG to upload: metadata and package export signal their own terminal boundaries,
  including a metadata→export chain (one cue for each completed phase). Download
  all cues after the verified copies, not after the destination picker. Scans wait
  for row assembly before notifying.

Stop/cancel, dismissed confirmations, invalid/empty selections, cancelled folder
pickers, superseded ticket-guarded scans, cached preview no-ops and mount/restore
scans never cue. A scan explicitly requested by the user still finishes even if
its discovered snapshot is unchanged. Ordinary slider/thumbnail updates are not
new processes. A hidden/unmounted visual surface cannot suppress a runner's cue.

The shell arms Web Audio during pointer/keyboard capture, **before** async work
or a picker loses user activation. Runner starts also arm audio. Arming/importing
is silent. `startCompletionSound` captures an idempotent per-run finisher;
`withCompletionSound` preserves task results/errors and suppresses AbortError or
explicit `false` refusal. Upload adapts its immutable reporter rather than playing
from the reducer/header. Global mute remains persisted through the existing
`process-sound-enabled` control under Generate SVG; Test sound is local. Queued
cues do not overlap. Unsupported/blocked audio cannot fail processing.

The exact supplied `tests/assets/Sound/universfield-new-notification-037-485898.mp3`
is embedded in the self-contained HTML, never fetched or replaced with a tone.
Missing assets fail the build; decode failures stay silent and Test reports them.

Sound regressions: `completion_sound.test.ts`, `process_completion_sound.test.tsx`,
`sheets_completion_sound.test.tsx`, plus actual Upload phase-chain/hidden-tab/
cancellation/download, Batch warm-cache auto-review, Selection bulk persistence
and shell gesture tests in their existing UI suites. Real processing algorithms
run against browser I/O shims; no live providers.
