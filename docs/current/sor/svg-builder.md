# SVG builder (`svgBuilder`) — approved icon sheets

The seventh Workbench mode turns already-created, `.svg.json`-approved icons into one editable SVG sheet. **Controls, behaviour and positions follow the reference "Glyph — Icon Sheet Constructor"; every style comes from the app theme** (user decision 2026-11-07; fix list in [archive FIXES](../../archive/2026-11-07-svg-builder-integration/FIXES.md)). It never invents or downloads an asset. See the [selectors](../selectors/svg-builder.md), [owners](owners/svg-builder.md), [storage](storage/svg-builder.md) and [tests](tests/svg-builder.md).

## Layout

Folder bar (Open folder, Rescan, scope, approved count, audit, path) → header (`COLLECTION / 01 · LIVE`, sheet title, Undo/Redo on the global timeline, `SEED ####` re-roll, Prompt brief, Sheet metadata, Export ▾) → three columns: **Icon library** | **stage** | **Customize · live**. The panel uses only its own `bld-*` layout classes — never another tab's layout class (the borrowed `.svg-panel` grid caused the stray-text bug).

## Behaviour

- **Discovery**: `discoverBuilderAssets(root)` reads all folders and registers only valid approved SVG versions; problems are reported, never substituted. Thumbnails are drawn stroke-only with the same sanitiser/recolour as the artboard.
- **Export metadata** (2026-11-07): when `<pair-folder>/export/export.json` names this pair and has a title, the **title is the icon's name** (library, tooltip, captions) and the title, description and tags all become searchable, scorable tags. Search matches name, category, description and tags (leading `#` stripped). Tags shared by ≥ 2 icons (generic stock tags excluded) become `#tag (N)` Similar profiles, so the threshold works on them. Missing, corrupt or foreign records keep the file-name fallback; the audit line counts icons "with export metadata".
- **Auto placement**: the first scan with an empty sheet draws the current recipe once (no undo entry); ids that vanished from a rescan are pruned.
- **Cells** = columns × rows, always. Empty cells show dashed `+` placeholders (preview only). Shrinking the grid truncates the selection; growing appends seeded picks (seed + capacity), seed unchanged.
- **Selection recipe**: Similar (score = shared tags ÷ profile tags ≥ threshold 30–100 %, default 70), Random (whole library), Filtered (category chips, shared with the library filter). Profiles = categories (tokenised like asset tags, + `approved`), `#tag` profiles from export metadata, and "All approved". A seeded Fisher–Yates draw; a short pool is topped up from the library with seed + 99 and **reported** as a toast. Mode/profile/threshold/category (Filtered) changes, both Reshuffle buttons and `SEED` re-pick with seed + 1. Locked icons (per-cell lock on the artboard) keep their cell.
- **Library click**: in the sheet → remove (and unlock), later cells shift up; else append; a full sheet toasts "Every cell is filled…". CLEAR empties placements and locks. Search strips a leading `#`.
- **Layout presets**: Side banner / Top split / Plain grid reset their groups to the reference values but keep the user's banner copy and hero; any manual edit shows **CUSTOM**. RESET restores defaults + Side banner (one undo entry; placements untouched).
- **Geometry** (`layout.ts`): content = artboard − banner − padding; caption row `max(captionSize × 1.65, 10) + 7`; the grid only shrinks (fit ≤ 1) and is centred; overflow says "Grid auto-fitted to N%". The glyph is drawn at `box − 2.2 × stroke` inside its box (stroke-aware bounds); stroke is constant px.
- **Banner** (`banner.ts`): Left/Top/Bottom/Right/None, Solid or Split; side width 120–420, edge height 50–180; title never upper-cased, subtitle upper-cased and letter-spaced; greedy wrap ≤ 3 lines; Split ink is auto-contrast; hero glyph = chosen library icon or the first placed icon.
- **Ranges**: one table (`ranges.ts`) drives the parser and the controls; typed values **clamp**, never revert. Number boxes commit on Enter/blur; sliders coalesce into one undo gesture.
- **Zoom**: fit = `min((W−54)/w, (H−68)/h, 1.15)`, ≥ 0.16, recomputed on resize; −/+ step 0.1 (0.1–2); % or ⤢ → fit; 1:1. The wrapper takes the scaled size so every edge scrolls.
- **Export ▾**: Editable SVG (`{slug}.svg`), PNG 2× (`{slug}@2x.png`), Copy SVG markup, Save preset (`{slug}-preset.json`, also readable from the reference `{version, selection, seed}` shape), Load preset (undoable; stale ids pruned and reported). Delivery is refused unless ids are approved, fingerprints match the current scan and the composed SVG validates. Placeholders and locks are never exported.
- **Prompt / Corrected brief**: Brief | Raw prompt, Copy prompt (Raw + toast on clipboard failure), Escape/backdrop close. Static text (`briefText.ts`).

## Provider and privacy

**Sheet metadata** opens a dialog with the prompt (shared `PromptWindow` + presets) and the shared Gemini card; *Generate* opens the exact-request confirmation (one 768 px JPEG of this sheet + the prompt). Nothing is sent before **Send this exact request**; no retry, no resend on reload, key masked and never exported or logged ([RULE 20](../rules/BEHAVIOR.md)). The Gemini config is read from the shared key on boot. Only an accepted draft enters the export.

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
