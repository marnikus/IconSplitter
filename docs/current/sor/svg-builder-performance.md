# SVG builder — performance budget

Parent: [SVG builder](svg-builder.md) · tests: `tests/svg_builder_perf.test.tsx`, `tests/svg_builder_perf_compose.test.ts`.

**Composing a sheet** (`composeSheet`) is the builder's costly step. Every template picture, every artboard row picture and the stage are full sheets.

## Fixes (2026-11-15)

1. **Sanitised icons are cached** (`lib/svgBuilder/svgAsset.ts`). Validating, parsing, id-scoping and recolouring an icon happens once per exact SVG text (keyed by icon, cell and text hash, at most 4000 entries). Each composition only re-wraps the icon in its cell transform, colour and stroke.
2. **Pictures recompose only for their own icons** (`textsubset.ts`, `useTextSubset`). The stage and each picture compose from a record of just the icon texts they draw, and it keeps its identity while those texts are unchanged. One icon loading or changing no longer recomposes every picture.
3. **Template pictures draw a stable library sample** (`templateSampleIds`, the first 64 icons). Changing, toggling or reshuffling the stage's icons never redraws all the template pictures.
4. **Pictures are composed once at start** (`pictureReady`, model `booting`). With a folder open, a picture waits for the remembered folder, the scan and its own icon texts. It is not composed empty, then half-loaded, then complete.

## Measured (tests, 12 templates + 20 artboards, happy-dom)

| Gesture | Compositions before → after | Notes |
|---|---|---|
| Toggle one icon | 13 → 1 | the stage only |
| Fresh start (folder restored) | 97 → 33 | each picture once |
| Slider drag (20 steps) / typing (10 keys) | 20 / 10 (unchanged) | each now warm |
| Hover 50 moves / idle 2 s | 0 / 0 | |

The cost of one composition is about 18 % of before: 33 sheets of 40 icons take 133 ms warm against 740 ms cold.

Combined, a fresh start does roughly 7 % of its former composing work, and an icon toggle under 2 %.

The budgets in `svg_builder_perf.test.tsx` fail when a change makes an everyday gesture recompose more:
- hover: 0;
- toggle: ≤ 1;
- start: ≤ 35;
- idle: 0;
- warm/cold ratio < 0.35.
