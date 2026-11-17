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
* **One style, or review every style separately**: the pinned `svg-style-select`
  menu keeps its single-style choices and adds **All styles · separate rows**.
  That view renders each base line-stroke pair and each registered style pair
  that exists for it as a distinct row, emitted after its base item (subject
  to the user's active list sort). Each
  row's filename carries a visible style label. The standard per-row and bulk
  Approve / Decline / Needs review actions target that row's own pair id and
  sidecar (`<base id>~<style>`), so approving a colored style cannot approve or
  change the base stroke result or another style. Versions and regeneration
  likewise remain style-specific. Rows lacking a particular style simply have
  no row for it in this view; the single-style view's historical fallback stays
  unchanged.
* **Mode survives reload**: `iconSplitter.svg.styles.v1.showAll` persists the
  all-styles view alongside the chosen single style; absent or invalid values
  default to the existing single base-style view. A rescan/restart rebuilds the
  same independent rows from each style's own pair file. Switching modes maps
  checked and active IDs to available rows and de-duplicates checks.
* Switching styles moves checks and the active row with the rows
  (`switchStyle`); rows without the picked style stay in their own style.
* **Fault-isolated registration**: the selected item folders are processed with
  bounded concurrency; within an item, each `_<style>` folder is isolated, so a
  failed metadata read/write does not hide successful sibling styles. Failures
  are counted as skipped in the register progress and summarized in the final
  message (up to three folder details); successfully written styles are retained
  even if another folder fails.
* **All-styles row construction**: base rows are built once, then style metadata
  is looked up directly for each base/style pair. This avoids constructing and
  discarding a full temporary row array for every style and appends each found
  style row into its base's output list. Corrupt base pair files preserve the
  same corruption marker in either view.
