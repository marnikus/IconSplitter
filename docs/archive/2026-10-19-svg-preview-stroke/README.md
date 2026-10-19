# Preview stroke width — try one stroke on every SVG thumbnail

2026-10-19 · status: implemented the same day (TDD: `tests/svg_preview_stroke.test.tsx`).

## 1. The request

> "add to the pinned bar new control — the preview stroke width. The user can
> set from default to any width of the stroke. If this is changed from default
> it will rewrite all stroke widths in all previews in SVG thumbnails … all
> thumbnails now have one same stroke as the user sets. The SVG file itself has
> no influence, only visible by the user in thumbnails. Well performance
> support for this feature. As user sets back to default the strokes are set
> back to the real width of each SVG file individually."
> Control: a field with 0.0 px – 50 px or the word "default", and a "reset" button.

So: a **preview-only** setting, like PREVIEW BG. Saved SVG files, their code,
Copy and the pair files never change.

## 2. What exists today (verified)

- The pinned bar (`SvgBulkBar`, inside `.svg-bulkbar-pin`) already holds two
  preview settings: PREVIEW BG and ZOOM. Both persist in
  `iconSplitter.svg.prefs.v1` (`svg/prefsstore.ts`) through the model
  (`statemodel` actions `bg`/`thumb`) and `ctx.useSvgPersist`.
- Every row's SVG preview is `SvgPreviewBox` → `ShadowSvg`. The sanitized
  document is painted into its **own shadow root** with `PREVIEW_CSS`
  (`lib/svgpreview`), so app CSS cannot reach the artwork.

## 3. Design

- **Meaning of the value:** the stroke width in the document's own units
  (`stroke-width: Npx` inside the SVG = N user units). It is exactly what the
  file would look like if every `stroke-width` were set to N, so the preview
  stays honest across zoom levels.
- **How it is applied (performance):** ONE shared constructable stylesheet
  (`svg/strokesheet.ts`) adopted by every row preview's shadow root
  (`adoptedStyleSheets`). Changing the value is one `replaceSync` on that sheet:
  - no SVG is re-parsed or re-serialized, no shadow `innerHTML` is rewritten;
  - no row re-renders (rows do not receive the value as a prop);
  - the browser restyles all previews at once.
  Default = the sheet is empty, so each document's own widths show again.
- **The rule:** `svg, svg * { stroke-width: Npx !important }`. `!important`
  beats presentation attributes, inline `style` and the document's own
  `<style>`. Elements without a stroke paint nothing extra.
- **Scope:** row thumbnails only. The Versions and Code dialogs keep the real
  widths (they show what a version is), and so does the Upload tab.
- **Control** (pinned bar, after PREVIEW BG): label `STROKE`, a text field
  (`inputMode="decimal"`) with placeholder `default`, a `px` suffix, a value
  readout and a **Reset** button.
  - Empty or the word `default` → default. A number → clamped to 0–50 and
    rounded to 0.1. Anything else → `aria-invalid`, the last valid value stays.
  - Reset → default; disabled while already default.
  - On blur the field shows the applied value.
- **Persistence:** `previewStroke: number | null` in the SVG prefs, parsed on
  read (RULE 13): a bad stored value is default.

## 4. Steps

1. `lib/previewstroke.ts`: range constants, `clampStroke`, `parseStrokeInput`,
   `parseStoredStroke`, `strokeLabel`, `strokeCss`.
2. Failing tests `tests/svg_preview_stroke.test.tsx`:
   - lib parsing;
   - the control sits in the pin, default + Reset disabled;
   - typing a width makes every row preview adopt the sheet with the rule, while
     shadow HTML and saved files stay byte-identical;
   - Reset empties the sheet;
   - invalid text is flagged and changes nothing;
   - the value survives a remount;
   - the Versions dialog preview does not adopt the sheet.
3. `svg/strokesheet.ts` (the one sheet, `applyPreviewStroke`).
4. `SvgPreviewBox` gains an optional `strokeOverride` flag; `SvgThumbs` sets it.
5. Model/prefs: action `stroke`, `ViewPrefs.stroke`, `setPreviewStroke`, persist.
6. `SvgBulkBar` → `PreviewStroke` control (it applies the sheet in an effect).
7. CSS for the control; selector rows; test index line; ledger entry; gates;
   commit and push.

## 5. Out of scope

- Writing a stroke width into files (an export feature, not a preview).
- Non-scaling (screen-pixel) strokes.
