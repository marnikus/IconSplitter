# Selectors — SVG builder templates, final artboards, usage (2026-11-13)

Parent: [SVG builder selectors](svg-builder.md) · behaviour: [templates & presets](../sor/svg-builder-presets.md).

## Saved templates (under the workspace, 2026-11-13)

| Testid | Element | Notes |
|---|---|---|
| `builder-templates` | window after `builder-workspace` | `builder-template-save` (＋ new / ✓ write back and finish when editing), `builder-template-save-new` (only while editing), `builder-templates-remove` (✕ Remove (N): checked templates, else checked artboards in view; 2026-11-22), `builder-template-zoom` (+ `-value`, shared ZoomSliderBase), `builder-template-editing`, `builder-templates-empty` |
| `builder-template-<id>` | one block (`is-active`, `is-checked`, `is-editing`) | `builder-templates-check-all`, `builder-templates-grid` (keys), `builder-template-check-<id>`, `builder-template-artboards-<id>`, `builder-template-add-artboard-<id>`, `builder-template-open-<id>` (picture = select and open for editing), `builder-template-preview-<id>` (img), `builder-template-name-<id>` (Enter/blur saves, Escape reverts) ✎, `builder-template-remove-<id>` ✕ |

## Final artboards (under the templates, 2026-11-13)

| Testid | Element | Notes |
|---|---|---|
| `builder-artboards` | list window | `builder-artboards-hint`, `builder-artboards-check-all`, `builder-artboards-checked`, `builder-artboards-metadata`, `builder-artboards-rename` (✎ Rename for upload, [upload-rename.md](../sor/upload-rename.md)), `builder-artboards-reset-look` (↺ Template (N), 2026-11-23), `builder-artboards-remove`, `builder-artboard-close`, `builder-artboard-list` (keys), `builder-artboard-group-<templateId>` + `builder-artboard-add-<templateId>` |
| `builder-artboard-<id>` | row (`is-active`, `is-open`) | `builder-artboard-check-<id>`, `-preview-<id>`, `-name-<id>`, `-id-<id>`, `-upload-name-<id>`, `-meta-<id>`, `-exported-<id>`, `-remove-<id>` |
| `builder-artboards-meta-dialog` | metadata confirmation | `builder-artboards-meta-preview-<id>`, `-prompt`, `-skipped`, `-confirm`, `-cancel`, `-close` |

## Library tile use

