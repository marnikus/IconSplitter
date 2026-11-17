# SVG builder — fix list and plan (2026-11-07)

Inputs: the merged builder tab (arena/82342cab → arena/a6acc057, merge `0d860d14`),
the reference app "Glyph — Icon Sheet Constructor" (arena.site build, read as
untrusted text), and the user's screenshots.

User decisions (2026-11-07):

* Styles: **the app's current dark theme dictates every style.** From the reference
  copy **only controls, their behaviour and their positions** — not its colours/fonts.
* Library source stays **our approved SVG assets** (the reference uses 77 built-in Lucide icons).
* Extras the reference lacks: folder bar above the tab (like other tabs), **Load preset**
  in the Export menu, **AI metadata** (prompt + Gemini card) in a dialog opened from the header.

---

## A. Broken UI (P0 — root causes)

| # | Defect | Root cause | Fix |
|---|---|---|---|
| A1 | Stray clipped text ("te", "LT", "Re am", "SE"…) between columns; metadata prompt and Gemini card invisible | Panel root reuses `.svg-panel` (`grid-template-rows: 42px auto 40px`, `overflow: visible`), so the tall controls row overflows *under* the workspace and shows through the 12 px column gaps | Own `builder-*` layout classes; never borrow another tab's layout class |
| A2 | Controls text tiny / uppercase | `.up-columns` (Upload column-header style) on the controls grid | Remove the borrowed class |
| A3 | Fit does nothing; artboard cannot scroll to its left edge | `fitScale` is hard-coded `1`; fixed-size box + CSS `scale` inside a centred overflow flex | Real fit = `min((stageW−54)/W, (stageH−68)/H, 1.15)`, ≥ 0.16, recomputed on resize (ResizeObserver); a wrapper sized to the *scaled* box; − / + step 0.1 (0.1–2); click % → fit; **1:1** button |
| A4 | Status text shown twice | `SvgBuilderStatusBar` renders `b.status` in two places | One status line |
| A5 | Typing a width snaps back to the default | `parseSheetConfig` falls back to the default for out-of-range values instead of clamping; per-keystroke commits | Clamp to range; number fields commit on Enter/blur (`DraftNumberInput`); sliders coalesce into one undo gesture |
| A6 | UI ranges ≠ parser ranges (gap, caption, banner size) → silent revert | Two independent range tables | One range table used by both the parser and the controls (reference ranges, §C) |
| A7 | Clearing the title restores the default text | Parser rejects empty title | Empty title allowed (banner shows nothing, header shows "Untitled icon sheet") |

## B. Placement / selection logic (P0)

| # | Defect | Fix (reference behaviour) |
|---|---|---|
| B1 | Nothing placed after a scan → "0 placed", banner-only sheet | After the first scan with an empty sheet, run the current recipe once (seeded) |
| B2 | Cells exist only for `recipe.count`; extra icons are "broken" and block export | Cells = `columns × rows` always. Empty cells render a dashed "+" placeholder (preview only). Shrinking the grid truncates the selection; growing appends seeded picks (no seed change) |
| B3 | Similar mode never matches a multi-word category; threshold is only 0 % or 100 % | Profiles = categories (plus "All approved"); profile tags are tokenised like asset tags; score = shared tags ÷ profile tags |
| B4 | Filtered mode ignores the category chips | Filtered uses the shared category (chips = Filtered category) |
| B5 | Seed number field re-places on every keystroke | No seed field; header **SEED ####** button re-rolls (seed + 1); Reshuffle buttons also seed + 1 |
| B6 | Apply recipe pushes two undo entries | One entry per gesture |
| B7 | Lock only in the library | Per-cell lock button on the artboard (hover; always visible when locked); locked icons keep their cell through reshuffles |
| B8 | Library click when full silently does nothing / breaks | Toast "Every cell is filled. Deselect an icon first, or add a row to the grid." |

## C. Missing controls — copy from the reference (positions + behaviour)

### C1 Header row (tab top)
Breadcrumb `COLLECTION / 01 · LIVE` + title (banner title or "Untitled icon sheet");
right side: **Undo / Redo** (global timeline), **SEED ####** (re-roll), **Prompt brief**,
**Export ▾** dropdown.

