# SVG builder — icon fit by its real bounds (2026-11-24)

Back to the [SVG builder contract](svg-builder.md) · [owners](owners/svg-builder.md).

A generated icon usually sits inside a larger frame (its `viewBox` — the generator's artboard), with empty space around the drawing. Every placement on the sheet — grid cells, 2 × 2 big icons, the banner hero, the library tiles — fits the icon by its **ink box** (the real drawn bounds, like a selection box in Figma), not by that frame. So every icon fills its cell's glyph area (`box − 2.2 × pen`) on its longer side and is centred on the other.

- **Owner:** `src/lib/svgBuilder/inkbox.ts` `inkBoxOf` over the compiled nodes; `svgAsset.ts` `fitBoxOf` / `placementOf`.
- **Tight, not hull:** cubic and quadratic Béziers contribute their true extremes (derivative roots), arcs their exact cardinal extremes (`lib/upload/geom/arc`), never the control-point hull; uniform transforms are already folded in by the node compiler. A lone move draws nothing.
- **Strokes:** a line icon's sheet pen is constant px and already reserved by `box − 2.2 × pen`. A colored icon's own strokes scale with it, so half its widest own `stroke-width` (1 when a stroke has none) is added around its ink.
- **Fallbacks:** nothing measurable drawn (only `<use>`, empty groups) → the `viewBox`, as before. A zero-width or zero-height ink (one straight line) scales by its longer side.
- **Performance:** computed once per icon on the cold path and cached with its compiled nodes (`SANITIZED`); warm compositions are pure arithmetic as before. Measured 2026-11-24 on a 400-curve icon: cold 2.69 → 2.80 ms, warm unchanged; builder perf/export-speed budgets pass.
- **Source files are never rewritten:** the approved `.svg` files in the selected root stay as they are (the builder writes nothing into the root); the tight fit is applied when the sheet is composed, so the artboard, the editable SVG, PNG, JPEG and EPS all carry it.

Tests: `tests/svg_builder_inkbox.test.ts`; `tests/svg_builder_colored_icons.test.ts` (own pens scale with the tighter fit).
