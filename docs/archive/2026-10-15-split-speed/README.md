# Split-approved pipeline speed — research and improvement plan

2026-10-15 · status: **researched, measured, implemented the same day** (TDD:
`tests/split_speed.test.ts`, RED numbers below captured before any change).
Target: **≥ 80 % faster** "split approved" runs, without breaking the UI
responsiveness guardrails (RULE 5/7) or the never-overwrite rules (I-8).

## 1. What "split approved" runs today (the algorithm)

`BatchPanel "▶ Split selected"` → `batchProcess` → `runBatch` → `processItems`
(`src/batch/process.ts`) → per item, strictly one after another:

1. `yieldToFrame` + `yieldToUI` (item pre-yields)
2. `tryLoad` → `getFile()` (disk)
3. `splitImage` = `splitWithOverride` → `loadImageFile` (decode) →
   `splitSheet` (`src/lib/batchsplit.ts`): `analyzeAsync` → `detectAsync` →
   per icon `renderIconAsync` + `canvasToBlob`
4. `writeResult` → per blob `ensureDirPath` + `writeFileNew` + a UI yield each
5. `copyRefs` (reference image copied into every split folder)
6. `yieldToUI` + `yieldToFrame` (item post-yields)

## 2. Measured baseline (this sandbox, deterministic harness — RED numbers)

| # | Measurement | Value | How |
|---|---|---|---|
| M1 | Cooperative yields per **4-icon sheet** through `splitSheet` | **33** (`33 ui + 0 frame`) | mocked `yield` module counting calls, stubbed canvas (tests/split_speed) |
| M2 | Encode concurrency | **serial** — toBlob #2 issued only after #1 resolved (issued at 740/791/871/953 ms, resolved at 749/830/911/991 ms) | deferred-blob gates |
| M3 | `processItems`, 12 items × 24 ms simulated split | **1 046 ms wall** vs a 288 ms pure-compute floor → **3.6× overhead** | real timers |
| M4 | Yield cost model | `yieldToUI` = `setTimeout(0)` → 4 ms min clamp after nesting; `yieldToFrame` ≈ 16 ms; 10 ms/yield is the conservative mid-range under load | browser scheduling |

Modeled per-item idle from M1+M4: **~330 ms of pure waiting per 4-icon sheet**,
plus M3's zero overlap between items. For small-to-medium sheets (the common
batch: dozens of ≤ 1 kpx icons) the fixed overhead is the majority of wall
time — this is where ≥ 80 % lives. For one very large sheet the compute
(analyze/detect) dominates and the same fixes yield ~45–70 %.

## 3. Root causes

| RC | Cause | Evidence |
|---|---|---|
| S1 | **Yield storm**: 2 yields per icon in `renderIconAsync`, 2 more per icon in `renderAll`, per-radius yields in `detectAsync`'s series loop, per-chunk yields in analyze/mask, 4 in `writeSplits`, 4 per item in `processItems` — every one is a macrotask round-trip | M1: 33/sheet |
| S2 | **Serial PNG encode**: `out.push(await canvasToBlob(...))` — each encode waits for the previous; `toBlob` runs off-main-thread, so they could overlap | M2 |
| S3 | **Sequential items**: no decode/encode/IO of item N+1 overlaps compute of item N | M3 |
| S4 | Minor: per-item double frame-yields (≈ 32 ms each pair) even when nothing was painted | M3 arithmetic |

## 4. Improvements (ranked, all implemented)

| Fix | RC | Change | Guardrail kept |
|---|---|---|---|
| F1 **Time-budgeted yields** | S1, S4 | `yieldBudget(max = 24 ms)` in `lib/yield.ts`: yield only when the current uninterrupted stretch exceeded the budget; applied in `batchsplit` (phase + per-icon), `render.ts` (transparency chunks), `detect.ts` (series loop), `process.ts`, `writeSplits` | RULE 5/7: no stretch > ~24–48 ms; budgets measured by M1's gate (33 → ≤ 6) |
| F2 **Parallel PNG encode** | S2 | render every icon canvas first (budgeted), then `Promise.all(canvasToBlob)` | blob ORDER unchanged (reading order, RULE 1/4) |
| F3 **Bounded item pipeline** | S3 | `processItems` runs `min(3, items)` workers over a shared index; results collected **in item order** (preallocated array); stop checked before each start; progress by completed count | no-overwrite untouched (per-item folders from `planBatch`); failure isolation per item unchanged; report/order contract of `tests/process.test.ts` preserved |
| F4 **Cheaper decode** | S3 overlap | `dom.ts`: `loadSheet` tries `createImageBitmap(file)` (off-main-thread decode) with the `HTMLImageElement` path as fallback; `detect`/`render` take a `SheetSource` union and read dimensions through one helper | decode timeout stays for the image-element path; preview path untouched |

## 5. Expected effect (model, per 4-icon item, 10 ms/yield)

- Before: compute 150 ms + 33 yields ≈ 330 ms idle + serialized encode ≈ **~560 ms/item**, items sequential.
- After: compute 150 ms overlapped ÷ ~2.2 effective (decode/encode/IO of other items in flight) + ≤ 6 yields ≈ 60 ms − encode overlap ≈ **~110 ms/item amortized** → **≈ 80 % reduction** for typical batches (many small/medium sheets); ~45–70 % for a single huge sheet (compute-bound, less to overlap).

## 6. TDD acceptance (tests/split_speed.test.ts)

1. 4-icon `splitSheet` ≤ **6** cooperative yields (RED: 33).
2. All 4 `toBlob` calls issued **before the first resolves** (RED: serial).
3. 12-item pipeline wall **< 150 ms** with 24 ms simulated splits (RED: 1 046 ms).
4. Stop semantics and item-order reports preserved (both green before and after).
5. Full correctness suites stay green (`batchsplit`, `process`, `grid_split`,
   `splitscope`, `batch_preview_restart`, `batch_perf_regression`).

## 7. Docs updated in the same change

`QUALITY_RECHECK.md` (dated entry), `SYSTEM_OF_RECORD.md` (I-70), this README.