### C2 Left column — "Icon library N" · "STROKE ONLY"
* **Selection recipe** card: segmented **Similar / Random / Filtered**.
  * Similar: **Metadata profile** select; **Match threshold** slider 30–100 step 5 (default 70) shown as "≥ 70%"; profile tags listed as `#tag`.
  * Filtered: category chips; note "Empties — fill from full library".
  * Random: note "A seeded draw from all N glyphs. Same seed, same sheet."
  * **Reshuffle N icons** button (seed + 1) + recipe caption ("70% tag match · Profile" / "Random from the full library" / "Random from every category" / "Random from {category}").
  * Any change of mode / profile / threshold (and category while Filtered) re-picks with seed + 1; locks kept; shortfall toast ("Only N icons meet ≥T% metadata match. Closest matches fill the remaining cells.").
* **Search** "Search name or #tag" with × clear (name, category, tags; a leading `#` is stripped).
* **Category chips** All + categories (shared with Filtered).
* **Icon grid** (6 columns, square tiles): selected = accent tint + check dot; in Similar mode an unselected icon whose score ≥ threshold gets a small dot; tooltip "name · NN% tag match · in sheet". Click = add to the first free cell / remove (later cells shift up). Empty search: "No icons match that search."
* **Footer**: "N of C cells", "N locked" pill, progress bar, **CLEAR** (selection + locks).

### C3 Centre — stage
* Toolbar: **LAYOUT** presets with mini thumbnails — **Side banner**, **Top split**, **Plain grid** — and a **CUSTOM** pill after any manual edit; zoom **− NN% +**, **fit**, **1:1**.
* Floating **Reshuffle** button (top-right of the stage); **Corrected brief** button (bottom-right).
* Artboard: live preview; per-cell lock; empty-cell placeholders; hover caption "ARTBOARD 01 · W × H".
* Status bar: overflow → "Grid auto-fitted to NN% to remain inside the artboard" (warning); empties → "N empty cells · reshuffle to fill"; else "**N** glyphs placed · every stroke inside its box". Right: "LIVE VECTOR PREVIEW · W × H px".

### C4 Right column — "Customize · live" + **RESET**
Collapsible sections with badges (Artboard starts collapsed).
* **Artboard** (`W×H`): W 320–3000, H 240–3000 (px fields); **Canvas** colour + 8 swatches; Pad 0–160; Radius 0–64.
* **Grid** (`C × R`): Columns 1–16 / Rows 1–12 **steppers**; Gap X / Gap Y **sliders** 0–60; **Captions below icons** toggle; when on: Caption ink chip, Caption size slider 5–13 px, **UPPERCASE / Capitalized** segmented.
* **Icon style** ("fit to box"): info strip "Proportional fit · stroke-aware bounds"; Icon box slider 18–120 ("52 × 52 px"); Stroke width slider 0.5–5 step 0.1; Stroke colour + 8 swatches; **Line ends Round / Square** (square ⇒ miter join); note "Every glyph is scaled inside its box. Strokes never cross the edge."
* **Banner** (position or "hidden"): Position **Left / Top / Bottom / Right / None**; **Masthead Solid / Split**; Banner width (sides 120–420) / height (top/bottom 50–180) slider; Banner, Accent, Title ink, Subtitle colours; Main title, Supporting title text; Title size 10–48, Subtitle size 5–26 sliders; title face **Grotesk / Editorial / Mono**; **Hero glyph** toggle + **Glyph** select (from the library); **Accent rule** toggle. None ⇒ "Banner hidden. The full artboard is available for your grid."
* RESET → defaults + Side banner preset, one undo entry, selection untouched.

### C5 Export ▾ ("Export sheet")
Editable SVG (`{slug}.svg`) · PNG 2× (`{slug}@2x.png`, hint `2W × 2H px`) · Copy SVG markup ·
Save preset (`{slug}-preset.json`: version, config, selection, seed) · **Load preset** (ours).
"Preparing…" while running; slug = title lower-cased, non-alphanumerics → `-`, ≤ 64, default `icon-sheet`.

