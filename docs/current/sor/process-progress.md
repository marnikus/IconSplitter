# Shared batch process progress

[Shared shell](shared.md) · [SVG to upload](upload.md) ·
[Batch](batch.md) · [Generate SVG](svg-generation.md) · [Activity bars](activity-bars.md)

## Shared presentation and reusable API

`src/ui/ProcessProgressBar.tsx` is the ONE header/track/stats layout for
`BatchProgressHeader`, `SvgProgressHeader`, `UploadProgressHeaders`,
`StockUploadDialogs` and `SvgRegisterProgress`. Reuse it instead of copying a
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
  keeps one slot per feature (+ `useProcessSlot`); `imgprogress`,
  `registerprogress` and the upload/batch slots reuse it.
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
Download starts at zero after destination selection, using the captured plan's
**file** count (not icons). Verified saved/kept/missing/failed attempts each
advance once; missing or failed files summarise without stopping later copies.
Cancel finishes the active write/readback before the next file and keeps actual
counts. Empty plans and cancelled pickers create no bar or sound. The toolbar
uses the download slot while active, without resetting other summaries.

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
  `note`, `percent`, `cancel` (running), `review` and `dismiss` (terminal).
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

`src/ui/completionSound.ts` is the one audio service for **all** tabs. One enabled cue follows each real process reaching its terminal boundary
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

## One lifecycle for every bar (2026-11-03)

`ProcessProgressBar` owns the lifecycle; a caller passes `status`
(`ProcessStatus`), `runId`, `onCancel`, `onReview`, `onDismiss` — never its own
actions, marks or cue. `running`: the caller's `leading` + Cancel (`cancelLabel`,
`cancelDisabled`). `completed` ✓ green, `failed` ! red, `cancelled` ■: Review
results + ✕. One cue per `runId` for completed/failed with `total > 0`
(`notifyBarCompletion` skips an id the feature already cued); cancelled is
silent. A finished bar stays until ✕ or the feature's next run: no timer.
Per-feature mappings (a user stop wins):
`batchStatusOf`, `svgRunStatusOf`, `imageStatusOf`, `registerStatusOf`,
`stockStatusOf`; Upload uses its reporter status. An SVG run that ended before
its first request still gets a bar (`endedProgress`). Register passes
(`beginRegister` → `{reading, settled, finish, fail, cancelled}`) stop at Cancel
before the next folder (`cancelRegister`) and end `failed` if a folder throws.
Suffixes: `cancel`, `review`, `dismiss`, `icon`. Contract test:
`process_bar_lifecycle.test.tsx`.

Sound regressions: `completion_sound.test.ts`, `process_completion_sound.test.tsx`,
`sheets_completion_sound.test.tsx`, plus actual Upload phase-chain/hidden-tab/
cancellation/download, Batch warm-cache auto-review, Selection bulk persistence
and shell gesture tests in their existing UI suites. Real processing algorithms
run against browser I/O shims; no live providers.
