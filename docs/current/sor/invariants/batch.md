# Batch invariants

Stable IDs belong here; [all IDs](README.md) route to one canonical definition.

<a id="i-8"></a>
* **I-8 (batch, RULE 23):** batch outputs never overwrite: dirs/files are
  probed `create:false` first; collisions take `_v02…`; existing `_AI_7`
  variant suffixes are preserved, never replaced.

<a id="i-9"></a>
* **I-9 (batch, RULE 6):** the `_split_output` tree is never scanned as input;
  filtered-out (missing/deleted) sources never enter a batch.

<a id="i-10"></a>
* **I-10 (batch, RULE 13):** state JSON is validated on read; corrupt payloads
  are replaced with fresh valid state, never fatal.

<a id="i-11"></a>
* **I-11 (batch, RULE 1/3):** pixel math in batch mode reuses `lib/detect` +
  `lib/render` through `splitSheet` — no second detection implementation.

<a id="i-66"></a>
* **I-66:** a rendered `done` preview stores itself automatically; a restart
  restores it without user action and without regenerating; boot never spends
  the permission gesture (quiet query + one-click `batch-grant`).

<a id="i-67"></a>
* **I-67:** a per-item split decision (row merge) survives a page reload; it
  is stored per preset (`batch-merges-v1`), and the SAME value drives the
  preview, the review sync and `splitWithOverride`.

<a id="i-68"></a>
* **I-68:** a stored preview counts as "done" only while its recorded
  `previewKey` matches the current effective settings; stale records are shown
  (marked `data-stale`), never silently regenerated.

<a id="i-69"></a>
* **I-69:** batch render identity is stable: `useBatch` and `useBatchView`
  return memoized objects, action callbacks are referentially stable, and scan
  rows render through a memo comparator with `content-visibility: auto` — an
  unrelated render must never re-run every effect or re-render every row
  (the scroll CPU spike, ported from arena/736d3693-iconsplitter 2026-10-15).

<a id="i-70"></a>
* **I-70:** the split pipeline schedules by TIME, not by fixed steps: heavy
  loops yield only when their uninterrupted stretch exceeded the 24 ms budget
  (`yieldBudget`), PNG encodes of one sheet run concurrently, and approved
  items flow through a bounded 3-wide pipeline — progress stays live, stop is
  honoured per item start, results report in item order, and nothing
  overwrites (port: archive/2026-10-15-split-speed, ≥80 % on overhead-bound runs).
