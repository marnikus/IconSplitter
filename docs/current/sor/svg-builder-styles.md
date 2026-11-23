# SVG builder — icon styles (2026-11-23)

Parent: [SVG builder](svg-builder.md) · selectors: [templates & header](../selectors/svg-builder-presets.md) · [storage](storage/svg-builder.md) · [owners](owners/svg-builder.md).

An icon's **style** is read from its id (`lib/svgBuilder/iconstyles.ts`): the base line-stroke SVG of a row, or a style row registered in Generate SVG (`<base id>~colored_wiggle`, see [image styles](svg-styles.md)) — every approved style row is its own library icon.

## STYLES — which styles may be in sheets

- **Where**: the pinned header, right after ◈ Icons indexing — the shared checkbox dropdown (`ui/MultiSelect.tsx`, `builder-style-filter`): **All styles**, **Line stroke**, then every style the library has (*Colored wiggle* …); a checked style the library no longer has stays listed so it can be unchecked. Checked styles combine; all of them = All styles.
- **What it narrows** (`useBuilderComputed` `pickable`): the library list and its count (`6 / 10` while some are hidden; the eyebrow names the styles), every pick — Reshuffle, SEED, automatic placement, grid growth, top-up, the × refill and a new artboard's start icon — and the template pictures' sample. With nothing allowed, Reshuffle refuses and says why.
- **The current sheet**: icons of a style that is no longer allowed leave it at once — their cells stay, empty, their locks go — as ONE undo step (`actions/styles.ts`). Saved artboards are never changed (an open artboard's stage is its draft: ✓ Save keeps the change). Every approved icon still names, draws and prunes as before (`assets`), so unchecking a style never removes it from a saved artboard.
- **Remembered** in the builder prefs (`styles`, validated by `parseStyleFilter`: style names only, one as itself, nothing = all); not an undo step itself.
- Explicit names still resolve against every approved icon (preset JSON, Register): naming an icon places it.

## Line masthead

- `banner.style` `"line"` (2026-11-23, `lib/svgBuilder/bannerline.ts`): no banner colour — the canvas shows through, the words lie out as on a Solid banner (its rule and hero ring mix with the canvas) — and ONE separator line on the edge facing the grid, centred on it: `lineWidth` 0.5–12 px, `lineColor`. Set in Customize ▸ Banner ▸ Masthead **Line** (the Banner colour chip is hidden) and in the quick toolbar (*Separator line*: colour, ≡ width).
- The **Line banner** layout preset (after Plain grid): bottom, Line, dark words on a cream canvas, 7 × 3 without captions.

## Colored icons — strokes and fills apart

- **Drawn with their own paints** (`lib/svgBuilder/stylepaint.ts`, `svgAsset.ts`): an icon of a registered style is never forced stroke-only. Each drawable element gets its effective fill, stroke and stroke width written on itself (resolved through its groups and `style`, SVG defaults otherwise; colours as `#RRGGBB`), so a stroke stays a stroke and a fill stays a fill. Line-stroke icons are drawn exactly as before (stroke-only, the sheet's ink and pen). Library tiles show colored icons in their own colours.
- **The sheet's colored-icon settings** (`config.icons`, part of the look — templates, overrides, preset JSON): `coloredStroke` and `coloredStrokeWidth` change only stroke paints (the width in artboard px, like the outlined pen), `coloredFill` only fill paints; `""` / `0` = every icon's own. Set in Customize ▸ Icon style ▸ **Colored icons** (`SvgBuilderColoredStyle.tsx`, shown when the library has colored icons or a setting is in use) and in the colored-icon quick toolbar ([quick edit](svg-builder-quickedit.md)); each change is one undo step, ↺ puts the icons' own paint back.
- **Banner icon**: a colored hero takes the banner's ink and Icon stroke on its strokes; its fills stay its own (or `coloredFill`).
