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
only a validated icon override opts in. General “Apply settings to selected”
preserves separately pinned size-guide and other decoration fields.

Defaults: off; corner **bottom-left** (the reference artboard, opposite the
badge's default corner); S logo **6%** and L logo **12%** of the artboard width
(1–100%); each logo's own stroke **0%** (0–20% of artboard width, 0 = the
artwork's own widths); gap between the logos **2%** of artboard width (0–100%);
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

Layout in artboard px: logo widths are percentages of artboard WIDTH; each
letter is 28% of its logo's width tall and sits in a clear 10% gap below the
widest logo. The whole group is then anchored by the chosen corner and the two
inward insets. If the requested pair (or an applied stroke's reach) would escape
the artboard, the entire group shrinks **uniformly**, keeping the requested
insets; a 100% inset or a placement with no measurable room fails preparation
as `no-fit` rather than clipping or moving the group.

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
guide fingerprints its corner, both logo percentages, both stroke percentages,
the gap, both insets and both supplied template contents, so edits mark affected
packages stale. Tests: `upload_sizeguide_geometry`, `upload_sizeguide`,
`upload_sizeguide_settings` and the size-guide block of `upload_ui`.
