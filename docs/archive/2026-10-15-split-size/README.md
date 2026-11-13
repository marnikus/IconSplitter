# Split export size — "preset size does nothing" — research and fix

2026-10-15 · status: **root-caused and fixed the same day** (TDD:
`tests/split_size.test.ts`, RED repro captured before the change).

## 1. The report

> "Batch files - size to 1024x 1024 or other preset do nothing. after export the
> file exportered has different size then in preset. Expect to see resized to
> exact 1024 (or preset size)"

## 2. The size contract, link by link (each verified with a test/probe)

| Link | File | Verification | Result |
|---|---|---|---|
| UI select | `BatchPresetRow.tsx` `SizeMini` → `onChange(+e.target.value)` → `setPreset({ split: { …, size } })` | component probe: choose `1024` → state + `localStorage iconSplitter.presets.v1` hold `size: 1024` | ✅ |
| Run capture | `useBatch.ts` `runBatch` reads `ctx.state.current.preset.split` → `processItems({ split, … })` → `processOne` → `splitImage(file, deps.split)` | component probe with `batchsplit.splitSheet` mocked: approve → Split → captured split = `{ padding: 6, size: 1024, … }` | ✅ |
| Render | `batchsplit.ts` `renderAll` → `render.ts` `paintIcon`: `out = opts.size > 0 ? opts.size : Math.round(sq.total)`; canvas `out × out`; blob = canvas | lib probe: `splitSheet` with `size: 1024` → `[1024,1024,1024,1024]`; `512` → 512s; `0` → native (content+padding) | ✅ |
| Write | `process.ts` `writeSplits` → `writeFileNew(splitDir, name, blob)` — blobs written as-is | code path | ✅ |

## 3. Root cause (RC)

**`src/lib/presets.ts` — strict parse silently discards recoverable sizes.**
`validateSplit` reads sizes through `numberOr(s.size, 0)`:

```ts
function numberOr(x: unknown, fallback: number): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}
```

Anything that is not already a `number` — above all a **string** `"1024"`, which
older builds/paths of the preset UI could store in
`iconSplitter.presets.v1` — falls back to `0`, and `0` means **auto (native
size)**. From then on every export ignores the user's chosen size: the exact
reported symptom, on every run, on every current build, until the preset is
re-saved. `padding` has the same hole. RULE 13 says corrupt-but-recoverable
values are repaired on read; a finite numeric string is recoverable intent.

RED repro (captured): `parsePresetList('[{ "split": { "size": "1024" } }]')`
→ `split.size === 0` (expected 1024); `"padding": "8"` → 6 (expected 8).

## 4. Fix

`numberOr` in `presets.ts` coerces finite numeric strings (`Number(x)` after a
`typeof x === "string"` trim check) before the finite check. Integrity kept:
`validSize` still snaps anything not in `[0,128,256,512,1024,2048]` to `0`, and
true junk (`"abc"`, `true`, objects) still falls back to the default.

## 5. TDD gates (`tests/split_size.test.ts`)

1. `"size": "1024"` parses to `1024` (RED → GREEN — the fix).
2. `"padding": "8"` parses to `8` (RED → GREEN).
3. Integrity: `2048` stays; `"abc"`/`1500`/`true` → `0` (green before and after).
4. Pipeline contract lock: `splitSheet` renders exactly `split.size` px for
   1024 / 512 / 0 (green before and after — proves the pipeline was never the
   bug and stays honest).

## 6. Docs updated in the same change

`QUALITY_RECHECK.md` (dated entry), this README. The UI-level chain is already
locked by the component probes described in §2 (wiring unchanged).