| Testid | Element | Notes |
|---|---|---|
| `builder-quick` (`data-kind`) | hover toolbar on the artboard | `builder-quick-color`, `-stroke`, `-text`, banner icon `-ring` → `builder-quick-ring-panel` (`builder-quick-ring-stroke`, `builder-quick-ring-size`), `-scale` → `builder-quick-scale-panel` (`builder-quick-both`, `builder-quick-hero-size`, `builder-quick-ring-size`); panels `builder-quick-color-panel` (`builder-quick-swatch-<hex>`, `builder-quick-custom`, `builder-quick-hex`, `builder-quick-done`), `builder-quick-stroke-range(-panel)`, `builder-quick-text-panel` (`builder-quick-face`, `builder-quick-size`), `builder-quick-move` → `builder-quick-move-frame` (`-left`, `-right`, `-top`, `-bottom`, `-body`, `-badge`, `-apply`) |
| `builder-hero-style` | hero style (under Hero glyph) | `builder-hero-both`, `builder-hero-scale`, `builder-hero-stroke`, `builder-ring-scale`, `builder-ring-stroke` |
| `builder-toggle-guides` / `builder-guide-opacity` / `builder-guides` | ▦ Guides, opacity slider, overlay svg | `data-guide` = column, row, padding, banner, cell, icon |
| `builder-cell-decline-<cell>` | 🗑 on an artboard icon | declines the item in Generate SVG; undoable |
| `builder-cell-use-<cell>` / `builder-toggle-usage` | artboard use index / # Used toggle | preview-only; `data-used`; pref `showUsage` |
| `builder-used-<assetId>` | tile badge (always, `is-zero` when unused) | `×N` saved use (exported artboards), `+M` on artboards whose use is not saved yet; the tooltip says both |
| `builder-banner-style-line` | Customize ▸ Banner ▸ Masthead Line (2026-11-23) | `builder-banner-line-color`, `builder-banner-line-width` (the `builder-banner-bg` chip hidden); separator on the sheet: `data-banner-line` |
| `builder-stage-actions` | stage top-right | `builder-stage-template-reset`, `builder-stage-template-save` (only with unsaved template edits), `builder-stage-template-save-new` (＋ Save as new template: whenever a template or artboard is on the stage; 2026-11-23), `builder-stage-artboard-reset`, `builder-stage-artboard-save` (only with unsaved artboard edits), `builder-reshuffle-stage` |
| `builder-leave-dialog` | Save changes to the template? | `builder-leave-save`, `builder-leave-discard`, `builder-leave-cancel` |
| `builder-edge-banner`, `builder-edge-pad-{left,right,top,bottom}`, `builder-edge-size-{right,bottom,corner}` | artboard edge grips | `builder-edge-badge` while dragging |
| `builder-gap-x-<cell>`, `builder-gap-y-<cell>` | gap strips (guides on) right of / below that cell | `builder-gap-badge` while dragging |
| `builder-artboard-reset-<id>` | artboard row, only with own look changes | ↺ Template N: inherit the whole template look again |
| `builder-editing` (`data-kind` artboard / template) | stage top-left label | `builder-edit-main-template` (while an artboard is open); `builder-editing-prev-template` / `builder-editing-next-template` ◀ ▶ (← → keys; ↑ ↓ walk the artboards, 2026-11-23) |
| `builder-export-selected` | header, beside Export | ⇪ Export all selected (checked artboards, else the open one) into `_artboard_sheets`; shows live `done/total (N left)` while running |
| `builder-progress-mount`, `builder-export-progress-*` | top-of-shell progress mount | live artboard export `ProcessProgressBar`: `-header`, `-title`, `-file`, `-track` (`progressbar`), `-completed`, `-remaining`, `-percent`, `-cancel`, `-review`, `-dismiss`, `-icon` |
| `builder-quick-merge-mark` | quick toolbar ⊞ on an icon (2026-11-23, [big icons](../sor/svg-builder-big-icons.md)) | `aria-pressed`; marked cell `builder-cell-{slot}` gets `.is-marked`, a big one `.is-big`; on a big icon `builder-quick-merge-stroke` → `builder-quick-merge-stroke-panel` (`-range`, `-own`), `builder-quick-merge-break` |
| `builder-colored-icons` | Customize ▸ Icon style ▸ Colored icons (2026-11-23) | `builder-colored-stroke`, `builder-colored-width` (+ `-value`), `builder-colored-fill`; each `…-own` resets to the icons' own; quick toolbar `builder-quick-fill`, `builder-quick-own` (+ `-note`), `builder-quick-stroke-range-own` |
| `builder-style-filter` (+ `-menu`, `-opt-all`, `-opt-base`, `-opt-<style>`) / `builder-library-styles` | header, after Icons indexing / library eyebrow | STYLES: which icon styles may be in sheets ([icon styles](../sor/svg-builder-styles.md), 2026-11-23) / the checked styles' names |
| `builder-register` / `builder-auto-register` | header, beside Icons indexing | 🗂 Register templates and artboards (new folders + files edited outside the app, 2026-11-22) / the after-every-scan switch |
| `builder-artboard-meta-fields-<id>` | under the active artboard row | the upload editor `upload-meta-{title,description,tags,accept,regen,state}-<id>`; row button `builder-artboard-regen-<id>` |

## Padding per side (2026-11-24)

| Handle | Element | Contract |
|---|---|---|
| `builder-pad-sides` > `builder-pad-top` / `-right` / `-bottom` / `-left` | Customize → Artboard number boxes | one side each ([per side](../sor/svg-builder-stage.md#padding-per-side-2026-11-24)) |
| `builder-edge-pad-<side>` | artboard padding grip | drags its own side; Shift held = all four; badge `builder-edge-badge` |
