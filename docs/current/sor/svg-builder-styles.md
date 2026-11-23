# SVG builder — icon styles (2026-11-23)

Parent: [SVG builder](svg-builder.md) · selectors: [templates & header](../selectors/svg-builder-presets.md) · [storage](storage/svg-builder.md) · [owners](owners/svg-builder.md).

An icon's **style** is read from its id (`lib/svgBuilder/iconstyles.ts`): the base line-stroke SVG of a row, or a style row registered in Generate SVG (`<base id>~colored_wiggle`, see [image styles](svg-styles.md)) — every approved style row is its own library icon.

## STYLES — which styles may be in sheets

- **Where**: the pinned header, right after ◈ Icons indexing — the shared checkbox dropdown (`ui/MultiSelect.tsx`, `builder-style-filter`): **All styles**, **Line stroke**, then every style the library has (*Colored wiggle* …); a checked style the library no longer has stays listed so it can be unchecked. Checked styles combine; all of them = All styles.
- **What it narrows** (`useBuilderComputed` `pickable`): the library list and its count (`6 / 10` while some are hidden; the eyebrow names the styles), every pick — Reshuffle, SEED, automatic placement, grid growth, top-up, the × refill and a new artboard's start icon — and the template pictures' sample. With nothing allowed, Reshuffle refuses and says why.
- **The current sheet**: icons of a style that is no longer allowed leave it at once — their cells stay, empty, their locks go — as ONE undo step (`actions/styles.ts`). Saved artboards are never changed (an open artboard's stage is its draft: ✓ Save keeps the change). Every approved icon still names, draws and prunes as before (`assets`), so unchecking a style never removes it from a saved artboard.
- **Remembered** in the builder prefs (`styles`, validated by `parseStyleFilter`: style names only, one as itself, nothing = all); not an undo step itself.
- Explicit names still resolve against every approved icon (preset JSON, Register): naming an icon places it.
