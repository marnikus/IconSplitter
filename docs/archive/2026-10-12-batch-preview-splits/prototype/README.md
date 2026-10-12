# Prototype — the merge-radius series in one union-find sweep

**Research artifact for `../design.md` (2026-10-12). Never imported by `src/` or `tests/`.**
`tsconfig.json` (`src`, `tests`, `tools`), `eslint` and `tools/quality.mjs` (`src/**`) do not see
this folder; `tools/verify.mjs` is unaffected. P1 rebuilds the winning algorithm as
`src/lib/mergeseries.ts` under TDD and freezes `reference.mjs`'s algorithm as the test oracle.

## Why it exists

`detect()` picks the automatic merge radius by running the whole dilate+label pipeline once per
candidate radius (`for (let r = 1; r <= rMax; r++)`) — **always**, even for a manual fraction.
Measured here: 192 ms for a 1024² sheet, 703 ms for a 4000² sheet, i.e. ~3–7 minutes of
main-thread work for a 1000-row Batch preview, in indivisible 0.2–0.7 s blocks.

The prototype replaces only that series: one exact Chebyshev distance transform to the nearest ink
cell + one union-find walk over cells in increasing distance, evaluating the (unchanged)
"≥ 1.5 % of max ink" validity rule per radius. Components of `dilate(cells, r)` are, by definition,
the components of `{cell : distance(cell, ink) ≤ r}`, so the numbers must be identical.

## Files

| File | What it is |
|---|---|
| `reference.mjs` | verbatim copies of today's `dilate` and `label` (the oracle) |
| `fast.mjs` | `seriesProto` (the sweep) + `detectProto` (today's `detect` body with the sweep and a column map) |
| `cases.mjs` | the deterministic mask generator (6 pattern families × 5 sheet sizes) |
| `equivalence.mjs` | the harness: identity checks + the speed-up table |

## Run it

```bash
# identity (series, boxes, usedFrac, autoFrac) — fast
node --experimental-strip-types docs/archive/2026-10-12-batch-preview-splits/prototype/equivalence.mjs

# with the timing table
node --experimental-strip-types docs/archive/2026-10-12-batch-preview-splits/prototype/equivalence.mjs --bench

# a quicker pass while iterating
node --experimental-strip-types docs/archive/2026-10-12-batch-preview-splits/prototype/equivalence.mjs --seeds 8 --bench
```

Expected (Node v22.22.3, this sandbox, 2026-10-12):

```
series identical: 48/48
detect identical: 288/288 (boxes, usedFrac, autoFrac)

sheet | old detect(auto) | new detect(auto) | speed-up
512^2 / 1 icon(s)  |  89 ms | 18 ms | 4.8x
1024^2 / 1 icon(s) | 181 ms | 31 ms | 5.9x
1024^2 / 4 icon(s) | 256 ms | 32 ms | 8.1x
2048^2 / 12 icon(s)| 317 ms | 41 ms | 7.7x
4000^2 / 40 icon(s)| 668 ms | 94 ms | 7.1x
```

`--seeds 8` prints `8/8` and `48/48` (the same identity claim on fewer analyses). Node ≥ 22.12 is
required for `--experimental-strip-types`; the app's own `.nvmrc` is 22.12.0.
