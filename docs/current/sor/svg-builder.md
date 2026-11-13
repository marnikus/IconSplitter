# SVG builder (`svgBuilder`) — approved icon sheets

The seventh Workbench mode turns already-created, `.svg.json`-approved icons into one editable SVG sheet. **Controls, behaviour and positions follow the reference "Glyph — Icon Sheet Constructor"; every style comes from the app theme** (user decision 2026-11-07; fix list in [archive FIXES](../../archive/2026-11-07-svg-builder-integration/FIXES.md)). It never invents or downloads an asset. See the [selectors](../selectors/svg-builder.md), [owners](owners/svg-builder.md), [storage](storage/svg-builder.md) and [tests](tests/svg-builder.md).

## Layout

Folder bar (Open folder, Rescan, scope, approved count, audit, path) → **metadata widget** (prompt + Gemini, below) → header (`COLLECTION / 01 · LIVE`, sheet title, **◈ Icons indexing** + indexed chip / progress + Cancel beside it, Undo/Redo on the global timeline, `SEED ####` re-roll, Prompt brief, Sheet metadata, Export ▾) → three columns: **Icon library** | **stage** | **Customize · live** → **Saved templates** window. The panel uses only its own `bld-*` layout classes — never another tab's layout class (the borrowed `.svg-panel` grid caused the stray-text bug).

## Behaviour

- **Discovery**: `discoverBuilderAssets(root)` reads all folders and registers only valid approved SVG versions; problems are reported, never substituted. Thumbnails are drawn stroke-only with the same sanitiser/recolour as the artboard.
- **Export metadata** (2026-11-07): when `<pair-folder>/export/export.json` names this pair and has a title, the **title is the icon's name** (library, tooltip); **captions show the one-word Icon Name** (`metadata.name`, cleaned like the Upload tab; fallback: the title, else the file name — `captionOf`, 2026-11-13) and the title, description and tags all become searchable, scorable tags. Search matches name, category, description and tags (leading `#` stripped). Tags shared by ≥ 2 icons (generic stock tags excluded) become `#tag (N)` Similar profiles, so the threshold works on them. Missing, corrupt or foreign records keep the file-name fallback; the audit line counts icons "with export metadata".
- **Auto placement**: the first scan with an empty sheet draws the current recipe once (no undo entry); ids that vanished from a rescan are pruned.
- **Cells** = columns × rows, always. Empty cells show dashed `+` placeholders (preview only). Shrinking the grid truncates the selection; growing appends seeded picks (seed + capacity), seed unchanged.
- **Selection recipe**: Similar (vector similarity to the locked reference, **Similarity ≥ N %** plus a **Look alike ◀▶ Mean alike** mix (default 50/50) — see [vector index](svg-builder-index.md)), Random (whole library), Filtered (category chips, shared with the library filter). A seeded Fisher–Yates draw; a short pool is topped up with a seeded random pick (seed + 99; in Similar the ≥ N % icons stay first in rank order and the top-up is random only within 5 % below N, then the next most similar) and **reported** as a toast. Mode/category (Filtered) changes, both Reshuffle buttons and `SEED` re-pick with seed + 1; threshold moves re-pick without a toast. Locked icons (per-cell lock on the artboard) keep their cell.
- **Library click**: in the sheet → remove (and unlock), later cells shift up; else append; a full sheet toasts "Every cell is filled…". CLEAR empties placements and locks. Search strips a leading `#`.
- **Layout presets**: Side banner / Top split / Plain grid reset their groups to the reference values but keep the user's banner copy and hero; any manual edit shows **CUSTOM**. RESET restores defaults + Side banner (one undo entry; placements untouched).
- **Geometry** (`layout.ts`): content = artboard − banner − padding; caption row `max(captionSize × 1.65, 10) + 7`; the grid only shrinks (fit ≤ 1) and is centred; overflow says "Grid auto-fitted to N%". The glyph is drawn at `box − 2.2 × stroke` inside its box (stroke-aware bounds); stroke is constant px.
- **Text placement** (2026-11-13): *Text padding* 0–120 px insets the banner text from its edge (the painted block stays); *Move title / Move subtitle* X/Y −400…400 px (typed, arrow keys step 1); ↺ resets. Part of the look, so templates keep it. **Double-click** the title or subtitle on the artboard to edit it in place: Enter or clicking outside saves (one undo entry), Escape cancels, Shift+Enter = new line (`SvgBuilderInlineText.tsx`, native listener: the SVG is in a shadow root; text blocks carry `data-banner-text`).
- **Banner** (`banner.ts`): Left/Top/Bottom/Right/None, Solid or Split; side width 120–420, edge height 50–180; title never upper-cased, subtitle upper-cased and letter-spaced; greedy wrap ≤ 3 lines; Split ink is auto-contrast; hero glyph = chosen library icon or the first placed icon.
- **Ranges**: one table (`ranges.ts`) drives the parser and the controls; typed values **clamp**, never revert. Number boxes commit on Enter/blur; sliders coalesce into one undo gesture.
- **Zoom**: fit = `min((W−54)/w, (H−68)/h, 1.15)`, ≥ 0.16, recomputed on resize; −/+ step 0.1 (0.1–2); % or ⤢ → fit; 1:1. The wrapper takes the scaled size so every edge scrolls.
- **Export ▾**: Editable SVG (`{slug}.svg`), PNG 2× (`{slug}@2x.png`), Copy SVG markup, Save preset (`{slug}-preset.json`, also readable from the reference `{version, selection, seed}` shape), Load preset (undoable; stale ids pruned and reported). Delivery is refused unless ids are approved, fingerprints match the current scan and the composed SVG validates. Placeholders and locks are never exported.
- **Saved templates** (2026-11-13, `lib/svgBuilder/templates.ts`, `actions/templates.ts`): ＋ Save template keeps the sheet's **look** — artboard, grid, icon style, banner and text style; never the banner title/subtitle or hero (`lookOf`) — as a compact block with a generated name ("Side banner · 8×4 · Split", numbered when taken; renamed in place). The block's picture is that look on the current sheet with its loaded icons (dashed cells without one). Clicking it (or ✎) opens it on the sheet — one undo entry, the sheet's words and hero kept — and marks it *editing*: ✓ Save template writes the look back, *Save as new* copies it, *Done editing* stops. ✕ removes it at once. At most 60. A **PREVIEW** zoom (the shared 48–800 px slider) sets the pictures' height at each template's own aspect; remembered in prefs.
- **Preset JSON** (2026-11-13, `lib/svgBuilder/presetjson.ts`, header `{ } Preset JSON` / Export ▾): the whole sheet as editable JSON (`format` iconsplitter-sheet-preset v2: config incl. text placement, `icons` by Icon Name → title → file stem → id, `null` = empty cell, `lockedIcons`, seed, recipe, metadata). Apply merges onto the sheet (omitted fields keep their value; ranges clamp); names not found stay empty and are reported, never guessed; the rest of the grid stays empty. *Copy for AI* = parameter guide + JSON + all Icon Names. Save/Load preset use the same JSON; older id presets still load.
- **Prompt / Corrected brief**: Brief | Raw prompt, Copy prompt (Raw + toast on clipboard failure), Escape/backdrop close. Static text (`briefText.ts`).

