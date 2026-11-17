# Activity bars — every long wait is visible (2026-11-03)

[Shared shell](shared.md) · [Job progress bars](process-progress.md)

Two kinds of bar, one frame (`src/ui/ProgressFrame.tsx`):

| | Job bar (`ProcessProgressBar`) | Activity bar (`ActivityBars`) |
|---|---|---|
| For | work with results: generation, image runs, register passes, splits, previews, metadata, export, download, stock upload | waits that freeze or block the page: folder scans, list loading, sheet imports, renders, saves, review writes |
| Controls | Cancel → Review results + ✕ | none |
| When done | stays until ✕ or the next run | **closes itself at once** |
| Sound | the shared bar's cue | the feature's own (unchanged) |

## How work gets an activity bar

- `src/lib/activity.ts` is the one app-wide list (`activities`,
  `beginActivity(source, label)` → `{update, end}`, `withActivity(source, label,
  work)` which ends in `finally`). Pure, no timers. `activityProgress` reads
  "3/10" or "3 of 10" from the label; otherwise the bar is indeterminate
  (sliding segment, "…" instead of a percent; no motion under reduced motion).
- Every tab mirrors its own busy text with `useBusyActivity(source, busy, skip?)`:
  Sheets (`sheets`), Batch (`batch`), Selection V2 (`selection`), Generate SVG
  (`svg`, skipping "Regenerating AI sources…" which has a job bar), SVG to upload
  (`upload`), Upload (`stock`). **New slow work that sets busy gets a bar with no
  extra code**; the bar ends when busy clears or the tab unmounts.
- Slow work that sets no busy text uses `withActivity`: Generate SVG review
  decisions, Selection V2 bulk decisions and Retry, Batch review-outcome writes.
- `ActivityBars` renders once at the top of `Workbench` (above the job-bar
  mounts), so the wait is visible from every tab.

The in-tab busy pills (`batch-busy`, `v2-busy`, Sheets overlay) are kept.

## One bar on top (2026-11-09)

`ProgressFrame` seats every bar (activity or job) in `lib/barstack` via
`ui/useBarStack`. The **oldest** bar is main; the rest stay mounted but `hidden`
(lifecycle and cues keep running). The main bar shows ▲/▼ (`bar-stack-prev`,
`bar-stack-next`) and a note `bar-stack-note` ("+2 more: title 40% · …"). A pick
holds until that bar closes; closing the main bar shows the next. A new `runId`
is a new, newest bar. Test: `bar_stack.test.tsx`.

## Remove unsuccessful uploads bar

`stockupload/removalprogress.ts` runs three steps (badges, history files, site
statuses) for one stock; `StockRemovalProgress` is its job bar
(`stock-removal-progress-*`): title names the stock, the finished detail says
"N badge(s) removed · N history file(s) removed". Stays until ✕. Test:
`stockupload_removal_progress.test.tsx`.

## Handles

`activity-bars`; per activity `activity-<source>-progress-{header,title,file,
track,percent}` (+ `completed`, `remaining` when counted); the track carries
class `indeterminate` without a count.

## Tests

`activity_bars.test.tsx`: store lifecycle and counts, `withActivity` on throw,
busy-driven show/count/auto-close, job-bar skip, unmount cleanup, and the wiring
of every tab and busy-less write path.
