# Selectors — SVG builder templates, final artboards, usage (2026-11-13)

Parent: [SVG builder selectors](svg-builder.md) · behaviour: [templates & presets](../sor/svg-builder-presets.md).

## Saved templates (under the workspace, 2026-11-13)

| Testid | Element | Notes |
|---|---|---|
| `builder-templates` | window after `builder-workspace` | `builder-template-save` (＋ new / ✓ write back when editing), `builder-template-save-new`, `builder-template-stop`, `builder-template-zoom` (+ `-value`, shared ZoomSliderBase), `builder-template-editing`, `builder-templates-empty` |
| `builder-template-<id>` | one block (`is-active`, `is-checked`, `is-editing`) | `builder-templates-check-all`, `builder-templates-grid` (keys), `builder-template-check-<id>`, `builder-template-artboards-<id>`, `builder-template-add-artboard-<id>`, `builder-template-open-<id>` (picture = activate), `builder-template-preview-<id>` (img), `builder-template-name-<id>` (Enter/blur saves, Escape reverts), `builder-template-edit-<id>` ✎, `builder-template-remove-<id>` ✕ |

## Final artboards (under the templates, 2026-11-13)

| Testid | Element | Notes |
|---|---|---|
| `builder-artboards` | list window | `builder-artboards-hint`, `builder-artboards-check-all`, `builder-artboards-checked`, `builder-artboards-metadata`, `builder-artboards-remove`, `builder-artboard-close`, `builder-artboard-list` (keys), `builder-artboard-group-<templateId>` + `builder-artboard-add-<templateId>` |
| `builder-artboard-<id>` | row (`is-active`, `is-open`) | `builder-artboard-check-<id>`, `-preview-<id>`, `-name-<id>`, `-id-<id>`, `-meta-<id>`, `-exported-<id>`, `-remove-<id>` |
| `builder-artboards-meta-dialog` | metadata confirmation | `builder-artboards-meta-preview-<id>`, `-prompt`, `-skipped`, `-confirm`, `-cancel`, `-close` |

## Library tile use

| Testid | Element | Notes |
|---|---|---|
| `builder-cell-decline-<cell>` | 🗑 on an artboard icon | declines the item in Generate SVG; undoable |
| `builder-cell-use-<cell>` / `builder-toggle-usage` | artboard use index / # Used toggle | preview-only; `data-used`; pref `showUsage` |
| `builder-used-<assetId>` | tile badge (always, `is-zero` when unused) | `×N` saved use (exported artboards), `+M` on artboards whose use is not saved yet; the tooltip says both |
