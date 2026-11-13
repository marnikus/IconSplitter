# Upload size guide — the finished icon twice, smaller, with S and L labels

Part of [SVG to upload](upload.md). Geometry lives in `src/lib/upload/sizeguide.ts`
(layout) and `src/lib/upload/sizeguidecopy.ts` (one repeat: clone → bake → restyle
→ expand → its own stroke definition), over the two supplied letter outlines
`src/svg/templates/size-s.svg` and `src/svg/templates/size-l.svg`. The letters are
vector paths, not editable text, runtime images, preview-only overlays or a second
artboard. The approved source file is never rewritten. See
[dialog selectors](../selectors/upload-dialogs.md) and the
[named design note](../../archive/2026-10-20-upload-size-guide/design.md).

## Who receives it

The Export settings popup has a **Checked icons (N)** checkbox with off/mixed/all
states. Mixed adds the guide to all checked icons; all-on removes it. Hidden
checked rows count; an active but unchecked row does not. One **Size guide
defaults** fieldset is the only placement control set: it edits inherited
defaults and never turns on an unchecked icon or pins a checked one. Checked
guide-on icons without a placement override follow those defaults; a per-icon
override stays pinned. The per-icon popup offers its own checkbox, override
markers and reset. Stored global `sizeGuideEnabled: true` is ignored on read;
only a validated icon override opts in. A global control never pins the guide
(2026-10-21): the checkbox stores the values it set (`sizeGuideEnabled` and its
geometry) in the `applied` map (`lib/upload/decorations`), so the row and its
guide row read `inherited`. The bar's reset deletes that row's whole override
map and the guide keeps applying; only the checkbox itself turns it off.

Defaults: off; corner **bottom-left** (the reference artboard, opposite the
badge's default corner); S logo **6%** and L logo **12%** of the artboard width
(1–100%); each logo's own stroke **0 px** (0–50 px verbatim in the final file,
0 = the artwork's own scaled widths; stored `*StrokePct` keys carry their number
over on read); gap between the logos **2%** of artboard width (0–100%);
X and Y insets **3%** each (0–100%). X is measured from the selected left or
right edge as a percentage of artboard width, Y from the selected top or bottom
edge as a percentage of artboard height; the labels follow the corner.

## Composition

The icon (and any Shadow) is baked, restyled, fitted and stroke-unified first;
the guide is staged after that and before the [corner badge](upload-badge.md), so
the badge stays the last element. Each repeat is a **clone of the finished icon
alone** — its artboard background rect and the generated shadow ellipse are not
copied — baked with one uniform matrix into artboard px (no `transform` in the
file). Aspect ratio is preserved at both sizes; S sits left of L, both icons
share one baseline, and each letter outline is centred under its own logo,
bottom-aligned with the other.

Layout in artboard px: logo widths are percentages of artboard WIDTH. The two
letters are **one legend size** — `S` and `L` are both 28% of the *smaller*
logo's width tall (so L's letter never comes out twice S's, as the reference
artboard draws them; only the glyph widths differ, 8:12 vs 7:11) — and the
labels sit in a clear 10% gap below the widest logo. The whole group is then anchored by the chosen corner and the two
inward insets. If the requested pair (or an applied stroke's reach) would escape
the artboard, the entire group shrinks **uniformly**, keeping the requested
insets; a 100% inset, an un-shrinkable fixed-px stroke, or a placement with no
measurable room fails preparation as `no-fit` rather than clipping or moving the
group.

Each repeat carries its own stroke definition: `unifyStrokes` runs per repeat and
the paint is written on its wrapper `<g>`, so a hoisted root `stroke` can never
re-stroke a fill-only repeat, and a repeat with a visible stroke says
`stroke="none"` only when nothing strokes. Duplicate ids inside the two clones
(gradients, clip paths) are renamed and every `url(#…)`/`href="#…"` reference is
rewritten, so two repeats and the main icon never collide. The supplied letter
paths are filled `#000000`, stroke-free and never recoloured by root paint.

With **Expand strokes** on, the pipeline hands the guide an already-expanded
icon, so the repeats are that finished outline: no new stroke is expanded there
(they add nothing to `strokesExpanded`) and a repeat's own stroke width has
nothing to restyle. The dialog says so. With Expand off and a repeat's width at
0, the bake scales the icon's own width with the geometry, so each repeat keeps
its proportions.

## Output and fingerprints

Preview and JPEG render the same prepared vector; optimized clean SVG and
built-in EPS contain the guide as ordinary filled paths. Guide-off/default
fingerprints and byte-for-byte as-is exports are unchanged. Only an enabled
guide fingerprints its corner, both logo percentages, both stroke widths (px),
the gap, both insets and both supplied template contents, so edits mark affected
packages stale. Tests: `upload_sizeguide_geometry`, `upload_sizeguide`,
`upload_sizeguide_settings` and the size-guide block of `upload_ui`.
