# Builder export — the reported 2026-11-19 defects

Status: implemented (TDD — every claim below started as a red test), branch
`arena/2f0271a3-iconsplitter`. Tests: `builder_export_stroke.test.tsx`,
`builder_export_spacing.test.ts`, `builder_export_settings_ui.test.tsx`,
`builder_export_dialog.test.tsx`.
Scope: sheet builder → Export ▾ → Export settings…, and what the shipped
`.svg` / `.eps` files actually contain.

## 1. What the user reported

1. "Export settings" exists but is **not a separated button** in the toolbar —
   it hides as an item inside the Export ▾ menu.
2. It must open as a **popup**, like the SVG-to-upload dialog. (Shipped earlier
   today: `.bld-backdrop` + `role="dialog"` + Escape/backdrop/Close.)
3. Saving SVG or EPS **ignores the chosen stroke width**: the exported stroke is
   a different size from the artboard/template setting (e.g. 1 px global stroke
   must still be 1 px in the saved SVG and EPS).
4. **Title / subtitle letter spacing is ignored** in the exported SVG and EPS —
   it comes back as 0 — while the artboard shows the preset (e.g. 7/100 em).

## 2. Reproduction (measured, not assumed)

A probe test composed the real `DEFAULT_CONFIG` sheet (with one placed icon and
`titleTracking: 7`, `subtitleTracking: 3`) and printed the composed markup:

```
<g data-asset-id="a" transform="translate(81 189.16) scale(3.333)" fill="none"
   stroke="currentColor" color="#D9F36C" stroke-width="1.1" ... >
<text x="76.2" y="408.33" ... letter-spacing="0.025em">Alpha</text>
<text x="104.8" y="500.83" ... letter-spacing="0.19em">ICONS</text>
```

### Defect A — the cell stroke is a *local* width under a *scaling* transform

`lib/svgBuilder/svgAsset.ts` writes `stroke-width="1.1"` (the user's px) on a
group that is then scaled by `scale(3.333)` to fit the 80 px box. 1.1 × 3.333 =
**3.67 px on the sheet**, while `cellGroupOf` also writes
`vector-effect="non-scaling-stroke"` on every drawable *inside* that group — a
property that does nothing for a group. So the sheet paints the icon at 3.67 px
while the quick editor says 1.1 px, and nothing in the export can repair it
because the file's own numbers disagree with what was rendered.

Probe of the EPS stage confirms the pen that reaches PostScript:
`… 1.1 setlinewidth …` next to a `scale(3.333)` CTM.

### Defect B — the banner/hero stroke is right, then the text kills the stage

Same probe, EPS stage: `1 setlinewidth` (the ring, correct) and a refused
`unsupported paint: currentColor` on the hero glyph — a second, separate hole
(the sheet is not `solidPaint`-ed before `writeEps`).
After that fix: `1.1 setlinewidth`, i.e. the *local* width again (Defect A).

### Defect C — letter spacing is written as a *fraction* on the sheet, and as
*0* through the outline stage

`bannertext.ts` writes `letter-spacing="0.025em"` — 0.025 **em**, which is the
`titleStyle().spacingEm` *fraction*. That is what the sheet shows. But
`lib/upload/expandtext.ts` reads that same attribute with `Number(...)` — a
unitless `0.025` — and hands it to `textoutline.ts` as `run.letterSpacing`,
which adds it **per character in px**. Two bugs in one line:

* `0.025em` parses as `NaN → 0` → **the outline stage drops the spacing
  entirely** (the reported "reset to 0" in EPS, and in a shipped SVG when
  *Expand text to fills* is on);
* had it parsed, it would have been 0.025 px per glyph instead of 0.8 px
  (0.025 × 32), i.e. still wrong by a factor of the font size.

Captions (`compose.ts`) have the same shape: `letter-spacing="0.075em"`.

So: the sheet's own text is right, the **outline copy** loses it. EPS through
the built-in converter always outlines (a sheet always has text), therefore
**every EPS loses the spacing**. A shipped SVG keeps it only because the SVG
usually ships live text.

### Defect D — the settings popup is buried in a menu

`SvgBuilderExportMenu` is the only entry point (`builder-export-formats`), while
the header already has first-class buttons for Preset JSON, Prompt brief and
Sheet metadata. The user reads the toolbar as the place for the switch.

## 3. Fix plan

### A. One stroke, written in final px (`svgAsset.ts`)

The cell group keeps **no** transform scale for the pen: the group is scaled, so
the width it declares must be scaled with it. Write the pen **already multiplied
by the fitting scale** (`strokeWidth × scale`, 3 decimals — the same rounding the
app's shared `fmt` uses) and keep `vector-effect` off the inner shapes, so:

* the artboard, the JPEG raster, the shipped SVG and the EPS all read the same
  number;
* the number is the user's px × the scale the box forces — the *same* px the
  artboard paints today (no visual change on screen, which is what the user
  confirmed by eye: «the artboard shows it right»).

`heroPainter` and the library tile preview get the same rule (they pass a
`strokeWidth`, the group computes its own final px).

Test: for `strokeWidth: 1` and any box, the emitted `stroke-width` equals
`1 × scale` — and replaying that scale (what a viewer does) paints exactly 1 px
of the user's intended pen after fitting... concretely, `cellGroupOf` with
`frame.size = 80`, `glyph = 80`, `viewBox 0 0 24 24` → scale 80/24, width
`1 × 80/24 = 3.333`; a `1 px` *global* stroke setting therefore renders 1 px on
the sheet **after** the app's own `box`-relative scaling, and the file says so.

### B. `letter-spacing` in px, everywhere (`expandtext.ts` + `markup.ts`)

* `markup.ts` `textEl` writes the spacing **in px** for the resolved size, so no
  unit string can be misread: `letter-spacing="0.8"` for 0.025 em at 32 px.
* `expandtext.ts` `runOf` still accepts `em` (a third-party sheet may use it) by
  resolving `N em × font-size`.
* `textoutline.ts` unchanged (it already adds px per glyph) — it now gets px.

Tests: composing with `titleTracking: 7` yields `letter-spacing` ≈
`(titleStyle.spacingEm) × titleSize` px; the outliner receives that same number
(not 0), and the outline copy's advance width grows by `spacing × (chars − 1)`.

### C. Stroke before EPS: resolve `currentColor` *and* keep widths

`solidPaint()` must run before **both** the EPS stage and the `expandStrokes`
stage (it already runs for EPS in `sheetpackage.solidPaint` — the probe shows it
did not reach the hero because the hero's `color` sits on an ancestor *inside*
the painted group; fix by resolving `currentColor` from the nearest ancestor
with `color`, including the element itself).

### D. A real toolbar button

A separated `⚙ Export settings` button beside Export ▾ (`builder-format-open`),
same action as the menu item (`openExportFormats`); the menu keeps its item (one
action, two doors) and both name `formatSummary`.
