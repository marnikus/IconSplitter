# Shared batch process progress

[Shared shell](shared.md) · [SVG to upload](upload.md) ·
[Batch](batch.md) · [Generate SVG](svg-generation.md)

## Shared presentation and reusable API

`src/ui/ProcessProgressBar.tsx` is the ONE header/track/stats layout used by
`BatchProgressHeader`, `SvgProgressHeader`, `UploadProgressHeaders`,
`StockUploadDialogs` and `RegisterProgress`. Reuse it instead of copying a
header. Callers provide a prefix, theme, title/detail, counts/percentage and
slots for a thumbnail icon and actions. It never starts requests, persists
state or owns cancellation. One rule stacks it on narrow screens; the track is
`role=progressbar` 0–100 with a textual processed fraction.

`src/lib/processprogress.ts` owns generic arithmetic and reporting:

- `processTotals({done,total} | null)` sanitizes finite nonnegative integer
  counts, clamps done to total and returns done/total/left/percent. Batch's
  `batchTotals` reuses it too.
- `createProcessReporter(total, publish)` publishes a running snapshot with a
  unique run ID, `advance()` per completed item, one terminal `finish()`.
  Snapshots are immutable; late calls are ignored. `src/lib/processslot.ts`
  keeps one slot per feature (+ `useProcessSlot` to subscribe); `imgprogress`,
  `registerprogress` and the upload/batch slots all reuse it.
- Counts are processed attempts, **not all-successful outputs**; item failures
  stay visible in the rows. Aborted items are not completed, and cancellation
  keeps the real percentage and remaining count.
- In-memory presentation only, never a job journal or undo record; existing
  restart/interruption rules stay authoritative.

## Upload lifecycle

Metadata generation/regeneration, package export and Download each own a slot.
They start at zero, advance only when the real runner settles a non-aborted
item, and keep a complete/cancelled/error summary until dismissed or replaced.
Each header shows filenames, processed/remaining, percentage and Cancel while
running; terminal headers have Review results and Dismiss. Review opens SVG to
upload without restarting it; Cancel uses the abort path and keeps done work.

`src/upload/processprogress.ts` adapts the reporter to the reducer. Run
identity/terminal guards reject stale publications and dismissals; finishing
metadata cannot clear an active export, or vice versa. The toolbar counter is
derived from the running slots, never a second counter.
`metabatch.ts` owns bounded metadata workers and terminal cleanup; export uses
`exportactions.ts`; download uses `downloadactions.ts`. Workers publish progress independently of React rerenders.
A failed/cancelled metadata phase never launches a chained Export selected.
A successful phase leaves its summary while the export header starts at zero.
Existing exact-request provider confirmation and acceptance rules are unchanged.

Download starts at zero after destination selection, using the captured plan's
**file** count (not icons). Verified saved/kept/missing/failed attempts each
advance once; missing or failed files summarise without stopping later copies.
Cancel finishes the active write/readback before the next file and keeps actual
counts. Empty plans and cancelled pickers create no bar or sound; duplicate
clicks cannot launch overlapping pickers. The toolbar uses the
download slot/counts while active, without resetting metadata/export summaries.

Upload mounts lazily, then stays hidden rather than unmounting, like the other
running panels. Its progress portal sits above Workbench navigation, outside
the hidden panel. Hidden Upload does not own Q/E or arrow keys. Reloads do not
revive an in-flight bar or resend provider work; journals report interruptions.

## Live provider progress (Getty web)

A Getty web run is several 100-icon batches in one session, so the panel polls
`/getty-web/progress` for the **whole run**: a `done` reading ends one batch,
never the watching, and every reading names its batch. The last count is banked
when the next batch starts, so the bar carries its total instead of restarting.

## Handles

- Shell: `upload-progress-mount`, `upload-shell` (`hidden` when inactive).
- Prefixes: `upload-{metadata,export,download}-progress-*`,
  `register-{svg,images}-progress-*`, `stock-upload-progress-*`.
- Suffixes: `header`, `title`, `file`, `track`, `completed`, `remaining`,
  `percent`, `cancel` (running), `review` and `dismiss` (terminal).
- Existing `batch[-preview]-progress-*`, `svg-progress-*` and Upload toolbar
  `upload-estimate`, `upload-progress`, `upload-cancel-run` remain compatible.