## Provider and privacy

The **metadata widget** sits right after the folder bar: the shared `PromptWindow` (edit, reset, saved presets) beside the Gemini card, built like the SVG to upload tab's over the **shared** config and key (default model `gemini-3.1-flash-lite`). It folds to one bar (Minimize/Restore), its body drags taller or shorter (height remembered; *Restore height* returns to natural), and the header's **Sheet metadata** button unfolds it. *Generate sheet metadata…* opens the exact-request confirmation (one 768 px JPEG of this sheet + the prompt). Nothing is sent before **Send this exact request**; no retry, no resend on reload, key masked and never exported or logged ([RULE 20](../rules/BEHAVIOR.md)). The Gemini config is read from the shared key on boot. Only an accepted draft enters the export.

## State and undo

`src/lib/session.ts` owns the tab and `builder` slice. Placements use the shared `builderChecked` delta; layout config uses the absolute `builderConfig` payload; both are on the one global timeline. The recipe, seed and locks are working state (as in the reference) and add no entries of their own; automatic placement and grid resize add none. Display prefs (zoom/fit, layout choice) and the library view are not history.

## Source split

| Layer | Owner |
|---|---|
| pure domain | `src/lib/svgBuilder/{types,ranges,config,layout,banner,markup,assets,selection,metadata,svgAsset,compose,preset,undo}.ts` |
| discovery / FS | `src/svgBuilder/{discovery,repository,scan}.ts` |
| provider bridge | `src/svgBuilder/{preview,runSheetMetadata}.ts` |
| state / actions | `src/svgBuilder/{model,useSvgBuilder,useBuilder*,undoBinding,actions/*}.ts` |
| presentation | `src/svgBuilder/SvgBuilder*.tsx`, `briefText.ts`, `svgBuilder.css` |

`npm run test:builder:fast` is an extra Node smoke lane (esbuild bundle; `?raw` imports load as text); it does not replace the Vitest suites. See [Code Verification](../CODE_VERIFICATION.md).
