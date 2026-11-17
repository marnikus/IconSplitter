# Single sheets — current behaviour

See [invariants/core.md](invariants/core.md), [sheet selectors](../selectors/sheets.md), [storage](STORAGE.md), and [test owners](TESTS.md).

## Behaviour

Single sheets:

* Drop or choose image files (PNG/JPG/WEBP). Non-images are filtered with a message.
* Each sheet is analyzed (background colour, ink mask, threshold) and icons are
  detected automatically; merge distance is adjustable per sheet with an auto default.
* Each sheet row has a checkbox (RULE 25 gestures, header tri-state, Up/Down, E/Q).
  New sheets start **checked**. A checked sheet is exported, and a merge-distance
  change made while the active sheet is checked applies to **every checked sheet**;
  on an unchecked active sheet it applies to that sheet only.
* Merge distance is shown as % of the sheet's longest side (2 decimals, ≈ px) and
  can be set by slider or typed (0–15 %, commit on Enter/blur, empty = auto).
* Detected boxes render over the sheet preview; clicking a box toggles exclude/include.
  The result grid shows **every** detected icon: clicking its image or checkbox
  toggles exclusion; excluded icons stay visible, dimmed and labelled.
* Export: every included icon of every checked sheet becomes a centred square
  (largest icon side + padding %), optionally transparent, optionally fixed size;
  delivered as ZIP or folder save (one sub-folder per sheet when several), or
  single-icon copy / save. There is no separate "Download files" button.

## State

One in-memory model, owned by `App`:

```
sheets: Sheet[]       Sheet = { id, name, base, url, img, an: Analysis,
                                boxes: Box[], autoFrac, usedFrac, manual,
                                excluded: number[] }
sel: RowSelection     { checked: id[], active, anchor } — export + merge targets
padding, size, transparent   export options (ExportOpts)
busy: string | null   progress surface (RULE 5)
toast: {msg, err}     honest reporting surface (RULE 2, RULE 4)
```

Detection state transitions per sheet: `loaded → analyzed → detected(auto) →
[redetected(manual frac)…]`. `excluded` is a flag set over intact `boxes`
(RULE 11); only sheet removal destroys detection work.

## Flow

Single sheets:

* **Add sheets:** files → filter non-images → `loadImage` → `analyze` →
  `detect(an, null)` → sheet appended, first becomes active.
* **Review:** preview grid + SVG boundary overlay (`box-toggle-{i}`), merge
  slider / typed % re-runs `detect` on `mergeTargets` with a manual fraction,
  `merge-reset` returns them to auto. An older detect result never overwrites a newer one.
* **Export checked:** `collectIcons()` loops checked sheets × included boxes →
  `renderIconAsync` → `canvasToBlob` (RULE 15 gate) → ZIP / folder handles;
  `busy` reports `Rendering d/t…` per item (RULE 5); a failed icon is skipped,
  counted in the result toast, and never aborts the other sheets.
* **Single icon:** copy to clipboard or download one rendered blob.

`src/sheets/useSheetsModel.ts` owns the model; `src/sheets/sheetsExport.ts` the export loop; `src/sheets/importSheets.ts` owns the real import/decode/detection loop and per-image failure isolation; App supplies the state sinks. Imports and exports use the [shared completion cue](process-progress.md#completion-sound-on-every-tab), independent of the visible tab.