## Tests and safety

`upload_download_ui.test.tsx`: gated real readback progress, hidden-panel
portal/cancel, mixed outcomes, duplicate-run protection, completion audio.
`process_progress.test.tsx`: arithmetic, snapshots, bounds, terminal reporting.
`upload_process_progress.test.tsx`: channels, stale events, portal, actions.
`upload_ui.test.tsx`: gated metadata/export pipelines, 0/50/100% counts,
cancellation without export handoff, aborted items excluded, hidden hotkeys.
`workbench_ui.test.tsx`: lazy retained panel; `batch_progress.test.tsx` and
`svg_queue_ui.test.tsx`: header behavior, with teardown cancelling unfinished
runners so no late retry escapes the fake transport. No live provider sends.

## Completion sound on every tab

`src/ui/completionSound.ts` is the one local audio service for **all** tabs. One enabled cue follows each real process reaching its terminal boundary
(including completed attempts with item errors), independent of the visible
tab, a header mounting or a re-render.

- Single sheets: one cue after an import/detection run; ZIP, sequential
  downloads, folder save, single-icon Save/Copy cue after output settles.
- Batch folders: explicit scans, preview/regeneration queues, approved splitting
  and manual review writes cue once per operation, not per item; preview
  auto-review and restored-cache sync stay silent.
- Selection V2: explicit scans, confirmed bulk decisions/reset and Retry cue
  after persistence; row selection/filter/zoom and undo are not jobs.
- Generate SVG: independent SVG/image jobs keep their per-run cues; explicit
  scans and review writes use the same service. Registering existing SVGs or
  existing AI sources cues once, when the whole pass settles.
- SVG to upload: metadata and export signal their own boundaries, including a
  metadata→export chain (one cue per phase). Download all cues after the verified
  copies, not the picker; scans wait for row assembly.

Stop/cancel, dismissed confirmations, invalid/empty selections, cancelled
pickers, superseded ticket-guarded scans, cached preview no-ops and
mount/restore scans never cue. A user-requested scan finishes even when its
snapshot is unchanged. Slider/thumbnail updates are not processes, and a
hidden surface cannot suppress a cue.

The shell arms Web Audio on pointer/key capture, **before** async work or a
picker loses user activation; runner starts arm it too. Arming is silent.
`startCompletionSound` captures an idempotent finisher; `withCompletionSound`
keeps results/errors and suppresses AbortError or an explicit `false`. Global
mute persists through `process-sound-enabled` under Generate SVG; Test sound is
local. Queued cues do not overlap and blocked audio cannot fail processing.

The supplied `tests/assets/Sound/universfield-new-notification-037-485898.mp3`
is embedded in the self-contained HTML, never fetched or replaced with a tone.
A missing asset fails the build; decode failures stay silent and Test reports.

## The bar owns the cue (2026-11-02)

`ProcessProgressBar` takes `cue` (its run/process id) and `cueSilent` (a
cancelled, stopped or partial run). `useCompletionCue` fires
`notifyBarCompletion(id)` once per id when `total > 0 && complete && !silent`.
The bar is the safety net: a feature that already cued that id keeps ownership
(`notifyBarCompletion` skips a claimed id), so no finished bar is ever silent
— the stock upload and image-run bars were — and none sounds twice. A refused
cue goes to a deferred set and replays on the next `armCompletionSound()`.

Register passes publish `{id, kind, done, total, current, phase, registered,
skipped}` through `src/svg/registerprogress.ts` (`beginRegister` →
`{reading, settled, finish}`) and render the same bar in
`src/svg/RegisterProgress.tsx`: percent, done/total, the pair being read, a
green finished state, 6 s auto-hide and a ✕. Getty web upload stamps a
`runId` on every patch and flags a user-stopped run so it stays silent.

Sound regressions: `completion_sound.test.ts`, `process_completion_sound.test.tsx`,
`sheets_completion_sound.test.tsx`, plus actual Upload phase-chain/hidden-tab/
cancellation/download, Batch warm-cache auto-review, Selection bulk persistence
and shell gesture tests in their existing UI suites. Real processing algorithms
run against browser I/O shims; no live providers.
