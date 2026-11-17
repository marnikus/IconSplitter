export const COPY_READY_PROMPT = `# Product brief — Icon Sheet Constructor

## 1. Role & objective
Build a browser-based, no-code Icon Sheet Constructor that turns a library of stroke-only SVG icons with metadata into polished presentation sheets. It must support live styling and export an editable vector sheet.

## 2. Input & data model
Accept a batch of SVG icons and optional metadata: { id, name, category, tags[] }. If metadata is absent, infer tags from filenames. Normalize every glyph to a 24×24 (or square) viewBox, preserve its editable paths, remove fills, and inherit stroke, color and line cap from global settings.

## 3. Selection modes
Provide three selection recipes:
1) Random from the entire library.
2) Random from a category or tag filter.
3) Similar by metadata, using ≥70% similarity to a chosen reference icon or tag profile.
- Similarity = shared tags ÷ reference tags, with an adjustable threshold. Show the chosen formula and matching score.
- If too few icons match, top up with closest matches only when fallback is enabled, and show a non-blocking notice.
- Support a reproducible seed, re-roll, no duplicates, and per-cell locks.
- Default icon count = columns × rows. If the library is smaller, support blanks or repeats as the user chooses.

## 4. Artboard, banner and grid hierarchy
The layout must respect this containment order: artboard → free content area after banner → grid → icon box.
- User sets artboard width/height, padding, background, border radius and optional guide/border.
- User sets columns, rows, horizontal/vertical gaps, and either fixed or auto-fit layout.
- The grid is centered in the remaining area beside or below the banner.
- Never allow the grid or any glyph to overflow the artboard silently. Show an inline warning and offer Auto-fit.

## 5. Icon sizing and style
- User sets the icon box size (e.g. 30×30 px). Scale each glyph proportionally to fit inside it, centered and aspect-preserving.
- Include actual stroke thickness in the bounds calculation so thick strokes stay inside the box.
- Support shared stroke width, stroke color, caps/joins and optional icon-box background.
- Optional caption under each icon with label, font, size, weight, color and uppercase toggle.

## 6. Banner
Support left, right, top, bottom or none.
- User sets banner width (sides) or height (top/bottom), fill color, accent color and padding.
- Content is centered by default: main title (e.g. "Food Icons") and supporting title (e.g. "Editable stroke width").
- Each title has editable copy, font family, size, weight, color and letter spacing.
- Optional hero glyph, divider/accent rule, and a split style with separate color blocks (like the reference masthead).
- All banner and title changes must update the preview immediately.

## 7. Live preview & workspace
- Show a live vector preview with no Apply button. Changes to stroke width/color, background colors, layout, banner and type update instantly.
- Provide zoom, zoom-to-fit and 1:1 actual-size viewing. Show transparent backgrounds as a checkerboard, and surface artboard dimensions and icon count.

## 8. Export & persistence
- Export editable SVG with editable paths, stroke settings and text preserved. Export PNG at 1×, 2× or 3× with optional transparency.
- Allow exporting the whole sheet or individual icons (SVG, PNG, ZIP).
- Save/load presets containing all settings and the seed. Support undo/redo.

## 9. Interface
- Left: library, search/filter, selection recipe, threshold, seed, count, re-roll, locks.
- Center: zoomable live artboard with in-context warnings.
- Right: collapsible settings for Artboard, Grid, Icons, Banner, Text, Export.
- Top: undo/redo, presets, prompt/spec access and export.

## 10. Acceptance criteria
- No glyph or its stroke ever extends outside its icon box at any box size, stroke width or zoom level.
- Same seed + settings always produce the same icon selection and order.
- Similar mode never shows an icon below the threshold unless fallback is enabled and clearly announced.
- Every setting listed above changes the live preview immediately.
- SVG export remains editable and preserves strokes.
- Output can reproduce the three reference compositions: plain grid; dense grid with split top masthead; left banner with hero, title, subtitle and captions.

## 11. Assumptions for confirmation
- Platform: responsive web app. Alternative targets: desktop utility or Figma/Illustrator plugin.
- Similarity is measured against the reference icon's tags, not Jaccard. Keep the formula visible and adjustable.
- Stroke width is preserved in final pixels across icon sizes; expose a scale-with-icon option.
- Captions, hero glyph, accent rule and transparent background are optional.

Return a working implementation, not mockups. Prioritize live editing, correct icon containment and faithful exports.`;

export const PROMPT_DECISIONS = [
  {
    number: "01",
    question: "Which similarity formula?",
    answer:
      "Use shared tags ÷ reference tags, not Jaccard. It answers “how much of my reference is represented?”. Keep the threshold adjustable and show the percentage beside the factory.",
    tag: "recommended",
  },
  {
    number: "02",
    question: "Is the 70% fixed?",
    answer:
      "No. 70% is the default and is visible in the recipe. Lower thresholds help sparse metadata; fallback is a separate opt-in so the contract is never hidden.",
    tag: "default 70%",
  },
  {
    number: "03",
    question: "Does stroke scale with icons?",
    answer:
      "Default to a constant output stroke in final pixels, because that is what keeps sheets optically consistent. Offer a “scale with icon” toggle for icons drawn at different optical weights.",
    tag: "constant px",
  },
  {
    number: "04",
    question: "What if the library is too small?",
    answer:
      "Support both blanks and repetition. Leave blanks by default; use an explicit “fill from full library” switch and warn when a similar-mode result needed fallback.",
    tag: "no silent fill",
  },
  {
    number: "05",
    question: "What does the banner contain?",
    answer:
      "Two editable lines, centered by default: a main title and a supporting title. Hero glyph, accent rule, divider and split color treatment are optional enrichments seen in the references.",
    tag: "two lines",
  },
  {
    number: "06",
    question: "What should be exportable?",
    answer:
      "SVG first, with paths, strokes and text preserved. Add transparent PNG at 1×/2×/3×, plus a saved preset containing the seed and every layout choice. PDF/ZIP are phase two.",
    tag: "editable svg",
  },
];
