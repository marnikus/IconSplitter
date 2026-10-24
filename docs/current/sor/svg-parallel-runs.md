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
its existing sent-result/review behaviour.

An unknown/stopped request never automatically triggers a previously queued
same-source retry. Affected waiting batches are dropped with an explanation;
disjoint work survives. Review and explicitly confirm again to retry. Journals
scope repeated batch IDs by run ID. Restart restores uncertainty metadata, never
queued paid work. Leases coordinate this panel/session, not external apps or
other browser windows; they are not OS filesystem locks.

## Local completion audio

One enabled cue per actually completed SVG or image process, including reported
failures; not per icon, request, render or refusal. No cue for cancellation or a
dropped queue entry. Confirmation arms browser audio; blocked/unsupported audio
cannot fail the process. **Completion sound** persists mute, **Test sound** plays
locally, and simultaneous completions serialize their cues.

The requested `tests/assets/Sound/universfield-new-notification-037-485898.mp3`
was absent from the checkout. The UI explicitly labels a built-in tone fallback.
Adding that exact MP3 then rebuilding embeds it into the self-contained HTML via
Vite's inline asset hook; no runtime network audio fetch is used. The fallback
is not a claim that the requested recording was supplied or auditioned.
