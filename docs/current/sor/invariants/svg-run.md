# SVG run invariants — queue, versions, list stability

Stable IDs belong here; [all IDs](README.md) route to one canonical definition. Split from [SVG invariants](svg.md).

<a id="i-53"></a>
* **I-53 — the generation queue (rewritten 2026-10-08).** Confirming a batch
  while a run is in flight APPENDS it; the run in flight is never interrupted
  and the button is never disabled by it. `refs.queue` is the synchronous
  authority and `refs.abort` (non-null) is what "a request is in flight" means,
  so a stale closure can never start two runs or lose a batch. The queue is
  session-only — nothing queued is ever sent after a restart — and Cancel stops
  the run AND drops the whole queue, saying how many batches that was. A
  waiting batch changes nothing about the files until its request really
  starts; the row only SAYS it is next: `SvgRow.queued` is derived from the
  queue every render (`withQueued`), never stored, so the badge reads a grey
  "Next attempt" (`.svg-badge.queued`) while the source waits and the row's own
  status is back the moment the batch is dropped — nothing to restore. A row's
  own Regenerate/Generate while a run is in flight is the NEXT attempt
  (`placement: "front"` → `regenerateNext` → `enqueueFront`): no dialog (the
  queue line and the badge are visible before it starts), first in the queue,
  and the same image leaves every later waiting batch (`dropIdFrom`, batches
  re-planned and re-labelled, an emptied batch goes) so one queue never
  generates it twice; the toast says "… — next attempt, first in the queue (N
  queued) · removed from N waiting batch(es)". Bulk Generate, bulk Regenerate,
  `G` and the recovery retry still confirm and append; bulk Regenerate first
  filters the checked ids to rows with an existing valid SVG, while the row's
  Regenerate remains the front-of-queue action above. Every run event carries the run's
  image total (`run-start.images`, `batch-start.images`, `batch-done.done /
  .images`) and a run id (`batch-start.runId` — batch ids repeat per run), so
  the log's request-done line reads "· d of m image(s) done".
  Design: `docs/archive/2026-10-08-svg-queue-keepalive/design.md`.

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
* **I-57 — the run outlives the tab (2026-10-08).** The Workbench mounts
  `SvgPanel` once and parks it `hidden` on every other tab
  (`data-testid="svg-shell"`, the same node across switches); the panel takes
  `active` and, on every RETURN to the tab, dispatches `repin` and rescans when
  nothing runs — never on the first mount, which scans anyway. The run's
  numbers follow the user: `SvgRunPopup` is portalled to `<body>` (a hidden
  ancestor would hide a fixed child) and says
  `totalsLine(withChain(runTotals(progress, queue), chain), running)` —
  "Generating · 7 done · 13 left · 1 failed · request 2 of 5" / "Done · 20 done
  · 0 left". One chain of runs is ONE count: a queued batch starts as its own
  run, so `drainQueue` resets `model.chain` with the first run of a chain and
  folds each finished run's outcomes in (`chainAdd`) when the next one starts —
  the run on screen is never counted twice. The final line stays until the ×
  dismisses it (keyed by `runId`); a new run brings the popup back. `runtotals.ts`
  is the one arithmetic behind the popup, the bulk bar and the log.

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
