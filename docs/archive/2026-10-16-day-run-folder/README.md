# Day-level run folders — same-day exports share one folder

2026-10-16 · status: implemented same day (TDD; spec change requested by the user).

## 1. The request

> "folder after split has format - 2026-10-16_13-35-40 — change it to only day
> 2026-10-16. Because if user add some extra export same day he wish to have it
> in same folder"

## 2. Today's layout and everything that knows it

```
<dest>/<YYYY-MM>/<YYYY-MM-DD_HH-mm-ss>/<src-hierarchy>/<item>/split_NN/…
```

Every place the stamp format is pinned (found by grep, RULE 10 keeps it rare):

| Place | Role | Change |
|---|---|---|
| `lib/naming.ts` `batchPath` | builds `<YYYY-MM>/<stamp>` for each run | emit `<YYYY-MM>/<YYYY-MM-DD>` |
| `lib/batchlayout.ts` `isRunStamp` | the ONE pattern (splitscope I-50 evidence) | accept day **and** legacy stamp |
| `batch/BatchDestRow.tsx` | UI hint text | say `YYYY-MM-DD` |
| tests: naming, output_plan, process, batch_row_locate | format locks | updated to the new spec + same-day acceptance |

`stripPathTail`/derivation match segments by handle names, not patterns —
format-agnostic already. `existingLookup` probes `<dest>/<relBase>/<relDir>`, so
with a day `relBase` it automatically sees earlier same-day runs.

## 3. Semantics that must survive

- **No-overwrite is per ITEM, and stays.** A second export of the same source on
  the same day lands in `<day>/…/<item>_v02` — the plan's `existing` lookup now
  spans the whole day, and within one run the `taken` map still deduplicates.
  The user's ask is the DAY folder being shared, not item folders merging.
- **Old exports stay first-class (I-50):** `isRunStamp` must keep matching
  `2026-10-16_13-35-40` (trees on disk from before this change) while also
  matching `2026-10-16`. A bare month (`2026-10`) must still NOT count as a run.
- The run level keeps exactly one segment under the month (scan-scope depth and
  the locate button's `outRel` are segment-count agnostic; verified by tests).

## 4. TDD gates

1. `batchPath` → `2026-09/2026-09-30` (RED: old lock says `_14-32-08`).
2. `processItems` twice on the same date: both runs under `2026-09/2026-09-30`;
   the re-processed item gets `_v02` (RED: second run created its own stamp).
3. `isRunStamp`: day ✓, legacy stamp ✓, month ✗, `16-10-2026` ✗.
4. All format locks updated (output_plan, process tree walk, locate `outRel`).
