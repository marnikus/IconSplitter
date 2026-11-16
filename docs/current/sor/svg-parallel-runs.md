# Parallel SVG/image runs and completion sound

Current contract for [Generate SVG](svg-generation.md) and [image edits](svg-image-edits.md), updated 2026-10-24. Stable rules: [I-53/I-57](invariants/svg-run.md); [handles](../selectors/svg-generation-run.md), [owners](owners/svg.md), [tests](tests/svg.md).

## Admission and input consent

* Set **Parallel SVG runs** to 1, 2 or 3 (default 3) to control provider pressure.
  This is independent of icons/request and the image-edit group preference.
* Every row Generate/Regenerate/correction opens prompt/input confirmation,
  including during a run. Confirm once: frozen settings, credentials, root,
  ordered sources, chosen prompt and current-SVG codes belong to that process.
* Independent SVG jobs start up to the chosen limit. Conflicting/full-capacity
  jobs visibly wait in the session-only queue. Eligible disjoint work can bypass
  a blocked head, but overlapping confirmations keep their order. Earlier
  confirmations are not silently replaced when another correction is requested.
* One image-edit process can coexist with independent SVG jobs. A conflicting
  image confirmation/main-image switch refuses before a request or write.
  A waiting SVG also protects the main image its preview disclosed. Conversely,
  SVG confirmation during an image mutation refuses and asks to review inputs
  after the edit; it never silently sends a newly selected image.

## Ownership, completion and Stop

Canonical pair-sidecar paths are leased atomically before any await. A terminal
SVG source releases after its save/failure is settled: correct an already-saved
icon while the original batch continues with other icons. Image leases survive
network completion through Apply/Discard. Sidecar review/preferred/main writes
use the same guard; latest in-memory sidecars preserve other version histories.
Root changes and rescans cannot replace the process's source snapshot.

Each SVG process has its own progress, status and Stop below the list. The
foreground strip remains a detail view; the persistent header aggregates all
processes and waiting work. Stopping one job does not abort another. Global SVG
Cancel drops waiting SVG work first, then aborts active SVG controllers, keeping
saved files and leaving the independent image process alone. Image Stop retains
its sent-result behaviour under the frozen [manual/automatic Apply policy](svg-image-auto-apply.md);
the independent image bar remains visible above tabs.

An unknown/stopped request never automatically triggers a previously queued
same-source retry. Affected waiting batches are dropped with an explanation;
disjoint work survives. Review and explicitly confirm again to retry. Journals
scope repeated batch IDs by run ID. Restart restores uncertainty metadata, never
queued paid work. Leases coordinate this panel/session, not external apps or
other browser windows; they are not OS filesystem locks.

## Skip current request versus cancel the batch

The foreground request strip's **Skip current request** (`svg-batch-cancel`)
only aborts that run's current provider request. It does not abort the owning
run controller, remove independent queued confirmations, stop parallel runs or
stop image edits. The next planned request starts automatically; completed SVG
versions remain saved. When several icons share one HTTP request, all its
members are skipped together—an individual composite member cannot be cancelled
at the provider. The button's tooltip says this explicitly.

A fresh short-lived controller owns each request, including composite/prompt
preparation and retry backoff. Whole-run cancellation forwards into it; request
cancellation never flows back to the run. Finally clears ownership and removes
the parent listener, including exceptional exits. An abort is never retried;
late answers arriving after skip are not saved, but known reported usage is kept.
The skipped request has a failed/aborted outcome with an explicit skipped reason,
not a whole-run `cancelled` status. The normal terminal batch cue still occurs
once when the continuing batch ends. Same-source uncertain-retry protection
remains in force; independent waiting work survives.

**Stop this run** still stops the named SVG run. The bulk **Cancel run** and
persistent **Cancel batch** still stop all active SVG runs and drop waiting SVG
work; neither stops the separate image process. These are deliberately separate
from the request-strip action.

Owners: `runner.ts`/`runtypes.ts` (request lifetime), `runbatch.ts`/`runsend.ts`
(request signal, retry, late-answer guard), `jobstate.ts`/`runjobs.ts` (owned
controller and foreground skip), `actions.ts`/`SvgPanel.tsx`/`SvgBatchStrip.tsx`
(separate UI action). Regressions: `svg_runner.test.ts`, `svg_queue_ui.test.tsx`,
`svg_jobstate.test.ts`, `svg_strip.test.tsx`. [Plan/evidence](../../archive/2026-10-26-svg-request-skip/README.md).

## Local completion audio

SVG and image jobs retain one enabled terminal cue per run, not per icon or
request. Shared activation, mute, recording embedding and the **all-tab** lifecycle
contract now live under [process completion sound](process-progress.md#completion-sound-on-every-tab).
The existing controls remain below the Generate SVG list. Cancelled/dropped work
stays silent; parallel completions remain serialized.
