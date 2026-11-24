# SVG builder — stage navigation, layout buttons, padding per side

Back to the [SVG builder contract](svg-builder.md).

## Figma-style navigation (2026-11-24)

Owners: `src/lib/svgBuilder/stagezoom.ts` (pure math), `src/svgBuilder/useStageNavigation.ts` (native listeners on `builder-canvas`).

- **Ctrl/⌘ + wheel** (or a trackpad pinch) zooms smoothly around the cursor: the artboard point under the pointer stays under it (`anchoredScroll`). One wheel notch ≈ 22 %, symmetric in and out; small trackpad deltas never stall. The browser's own page zoom is prevented (a non-passive native listener — React's wheel handler is passive).
- **Ctrl + Shift + wheel** steps through round percentages: 10 · 25 · 50 · 75 · 100 · 150 · 200 · 300 · 400 · 600 · 800 %. Windows reports a Shift-wheel in `deltaX`; both axes are read. A trackpad collects 50 px of travel per step.
- A **plain wheel** still scrolls the canvas and the artboard strip.
- **Middle mouse button held** = hand tool: the canvas scroll follows the pointer, cursor `grabbing` (`.bld-canvas.is-panning`). It is captured before any grip, so it never starts a resize/move, and Windows autoscroll is suppressed. Panning moves the canvas scroll, so it does something once the zoomed artboard overflows the stage (in Fit the whole artboard is already visible).
- Range 10–800 % everywhere: −/+ buttons, wheel, stored prefs (`clampStageZoom`, 0.001 precision). Any wheel zoom leaves Fit.

## Layout buttons on an open template (2026-11-24)

With a template or artboard open (`editingTemplateId` / `editingArtboardId`), Side banner / Top split / Plain grid / Line banner apply `applyPresetLayoutOnly`: only the banner type changes — `position`, `style`, `size`, `hero`, `divider` — and the text placement (`textPadding`, title/subtitle offsets and widths, `edgeSpread`) resets so the words are placed afresh. Every colour, the font family, text sizes, tracking, case, words, grid, icons and artboard stay the template's own. One undo entry. With nothing open the buttons still apply the full preset look.

## Padding per side (2026-11-24)

Owner: `src/lib/svgBuilder/padsides.ts` (`padOf`, `withPadSide`, `foldPad`, `parsePadSides`); `layout.ts` insets the icon area by each side's own value; `SvgBuilderEdgeHandles.tsx` grips; `SvgBuilderCustomize.tsx` boxes.

- The artboard keeps ONE `padding` until a single side is set; from then `artboard.padSides` holds `{top, right, bottom, left}` (each 0–160 px). Four equal sides fold back into `padding` with `padSides: null`, so presets, older templates and stored sheets without sides pad all four alike.
- **On the artboard:** a padding grip drags only its own side (badge `Pad left 26 px`); **holding Shift** at any moment of the drag sets all four to the dragged value (badge `Pad 26 px · all`). The side touching the banner has no grip. Each drag is one undo step.
- **Customize → Artboard:** **Pad** sets all four; **T / R / B / L** (`builder-pad-top` / `-right` / `-bottom` / `-left`) set one side each — the only way to the banner side.
- Saved with the look (templates, artboards, preset JSON) like every artboard value.

Tests: `tests/svg_builder_stage_nav.test.ts` (zoom math), `tests/svg_builder_workspace.test.tsx` (wheel/pan through Workbench), `tests/svg_builder_parity.test.ts` (layout-only preset), `tests/svg_builder_padsides.test.ts` + `tests/svg_builder_quickedit.test.tsx` (padding per side).
