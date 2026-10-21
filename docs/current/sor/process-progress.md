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

Metadata generation/regeneration and package export each own a progress slot.
They start at zero, advance only when the real runner settles a non-aborted
item, and retain a complete/cancelled/error summary until dismissed or replaced
by a new run of that kind. Each header shows current SVG filename(s), processed
count, remaining count, percentage and Cancel while running; terminal headers
have Review results and Dismiss. Review opens SVG to upload without restarting
or remounting it. Cancel uses the existing abort path and keeps completed work.

`src/upload/processprogress.ts` adapts the generic reporter to the reducer.
Run identity/terminal guards reject stale publications and stale dismissals;
finishing metadata cannot clear an active export, or vice versa. The existing
toolbar text counter is derived from running slots, never a second counter.
`metabatch.ts` owns bounded metadata workers and terminal cleanup; export uses
`exportactions.ts`. Workers publish progress independently of React rerenders.
A failed/cancelled metadata phase never launches a chained Export selected.
A successful phase leaves its summary while the export header starts at zero.
Existing exact-request provider confirmation and acceptance rules are unchanged.

Upload mounts lazily on its first visit, then remains hidden rather than
unmounting on other tabs, like the other running panels. Its progress portal
is above navigation in Workbench, outside the hidden panel. Hidden Upload does
not own Q/E or arrow navigation. Page reloads do not revive an in-flight bar
or resend provider work; journals still report interrupted items.

## Handles

- Shell: `upload-progress-mount`, `upload-shell` (`hidden` when inactive).
- Prefixes: `upload-metadata-progress-*`, `upload-export-progress-*`.
- Suffixes: `header`, `title`, `file`, `track`, `completed`, `remaining`,
  `percent`, `cancel` (running), `review` and `dismiss` (terminal).
- Existing `batch[-preview]-progress-*`, `svg-progress-*` and Upload toolbar
  `upload-estimate`, `upload-progress`, `upload-cancel-run` remain compatible.

## Tests and safety

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
