# numbers.md — measured facts for the batch preview design

Companion to `design.md` (RULE 17: the plan and the numbers live in the dated archive folder).
Every table below was produced in this repo, on the code of the commit that added this file.
`tools/verify.mjs` does not run any of it — these are research measurements, not gates.

## Environment

| | |
|---|---|
| Date | 2026-10-12 |
| Node | v22.22.3 (`.nvmrc` pins 22.12.0; ≥ 22.18 imports `.ts` directly, 22.12 needs `--experimental-strip-types`) |
| Sandbox | Arena agent sandbox, Linux x64, no GPU, no browser |
| Detector | `src/lib/detect.ts` at HEAD `488b649` (this lineage), unmodified |
| Suite baseline | `npx vitest run` → **160 files / 1787 tests**, 1785 green; 2 failures in `tests/secret_hygiene.test.ts` are a sandbox artifact (no `node_modules/.vite/deps/_metadata.json`; this branch's HEAD tracks `node_modules/` — the ignore rule the test relies on does not exist here) |

## 1. Per-image cost before the change (`node tools/bench_detect.mjs --reps 4`)

| Sheet | icons | grid | `detect(auto)` | `detect(manual 0.05)` | 1000 rows, auto |
|---|---:|---:|---:|---:|---:|
| 512² | 1 | 256² | 84 ms | 71 ms | 84 s |
| 1024² | 1 | 342² | 165 ms | 171 ms | 165 s |
| 1024² | 4 | 342² | 236 ms | 217 ms | 236 s |
| 2048² | 12 | 342² | 289 ms | 267 ms | 289 s |
| 4000² | 40 | 400² | 543 ms | 546 ms | 543 s |

Read: manual mode is not cheaper — the automatic radius **series** (`for r = 1..rMax` full
dilate+label runs, 51–80 per sheet) is built in both cases. 1000 rows = 1.4–9 minutes of
main-thread work in indivisible 0.08–0.55 s blocks.

## 2. Warm phase breakdown (prototype harness, `prototype/equivalence.mjs`)

| Sheet | cell fill | radius series | final label | box pass | core total |
|---|---:|---:|---:|---:|---:|
| 1024² / 1 icon | 1.4 ms | 14.5 ms | 2.4 ms | 1.8 ms | 20.2 ms |
| 2048² / 12 icons | 5.2 ms | 14.7 ms | 2.9 ms | 7.8 ms | 30.7 ms |
| 4000² / 40 icons | 20.2 ms | 20.2 ms | 5.1 ms | 28.5 ms | 74.2 ms |

`analyze()` is **not** measured here: it needs a real canvas (downscale `drawImage` +
`getImageData` + two `w·h` passes). Estimate from the pixel work alone: ~10–30 ms at 1024²,
~150–400 ms at 4000², and it is one indivisible block. This is why the preview slices work and
never claims the per-row cost is zero.

## 3. The enabler: one union-find sweep instead of `rMax` dilations

Algorithm (design D1 + §7): for dilation radius `r` the dilated set is exactly
`{cell : Chebyshev distance to ink ≤ r}`, so the series is the component count of the thresholded
distance field. One exact two-pass chessboard distance transform + one union-find walk in
increasing distance, evaluating the existing "≥ 1.5 % of max ink" validity rule per radius.

Identity, `node --experimental-strip-types prototype/equivalence.mjs`:

* radius series identical: **48/48** analyses (6 pattern families × 5 sheet sizes)
* full `detect(an, frac)` identical (`boxes`, `usedFrac`, `autoFrac`): **288/288**
  comparisons (48 analyses × `null, 0, 0.0025, 0.05, 0.15, random`)

Speed (`prototype/equivalence.mjs --bench`, measured before this change):

| Sheet | today | with the sweep | speed-up |
|---|---:|---:|---:|
| 512² / 1 icon | 89 ms | 18 ms | 4.8× |
| 1024² / 1 icon | 181 ms | 31 ms | 5.9× |
| 1024² / 4 icons | 256 ms | 32 ms | 8.1× |
| 2048² / 12 icons | 317 ms | 41 ms | 7.7× |
| 4000² / 40 icons | 668 ms | 94 ms | 7.1× |

## 4. After P1 — the shipped detector (`node tools/bench_detect.mjs --reps 4`)

| Sheet | icons | grid | auto | manual | 1000 rows, auto |
|---|---:|---:|---:|---:|---:|
| 512² | 1 | 256² | 13 ms | 5 ms | 13 s |
| 1024² | 1 | 342² | 15 ms | 9 ms | 15 s |
| 1024² | 4 | 342² | 18 ms | 19 ms | 18 s |
| 2048² | 12 | 342² | 26 ms | 23 ms | 26 s |
| 4000² | 40 | 400² | 57 ms | 65 ms | 57 s |

Speed-up against §1 (same tool, same sheets): **6.5× / 11.0× / 13.1× / 11.1× / 9.5×**.
1000 rows: 84–543 s down to 13–57 s of main-thread work, per row 13–57 ms — small enough to
slice at phase boundaries and to cache, which is what the preview design needs (D4–D6).

Equivalence evidence for the shipped code:

* `tests/detect_equivalence.test.ts` (vs the frozen pre-change oracle) — 3 tests, **1.4 s**:
  identical `boxes`, `usedFrac`, `autoFrac` on 8 fixtures × [null, 0, 0.05] (every fraction for
  the small ones) + 4 seeds × {1:1, `scale: 4.5`} × [null, 0.05] + a blank-sheet case.
* `tests/mergeseries.test.ts` — 12 tests against an independent BFS oracle; `tests/grid.test.ts`
  — 5 tests on the downscale/cell contract.
* Whole suite: **163 files / 1807 tests**, 1805 green (the 2 failures are the sandbox-only
  `secret_hygiene` pair described under Environment).

Files: `src/lib/grid.ts` (new, 56 lines), `src/lib/mergeseries.ts` (new, 167), `src/lib/livesets.ts`
(new, 142), `src/lib/detect.ts` (306 → **295** lines: the grid build moved out, the box pass and
the final dilate+label are untouched).

## 5. After P3-P5 — what the preview machinery costs (no pixels)

`tests/batch_preview_ui.test.tsx` drives the real session/queue/cache/state machine
over 1000 selected rows with a trivial per-row work function. That isolates the
machinery from the pixels and gives the design's "without lag" claim a number:

| Quantity | Measured |
|---|---|
| Rows planned for 1000 selected | 1000, in the user's list order (D4) |
| Rows started in the first 150 ms | ~45 (machinery only, no decode/detect/render) |
| Rows in flight | exactly 1 (asserted) |
| Re-renders per row finished | 0 for the list, 1 for that row's strip; counter ≤ 4 Hz |
| Write attempts during a session (guarded fake root) | 0 |
| Cached bytes for 1000 strips of ≤ 4 KB | ~4 MB of the 32 MB budget |

Per-row cost with real pixels is dominated by what §4 measures (`detect` 13-57 ms
per sheet) plus image decode, one 64 px `renderIcon` per icon and one PNG encode
per ≤ 128-icon chunk. Strip rendering and encoding cannot be measured in this
sandbox (happy-dom has no canvas), and this document does not pretend otherwise —
the caps (512 icons/row, 8192 px/chunk, 32 MB) are what bound them.

Invariants touched: I-66 (one merge control, in the preset), I-67 (a preview
writes nothing), I-68 (interruptible, per-row failures isolated, no stale paint),
I-69 (pixels from `renderIcon` with the preset's own opts; URLs revoked).
