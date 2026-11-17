# Image-style and version-removal suites

Owner: [image styles](../svg-image-styles.md) · [selectors](../../selectors/svg-image-styles.md).
Back to [Generate SVG tests](svg.md).

* `svg_styles.test.ts` — the `_<style>` folder and variant names (the style is
  the last suffix, only `_NN` files are variants, a `_vN` may sit before it),
  registration (`variantVersions`, inherited approval, the switch), and the
  style filter.
* `svg_style_persist.test.ts` — `styleFileIdentityOf`: the id a style pair
  file's PATH names (main or `_vN` name, a suffixed base stem such as `_AI_03`,
  and null for every file that is not a style record). Then a restart: the style
  is found from the walk alone, its variants and their paths resolve, the
  comparison side names the base row's image; a lost style list is rebuilt from
  the folders; the same tree picked one level deeper still resolves every
  variant (I-49 + I-86); and a style file never becomes a list row.
* `svg_style_restart_ui.test.tsx` — the real panel unmounted and mounted again
  on the same folder: the style bar, the picked style and the three-preview
  style row come back without a registration pass, the pair file on disk is
  byte-for-byte unchanged, and a cleared cache still costs no registration.
* `svg_style_version_remove.test.tsx` — 🗑 on a style AI-source version, and on
  the last one: Base · Stroke and the strips stay (the reported defect), the
  pair file loses exactly that version, and two Undos restore both files and
  entries.
* `svg_row_bar_alignment.test.tsx` — ONE bar cell per preview slot, in slot
  order and width, for a base row (two) and a style row (three).
* `pairmeta.test.ts` — the rebase cases: a record's own image versions move
  with it between roots (its folder and its version subfolder), a path outside
  it is left exactly as stored.
