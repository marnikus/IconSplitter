# Preview stroke width on "SVG to upload" — the same control, reused

2026-10-19 · status: implemented the same day (TDD: `tests/upload_preview_stroke.test.tsx`).

## 1. The request

> "transform this and reuse code to implement same feature in SVG to upload."

"This" is the Generate SVG tab's preview stroke width
([plan](../2026-10-19-svg-preview-stroke/README.md)): a STROKE field
(0–50 px or "default") and Reset in the bulk bar. It draws every SVG thumbnail
with one stroke width, in screen px. It is preview only, through one shared
stylesheet.

## 2. What blocks a straight copy (verified)

- `svg/strokesheet.ts` is a **module singleton**. Both tabs stay mounted, so
  sharing it would make one tab's width repaint the other tab's thumbnails.
- `PreviewStroke` hard-codes the `svg-stroke…` test ids and the singleton.
- `SvgPreviewBox` takes `strokeOverride: boolean`, which means "adopt THE sheet".
- The Upload tab already reuses `SvgPreviewBox` (in `UploadPreview`), the bulk-bar
  look (`svg-bulk`, `svg-btn`), the PREVIEW BG pattern and a prefs store shaped
  like the SVG one.

## 3. Transform, then reuse

1. **`svg/strokesheet.ts` → a factory.** `createStrokeSheet()` returns
   `{ apply(px), adopt(root) }`, each with its own `CSSStyleSheet`.
   `SVG_STROKE_SHEET` and `UPLOAD_STROKE_SHEET` are the two instances, one per
   tab. The rule still comes from `lib/previewstroke`.
2. **`SvgPreviewBox`:** `strokeOverride: boolean` becomes
   `strokeSheet?: StrokeSheet`, the sheet the preview adopts. Without it the
   preview shows real widths (the dialogs).
3. **`PreviewStroke`:** new props `sheet` and `idPrefix` (`"svg"` | `"upload"`).
   The test ids become `{prefix}-stroke`, `{prefix}-stroke-value` and
   `{prefix}-stroke-reset`; the Generate SVG ids are unchanged.
4. **Upload wiring**, the same five steps as the SVG tab:
   - `UploadPrefs.previewStroke` (parsed with `parseStoredStroke`);
   - model `stroke` and action `stroke`;
   - `setStroke`;
   - persistence in `usePersist`;
   - `UploadBulkBar` renders `PreviewStroke` (prefix `upload`) after PREVIEW BG;
   - `UploadPreview` passes `UPLOAD_STROKE_SHEET`.

No new CSS: `.svg-stroke` already styles the control.

## 4. Steps

1. Failing tests, `tests/upload_preview_stroke.test.tsx`:
   - the control sits in the Upload bulk bar, at default;
   - a width restyles the Upload row previews (adopted sheet, shadow HTML and
     files untouched);
   - Reset and the word "default" bring back the real widths;
   - the width survives a remount;
   - the two tabs' sheets are independent.
2. The transform (factory, prop, ids), with the SVG tab's tests still green.
3. The Upload wiring.
4. Docs: an Upload selector row, the test index, the ledger; gates; commit;
   push.

## Superseded (2026-10-19, same day)

The Upload tab's STROKE became the export stroke width itself, shown by a live
export preview ([upload-default-settings](../2026-10-19-upload-default-settings/README.md)).
`UPLOAD_STROKE_SHEET` and the Upload `previewStroke` pref were removed. The
`createStrokeSheet` factory and Generate SVG's preview-only control stay.