### C6 Brief dialog (Prompt brief / Corrected brief)
Brief / Raw prompt switch, Copy prompt ("Copied"), Escape / backdrop closes.
Brief view: section nav (Intent & scope, Structured prompt, Decisions to confirm, Acceptance & output);
Raw view: markdown text with character count. Copy failure → switch to Raw + toast.

## D. Rendering parity (compose / layout)

* Reference defaults: 1080×660, pad 34, radius 0, bg `#F4F0E7`; grid 8×4, gaps 22/18, captions on, ink `#787A6C`, size 9, upper; icon box 52, stroke 1.4, `#202A24`, round; banner left 242, solid, `#17271F` / accent `#D9F36C` / title `#FBFAF6` / subtitle `#CBD6C8`, "FOOD ICONS" / "Editable stroke width", 32 / 9, sans, hero on, divider on.
* Presets: **Side banner** = defaults; **Top split** = 1080×640, pad 30, 10×5, gaps 16/12, captions off, box 42, stroke 1.5, banner top split size 76, "200 ICONS" / "Media & web", hero off, 27 / 22; **Plain grid** = 1080×560, bg `#FBFAF6`, pad 46, 8×3, gaps 30/26, captions off, box 58, stroke 1.8, banner none. Presets reset all other values of their groups.
* Grid: content = artboard − banner − padding; caption row `max(captionSize×1.65, 10) + 7`; natural size from box + gaps; fit scale `min(1, …)` (shrink only), centred; overflow flag.
* Icon: drawn at `box − 2.2 × stroke`, centred, stroke constant in px (stroke-aware bounds).
* Captions: centred under the box, size `max(3.4, captionSize × fit)`, auto-shrink to the box width, letter-spacing .075em.
* Banner solid sides: centred column — hero in a ring, 34×2 accent rule, title (not uppercased), subtitle (uppercase, .16em). Solid top/bottom: row — hero, title, vertical rule, subtitle. Split: accent block (sides: full width × `min(154, size×.62)`; top/bottom: `min(size×4.45, W×.36)` × full height) with hero + title in auto-contrast ink; subtitle in the rest. Greedy wrap ≤ 3 lines per the reference formulas. Fix the reference's split-hero export bug (export uses the contrast ink).
* SVG export: `<title>`, `<desc>`, metadata block (ours), editable `<text>`, icons as nested `<svg>`; placeholders and locks never exported.

## E. Other defects found

* E1 Thumbnails render the source verbatim, while the artboard recolours to stroke-only → mismatch/noise. Thumbnails use the same stroke-only normalisation as the artboard.
* E2 Gemini config is written to the shared key but never read → the card ignores the Upload tab's settings after reload. Load it on boot.
* E3 Dialog text says "512px JPEG", code sends 768 px. Make the text match the code.
* E4 Export verify ignores fingerprints / composed-SVG validation → verify placed ids against the current scan and validate the composed SVG before delivery.
* E5 Preset load is not undoable → one undo entry.

## Plan (order of work)

1. **Domain** (`src/lib/svgBuilder/`): ranges table + clamping parser, reference defaults/presets, grid-capacity layout with fit/overflow, stroke-aware icon box, banner solid/split + wrapping, empty-cell model, selection modes/profiles/score/locks/grow-shrink, slug. TDD in `tests/svg_builder_domain.test.ts` (+ new focused suites).
2. **Model/actions**: seed re-roll, reshuffle, auto-apply on first scan, per-cell locks, library click semantics, single undo entry per gesture, preset load undoable, Gemini config load.
3. **UI**: own dark layout (header / 3 columns / status bar) with app tokens and classes; left recipe card + library; stage toolbar, fit/zoom, floating buttons, cell locks, placeholders; right Customize with segmented/stepper/slider/swatch/toggle controls; Export dropdown; brief dialog; metadata dialog.
4. **Tests**: UI interaction tests with a scanned fake library (placement, click-to-add, full toast, lock, fit, export names), layout regression (no `.svg-panel` / `.up-columns`).
5. **Docs**: `sor/svg-builder.md`, `selectors/svg-builder.md`, tests/owners pages; ledger entry.
