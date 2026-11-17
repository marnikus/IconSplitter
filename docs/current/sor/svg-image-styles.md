# AI-source image styles — current behaviour

A **style** is another look of the same icon: a folder `_<style>` beside the
pair's files holding images of that look, each with its own SVG history. The row
can show it beside the base line-stroke artwork and generate, review, edit and
delete in it exactly like the base style. Handles:
[styles selectors](../selectors/svg-image-styles.md); registration of plain
images beside a pair: [AI-source image edits](svg-image-edits.md).

## Names, ids and the registration

* A folder is a style folder when it is `_<words>` (`_colored_wiggle`) —
  `lib/svgstyles.styleOfFolder`, shared with the SVG pass.
* Inside it, the images of a row are named after the row's own stem
  (`<base stem>` = `download-icon-31_AI_03`):
  `<stem>[_vN]_<style>.png` is the style's own image and
  `<stem>[_vN]_<style>_<NN>.png` are its **variants** — only those are
  registered (`styleFilesOf`). The style name is the LAST suffix and may be
  several words; the style image may carry the row's own image version (`_v2`).
* **◐ Register styles (N)** (2026-11-16, `svg/styles.ts`) reads every selected
  row's `_<style>` folders once and writes the style's own pair file —
  `<base dir>/_<style>/<style image stem>.svg.json` (`styleMetaPathOf`) — whose
  id is **`<base row id>~<style>`** (`styleRowId`). The variants become that
  file's `imageVersions` (version = `_NN`, never a second entry for a file it
  already records: `variantVersions`), the first one becomes `imagePreferred`,
  and the row's approval is inherited until the style has its own.
* Registration and loading agree on ONE naming rule (`lib/svgstyles`,
  `lib/pairpath`), so a file written by the button is found again by a scan.

## The registration is the pair file (2026-11-17)

The reported defect: after restarting the app, every style image had to be
registered again before it showed, although its JSON was on disk. Two causes,
both fixed by reading the file instead of remembering a name:

* The scan derived a style's record from a **guessed** path
  (`<stem>_<style>.png`), which is not the name when the style image carries a
  `_vN` — so the file was never opened.
* A plain rebase keyed a style file by the id of the folder it sits in
  (`_<style>`), while the row that shows it looks up `<base id>~<style>`.

Now `lib/svgstyles.styleFileIdentityOf(metaPath)` reads the id off the **PATH**
(`<base dir>/_<style>/<stem>[_vN]_<style>.svg.json` → style, base dir, base row
id, style row id; any other `.svg.json` answers null, never a guess),
`sources.styleMetasOf` keys every style file it finds in the walk under that id
(through the scan's own cached read pass — a style costs no second read), and
`styles.discoveredStyles` + `rememberStyles` rebuild the bar's list from those
files. Consequences, all covered by tests:

* A restart shows the registered styles again; picking one is all it takes for
  the style row (its variants, its artwork and its Base · Stroke side) to come
  back. The style picked before the restart is restored too.
* A cleared browser cache loses nothing: the folders' pair files are the
  registration.
* Opening the tab writes nothing — a scan only reads.
* A style file never becomes a list row of its own: the base row keeps its id,
  and `rowsForStyle` swaps the row only for the style that is picked.

## Preview, switching and the strips

* A style row shows **three** previews — Base · Stroke (the base row's chosen
  main image, `baseAiPath`), AI source (the picked variant, `mainImageOf`) and
  SVG — with ONE bar cell per preview in slot order (`SvgThumbs`,
  `svgeditslot.PairBars`, see [results](svg-generation-results.md)).
* The pinned style bar (`svg-style-select`) switches every row that HAS the
  style to its style row; a row without it stays in the base style. The pick is
  remembered locally; a pick that is no longer in the list falls back to the
  base style instead of inventing one.
* Choosing a variant chip is the [image choice](version-acceptance.md): it
  moves `imagePreferred` and nothing else. The generation vectorizes that same
  file (`mainImageOf`).

## 🗑 on a version: one file, one record, one row

`svg/versionremove.ts` moves the file into `<its folder>/.removed versions`,
takes the entry out of the pair file and pushes ONE `svgVersionRemove` history
entry — Undo moves the file back and restores the record. The row is redrawn
from the new pair file through `rowmodel.withPairWrite`, so **everything the
write did not change survives**: the three previews and their strips, a running
or queued row, the style row's Base · Stroke side (reported defect 2026-11-17:
removing any variant wiped that preview until a rescan). The same rule now
governs every write that only replaces a row's pair file — register existing
SVGs / AI sources and a finished run's save.

## Paths follow the folder between roots

A pair file records paths relative to the root that was picked when it was
written. `lib/pairrebase` re-points the images and both version lists at the
file's own directory; since 2026-11-17 it also re-points `imageVersions` — a
file the record wrote in its own folder (a style's variants) or in its
`AI source regeneration versions` subfolder moves with that folder, so its
preview still resolves after the same tree is picked one level deeper. A path
that is NOT in the record's folder is left exactly as stored.

## Tests

[Style suites](tests/svg-styles.md) · `svg_styles` (names, registration, switching, the style filter) ·
`svg_style_persist` (the id a style file's path names, a restart, a lost list,
another root) · `svg_style_restart_ui` (a real unmount/mount, nothing written) ·
`svg_style_version_remove` (🗑 keeps the row whole, Undo restores both versions) ·
`svg_row_bar_alignment` (one bar cell per preview).
