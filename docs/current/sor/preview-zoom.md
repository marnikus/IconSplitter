# Preview zoom — Ctrl+Shift + scroll (2026-11-06)

[Path editor](svg-path-editor.md) · [Generate SVG](svg-generation.md) · [SVG to upload](upload.md)

**Ctrl+Shift + scroll** over an SVG preview zooms the artwork **10 %–400 %**
(×1.1 per notch) toward the pointer — the point under it stays put — inside a
frame that keeps its size. A small **"n% ↺ 100%"** button appears in the
frame's corner while zoomed and resets. A plain scroll still scrolls the page;
the zoom scroll neither scrolls nor zooms the page.

| Where | How |
|---|---|
| Generate SVG row previews, SVG to upload row previews (and any dialog drawing an SVG) | `svg/SvgPreview.tsx` wraps the shadow host in `.svg-zoom-box` |
| The edit mode's artboard (anchors and hit areas stay the same screen size; the overlay redraws on zoom) | `svg/pathedit/useEditMode.ts`, `SvgPathEditor.tsx`; legend entry in `hotkeys.ts` |
| The rule: `zoomAt` (clamped, pointer-anchored), `zoomTransform`, `isZoomed` | `lib/zoomview.ts` |
| One hook (non-passive wheel listener) and one reset button | `ui/usePreviewZoom.ts`, `ui/ZoomReset.tsx` |

Handles: `<preview testid>-zoom` (e.g. `svg-prev-<id>-zoom`, `upload-prev-<id>-zoom`,
`svg-edit-<id>-zoom`). Tests: `preview_zoom.test.tsx`.
