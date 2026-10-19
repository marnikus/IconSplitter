# SVG to upload — "default" for every visual export setting, live export preview, one stroke

2026-10-19 · status: implemented the same day (TDD: `tests/upload_default_settings.test.ts`,
`tests/upload_live_preview.test.tsx`).

## 1. The request

> "The settings change the icon's artboard colour and stroke as it exports. Add
> 'default' to all parameters, meaning: do not change anything and export the
> exact SVG as it was. If stroke, background, artboard size and aspect ratio or
> padding were changed, show it in a live preview. A big or small size changes the
> export but stays scaled to the thumbnail (no giant or tiny thumbnails at 2048 or
> 16 px), while a changed aspect ratio does show. The export setting stroke and
> the bar's stroke are one param: keep only the bar control."

## 2. What is there (verified)

- `lib/upload/settings`: padding % (default 8), background (`transparent` | hex),
  `strokePx` (0 = leave the artwork's own widths, max 32), `strokeColor`
  (`artwork` | hex, default `#000000`), artboard (`content` | preset | custom).
- `lib/upload/prepare` always cleans, bakes and re-fits the artwork into a padded
  frame. It always inserts an artboard rect, even when transparent
  (`fill="none"`), so the export never equals the source.
- The row preview (`UploadPreview`) shows the approved source. The bar's STROKE
  is a preview-only CSS override (`UPLOAD_STROKE_SHEET`), not the export
  setting. Two stroke params, one of them a lie about the export.

## 3. Design

**One "default" per visual parameter = that aspect is left as the source has it.**

| Parameter | Default value | Meaning |
|---|---|---|
| Stroke width | `strokePx` 0, shown as `default` | every stroke keeps its own width (already the 0 meaning) |
| Stroke colour | `artwork`, now labelled **Default** | every stroke keeps its own paint |
| Background | new sentinel `default` | no artboard rect at all (`transparent` still adds the invisible artboard object) |
| Artboard | new mode `source`, **Default (the SVG's own)** | the source's own viewBox size and aspect ratio |
| Padding | `paddingPct: null`, **default** | the source's own margins: its viewBox is what gets fitted, not the visible bounds |

- **Combinations follow from one rule.** The frame being fitted is the source
  viewBox when padding is default, else the measured artwork plus N %. The
  target is the source viewBox size when the artboard is default, else as
  before.
  - Default padding is a single placement pass. There is no settle loop, because
    the margins are the source's.
- **All five default and Expand strokes off = *as is*.** The export SVG is the
  approved source byte for byte:
  - no clean, no bake, no SVGO (the Optimize checkbox says it is skipped in this mode);
  - the JPEG renders it and the EPS converts it;
  - metadata, when there is any, is still embedded, as for every package.
  - `prepare` reports `asIs: true`; the record keeps `svgo.enabled: false`.
- **Fingerprints:**
  - the factory defaults and every existing value keep their fingerprint
    (`36232c04` unchanged);
  - padding `null` fingerprints as `"default"`;
  - the new background and artboard values are new strings.
- **Factory defaults are unchanged.** "default" is a choice in every row.
  A dialog button, **All default (export as is)**, sets the five at once
  (one change; undoable in the icon scope).

**One stroke.**
- The bar's STROKE field *is* the global `strokePx`:
  - `default` / empty / 0 = the artwork's own;
  - range 0–50 (export `STROKE_MAX` 32 → 50, the bar's range).
- The dialog loses its stroke-width row.
- A per-icon `strokePx` override is no longer read: one value, in the bar.
- The Upload tab stops using the preview-only sheet. The live preview shows the
  real export, in file px.
- The old `previewStroke` pref is no longer written or read on this tab. Generate
  SVG keeps its preview-only control.

**Live preview.**
- A row whose effective settings are not *as is* previews
  `prepareExportSvg(source, effective).svg`, the exact export text, so stroke,
  background, artboard, ratio and padding all show.
- Results are cached per (path, version, settings fingerprint, stroke colour,
  background), and each row recomputes after a short debounce, so typing in
  STROKE never blocks the list.
- When preparation fails, the row shows the source plus a one-line reason
  (`upload-prev-note-{id}`).
- The thumbnail box fits the artboard's aspect ratio inside the zoom square:
  - the long side = zoom, so 2048×2048 and 16×16 both draw at the zoom size;
  - a 2:1 artboard draws zoom × zoom/2.

## 4. Steps

1. Failing lib tests (`upload_default_settings.test.ts`):
   - parse and round-trip `null` padding, `default` background and `source` artboard;
   - the stroke max is 50;
   - per-icon `strokePx` is ignored;
   - fingerprints are stable and the new values are distinct;
   - all default gives the source byte-exact;
   - stroke only keeps the source viewBox, with no rect;
   - background default with padding N works;
   - artboard source with padding N works.
2. `settings` / `artboard` / `prepare` / `place` changes; `exportstages` skips
   optimize and enforce for *as is*.
3. Failing UI tests (`upload_live_preview.test.tsx`):
   - the bar's STROKE writes the export `strokePx` and the preview shows the
     export (`stroke-width`);
   - a pinned 2:1 artboard gives a 2:1 thumbnail at full zoom width;
   - 16×16 and 2048 give the same box;
   - all default previews the source;
   - the dialog has default choices and no stroke row.
4. UI: the dialog rows, the bar wiring and the preview. Then docs (settings,
   selectors, tests, ledger), the gates, commit and push.
