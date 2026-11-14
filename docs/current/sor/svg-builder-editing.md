# SVG builder — template editing

Parent: [templates & presets](svg-builder-presets.md) · selectors: [templates & artboards selectors](../selectors/svg-builder-presets.md).

- **Unsaved template edits** (2026-11-14, `actions/leaveguard.ts`, `actions/leave.ts`, `SvgBuilderLeaveDialog.tsx`, `SvgBuilderStageActions.tsx`): while a template is edited and the sheet's look differs from its saved look (`templateChanged`), the stage shows **↺ Reset** (back to the saved look, one undo step) and **✓ Save template** beside ↻ Reshuffle; they vanish when the look matches again (e.g. after Undo). Opening another template, an artboard row or ＋ Artboard first asks **Save** (write back, then go on) / **Discard** (go on; the template keeps its saved look) / **Cancel** (stay, edits kept; also Escape). Closing the page with unsaved edits triggers the browser's leave prompt. The stage buttons are a little bigger (36 px).
