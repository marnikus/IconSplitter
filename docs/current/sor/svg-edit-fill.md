# Edit mode: Fill tool, colours and swatches (2026-11-27)

[Path editor](svg-path-editor.md) · [handles, layer order](svg-path-editor-handles.md) · [Alt+Shift cuts](svg-edit-cuts.md)

## Contract

| Rule | Where |
|---|---|
| Fill tool (`K`, 🪣): a click fills the closed area under it with the current colour — an area closed by several lines / fills, a piece of a fill cut off by a line, a hole in a fill, a closed line | `lib/pathedit/bucket.ts` `fillAt`, `planarface.ts` `cellAt` |
| A whole shape is recoloured in place (also a lone closed line, and a shape the tool added); any other area becomes a NEW filled shape of exactly that area, areas inside it left out as holes | `bucket.ts` `isWholeShape`, `loneLine`, `addCell` |
| A new shape sits just above what paints there, under everything when nothing does — lines stay on top; it is a root child `<path fill stroke="none">` in root units | `model.ts` `AddedFill`, `paintwrite.ts` `withPaint` |
| Fills live in the session's model (`PathModel.paint`, `.adds`): one undo step each, kept across point edits (`keepOrder`), part of "dirty" (`paintKey`) | `session.ts`, `objects.ts` |
| Finish writes: `fill` on a recoloured tag (its `style` too when a style / class could overrule), added shapes inserted; nothing else changes | `paintwrite.ts` |
| The artboard shows it live, in the saved order; undo puts a shape's own colour back | `svg/pathedit/livepaint.ts` |
| `Alt+click` (Fill tool) picks the colour under the pointer into the current colour; `Alt+Shift+click` also saves it as a swatch | `useEditFill.ts` `colorUnder` |
| Top bar: current colour over the second, swap (`X`), hex, six close colours (the SAME component as SVG builder's quick colour menu), saved swatches (`+` saves, right-click / Alt+click removes), ⌖ screen picker where the browser has `EyeDropper`, "Fill selected" | `EditColorBar.tsx`, `ui/SmartSwatches.tsx` |
| Colours and swatches are remembered on this device, validated on read (max 32) | `editcolors.ts`, `lib/pathedit/palette.ts` |

## Limits

- Shapes the tool adds are compared against the drawing WITHOUT them (their
  edges repeat existing ones); after a save they are ordinary shapes.
- A new shape cannot be reordered with Ctrl+] / [ until the edit is saved.
- Only fills are set; a line's colour is not changed by the tool.

## Handles and tests

`<id>-tool-fill`, `<id>-color`, `-color-fg`, `-color-bg`, `-color-swap`,
`-color-hex`, `-color-swatch-RRGGBB`, `-color-custom`, `-color-saved-RRGGBB`,
`-color-save`, `-color-screen`, `-color-fill-selected`.
Tests: `pathedit_fill_bucket.test.ts`, `svg_edit_fill_ui.test.tsx`.
