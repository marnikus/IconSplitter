# Image styles in Generate SVG — current behaviour

A row's `_<style>` folder beside its files holds that style's images; the
numbered ones (`_01`, `_02` …) are the style's VARIANTS. Registering
(`svg-register-styles`, [selectors](../selectors/svg-generation.md)) writes the
style's own pair file inside that folder and grows the style list; the pinned
switch (`svg-style-select`) swaps every row that has the style for its style
row. Source: `src/svg/styles.ts`, `src/lib/svgstyles.ts`.

* **One style pair file per row and style**: `<style stem>.svg.json` in the
  `_<style>` folder, id `<base pair id>~<style>`. Its `imageVersions` are the
  numbered variants (version N = variant `_NN`), so choosing a variant,
  generating, versions and review run through the SAME row machinery as the
  base line-stroke style. The style stem is the folder's own style image name
  (`<stem>[_v<N>]_<style>.png`); with no such image the first variant's name
  without its `_NN` stands in — registration and the restart scan derive it
  from the folder's names through ONE rule (`styleNameOf(styleFilesOf(…))`),
  so a style image that carries a version (`_v2`) is found again after a
  restart without re-registering (2026-11-17 fix: the scan used to guess one
  unversioned name and lost every versioned style).
* **The id survives every read**: `lib/pairrebase.ts` (I-49) re-derives a pair
  id from the file's folder; for a style pair the pair half is re-derived from
  the folder ONE LEVEL UP (the base pair lives beside `_<style>`, not in it)
  and the `~<style>` half is kept (2026-11-17 fix: rebasing used to flatten the
  id, so the first read after a write forgot the style row).
* **Three previews**: a style row shows Base · Stroke (the BASE pair's main
  image — `baseAiPath`, the same file the base row shows, RC8), its own AI
  source (the chosen variant) and its SVG. The base face is re-attached by
  `styles.rebuiltRow` on EVERY in-place row rebuild (🗑 version removals, run
  saves, SVG/AI registration), so no action can drop the Base · Stroke preview
  (2026-11-17 fix: rebuilds used a plain `toRow` and the preview vanished).
* **The chosen variant is the source**: the chips under the AI-source preview
  accept a variant as main (`imagePreferred`); the row shows it and the next
  generation vectorizes it (`mainImageOf`, RC8) — choosing never approves the
  row. Removing a variant (🗑) moves its file to `.removed versions` and undoes
  as one history step ([version removal](version-acceptance.md)).
* Switching styles moves checks and the active row with the rows
  (`switchStyle`); rows without the picked style stay in their own style.
