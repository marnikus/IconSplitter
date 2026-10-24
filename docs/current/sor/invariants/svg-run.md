# SVG run invariants — queue, versions, list stability

Stable IDs belong here; [all IDs](README.md) route to one canonical definition. Split from [SVG invariants](svg.md).

<a id="i-53"></a>
* **I-53 — parallel confirmed runs (2026-10-24).** Every row/bulk generation
  or correction opens explicit prompt/input confirmation, even during work.
  Confirmed settings, credentials, sources and current-SVG code are frozen.
  The session registry owns independent controllers/progress and canonical
  pair-sidecar leases, acquired atomically before awaits. Up to 1/2/3 SVG jobs
  (default 3) plus the existing one image process may run; only independent
  sources overlap. Full slots or conflicts visibly wait. Disjoint work may
  bypass a blocked head without overtaking earlier overlapping confirmations.
  Earlier confirmed attempts are never silently deduplicated or replaced.
  Each terminal SVG item releases only its owner's lease after persistence;
  its completed row may be corrected while sibling requests continue. Image
  leases last through Apply/Discard. A waiting SVG also protects its previewed
  main image from later image edits/main switches; SVG confirmation refuses
  active image mutations and asks for input review rather than silently swapping.
  Root changes/rescans and conflicting sidecar writes are guarded. Per-run Stop
  stops that SVG run only; global SVG Cancel drops pending SVGs then aborts active
  SVGs, not image work. Unknown/stopped outcomes drop affected waiting retries
  with an explanation, never auto-resend; independent waiting work is preserved.
  Queue/controllers/credentials are session-only; restart sends nothing.
  See [scheduling and sound](../svg-parallel-runs.md).

<a id="i-54"></a>
* **I-54 — the preferred version.** A pair file may carry `"preferred": n`
  beside its `versions[]` (`v` stays 2: the key is additive, and a reader that
  predates it simply ignores it). It names the version the row SHOWS — preview,
  Copy, Code, Approve/Decline, the list fields and the scan key all read it
  through `chosenVersion(versions, preferred)`; nothing is ever deleted, so
  every version stays re-choosable, and a nonsense or dangling number falls back
  to "nobody chose" (the newest valid version). It is written through
  `saveMetaAt` (tmp → verify → overwrite), off the undo timeline, and the
  version chooser refuses honestly when it cannot be written.

<a id="i-57"></a>
* **I-57 — processes outlive the tab (updated 2026-10-24).** Workbench mounts
  `SvgPanel` once and parks it `hidden` on other tabs (`svg-shell`). Returning
  repins the list and rescans only when no process owns work. `SvgRuns` shows
  each process's own status/progress/Stop below the list; the legacy strip is
  the foreground process, never a shared mutable controller. `SvgJobProgress`
  subscribes to the registry: its persistent header sums active/finished
  processes and waiting confirmations, excludes cancelled work from remaining,
  and distinguishes interrupted completion from success. Dismissing the final
  header does not change files; a new process restores it. Each actual process
  finishes with at most one enabled completion cue, including failures but
  excluding cancellation/refusal/drop; unavailable audio cannot fail the job.

<a id="i-58"></a>
* **I-58 — the list never moves under the user (2026-10-08).** The visible
  order is PINNED: `model.order` (`pinOrder(previous, sortedIds(rows, sort))`)
  is refreshed only by a scan (`rows`), a sort change and `repin` (tab
  activation) — never by a run event (`rows-fn`) or a filter (the pin spans all
  rows, a filter only hides). A landing SVG updates its row in place; the date
  sort is applied once, deliberately, when the user comes back. Everything that
  appears or grows during a run — the batch strip and the queue, together the
  `RunRecord` (`svg-run-record`) — sits BELOW the list, so nothing inserted
  above it can push the "APPROVED SOURCES / SVG OUTPUT" header away.
