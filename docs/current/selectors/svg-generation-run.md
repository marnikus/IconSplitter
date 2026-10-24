# Generate SVG — queue, run record, progress and status

Selector priority and object shape: [shared conventions](shared.md#i-selector-object-structure--for-every-element). Part of [Generate SVG selectors](svg-generation.md).

Queue (waiting confirmations, I-53): `svg-queue` is absent when empty;
`svg-queue-count` explains that independent sources run in parallel and source
conflicts/full slots wait. `svg-queue-line-{n}` names the 1-based batch and
request/image counts; `svg-queue-drop-{n}` drops only that waiting confirmation.
`svg-confirm-generate` reads "Add to queue" during SVG work; the queue note
explains immediate independent admission without interrupting existing jobs.

Parallel controls: `svg-runs`, `svg-parallel-limit` (select 1/2/3, default 3),
`svg-run-{runId}` (status/progress), `svg-run-stop-{runId}` (only that active run).
Sound: `process-sound`, `process-sound-enabled` (persisted checkbox),
`process-sound-test` (local test/status). The label honestly identifies the
built-in fallback when the requested MP3 is absent. [Behaviour](../sor/svg-parallel-runs.md).

Run record (I-58): `svg-run-record` wraps the batch strip and the queue and sits
BELOW the list; absent when nothing ran and nothing waits.

The [persistent progress header and cancel flow](#s1-persistent-progress-header--srcsvgsvgprogressheadertsx-2026-10-11) are mounted above the tabs. `svg-shell` is the Generate SVG tab's parked wrapper (`hidden` on other tabs, never unmounted).

Batch strip (`svg-batch`, the request in flight and every finished request;
it stays after the run ends so the record is readable): `svg-batch-composite`
(the contact sheet actually sent), `svg-batch-id`, `svg-batch-grid`
("request 2 of 3 · 2×2 grid · 4 image(s)"), `svg-batch-counts` ("N saved · N
failed · N missing"), `svg-batch-elapsed` (the ticking "elapsed m:ss" of the
request in flight, next to Cancel — the visual proof that a long generation is
alive; "(ended)" once the run stops), `svg-batch-reports` with one
`svg-batch-report-{index}` per finished request (its own counts, elapsed,
tokens and cost; class `failed` when that request failed and `unknown` when its
outcome was never confirmed), `svg-batch-cancel` (only while something is in
flight).

## S1. Persistent progress header — `src/svg/SvgProgressHeader.tsx` (2026-10-11)

Pinned above tab header, portalled to `#svg-progress-mount` in Workbench, visible on every tab while a run is in flight or completed until dismissed:

| Test id | Element | Notes |
|---|---|---|
| `svg-progress-mount` | mount div in Workbench | above nav, `position:relative`, z-index 55 |
| `svg-progress-header` | bar container | `complete` class when done |
| `svg-progress-title` | strong | all-process count or "SVG batch complete"; interrupted terminal work says "SVG processes ended — check results" |
| `svg-progress-file` | span | current filename while running, or "N results saved · ready for review" when complete |
| `svg-progress-thumb` | img/span | current AI thumbnail (via `useSideThumbs`) |
| `svg-progress-track` / `svg-progress-fill` | divs | progress bar track and its fill |
| `svg-progress-completed` | span | "8 completed / 24" |
| `svg-progress-remaining` | span | "16 remaining" or "0 remaining" |
| `svg-progress-percent` | span | "33%" / "100%" |
| `svg-progress-cancel` | button | "✕ Cancel batch" — opens confirmation |
| `svg-progress-review` | button | "→ Review results" — switches tab to Generate SVG |
| `svg-progress-dismiss` | button | X dismisses completed bar |
| `svg-cancel-dialog` | backdrop dialog | cancel confirmation |
| `svg-cancel-current` | div | currently generating image line: thumbnail + "Currently generating · image 9 of 24" + filename |
| `svg-cancel-stats` | div | "8 completed · kept" / "16 remaining · stopped" |
| `svg-cancel-keep` / `svg-cancel-confirm` / `svg-cancel-close` | buttons | Keep running / Cancel batch / X close |

Cancel flow: `svg-progress-cancel` → `svg-cancel-dialog` with current thumbnail, counts, note "Unsent requests will be removed..." → `svg-cancel-confirm` calls `cancelRun` (drops waiting SVG jobs then aborts active SVG jobs only; keeps saved; image process is independent), `svg-cancel-keep` closes dialog (Esc also).

Shared surfaces: `svg-warn-{noteId}` (`pairfile` — the pair files that could not
be parsed, I-43 / `problems` — the
listed sources that need attention, with the first reasons spelled out /
`excluded` — the approved sources **not** listed, grouped by kind with the first
reasons spelled out ("4 approved source(s) are not listed — 2 with no AI image
on disk, 2 duplicate records." — a source outside the split output is reported
as `outside-split` and never offered, I-38), so a reference image is never mistaken for a
missing row (I-31) / `unreadable` — the files that could not be read this scan /
save failure),
`svg-toast` (`role="status"`), `svg-busy`, `svg-statusbar` with
`svg-status-totals` (visible tokens + cost, "—" when unknown),
`svg-status-progress`, `svg-status-running`. The image batch's `svg-busy`
message is [documented with image-edit status](svg-image-edits.md#image-edit-interruption-and-status).
Undo of a review gesture goes through the [global history bar](shared.md#o-global-history-bar-reset-actions-verified-2026-10-01).
