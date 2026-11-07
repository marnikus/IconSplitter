# Design — "SVG builder" tab (2026-11-07)

Status: **plan only, nothing implemented.** This is the pre-implementation contract
(RULE 17: dated archive doc). After implementation the owning `docs/current/` pages
become the truth and this file is never edited to catch up.

Inputs this plan is derived from:

* Reference UI: `design temp/ref SVG constructor tab/` (3 611 lines TS/TSX — a standalone
  Vite app, lucide-react glyphs, its own light theme, `localStorage` only).
* Target app: `src/` (React 19 / Vite 7 / TS 5.9 / Tailwind 4, five-mode Workbench).
* Existing machinery reused rather than rebuilt: approved-SVG discovery
  (`src/upload/discovery.ts`), pair sidecars (`src/lib/pairmeta.ts`,
  `src/selection/pairstore.ts`), SVG sanitising preview (`src/lib/svgpreview.ts`),
  Gemini client/config/keystore (`src/lib/upload/gemini.ts`, `src/upload/configstore.ts`,
  `src/upload/keystore.ts`), prompt window (`src/ui/PromptWindow.tsx`), folder control
  (`src/ui/FolderBar.tsx`), global undo (`src/state/HistoryProvider.tsx`), session
  snapshot (`src/lib/session.ts`).

---

## 1. Purpose and scope

**One paragraph.** A seventh mode, **SVG builder**, that composes *presentation sheets*
out of icons the app has already approved: it recursively parses the picked root, keeps
only item-approved pairs whose disk SVG is valid (the same rule SVG to upload uses),
lets the user pick, style, arrange and caption them on a live vector artboard with an
optional banner/masthead, and exports an editable SVG / raster PNG / saved preset. It
carries the same top menu furniture as every other tab (Open folder + Rescan + scope
line + full-path row), the same metadata-prompt panel and Gemini connection card as
SVG to upload, and a **sheet metadata** generation path that reuses that tab's
validator. It never writes into the scanned root except into a `builder/` output
folder the user names, and it never calls the provider without an explicit confirmed
request (RULE 20).

**In scope**

* New tab id `builder`, tab label **SVG builder**, position: after `upload`,
  before `stockUpload`.
* Discovery of approved icons from the selected root (reuse + a builder-specific
  projection), with honest audit counts and exclusions.
* Icon library panel (search, tag/category filters, selection recipes: similar /
  random / filtered, seed, locks, capacity).
* Live artboard (layout math, banner, hero glyph, captions, stroke style), zoom/fit.
* Sheet metadata: prompt panel + Gemini card + check model + confirmed request +
  validation + local cache (per sheet, not per icon).
* Export: editable SVG, PNG at 1×/2×/3×, preset JSON; optional commit of the export
  into `<root>/builder/` (or a named subfolder) via the File System Access API.
* Dark-theme port of the reference UI on the existing `--v2-*` tokens.
* Global undo for builder state, session snapshot for restart, scroll memory.

**Out of scope (explicitly not in this tab)**

* No new AI image generation, no new SVG generation, no Requesty calls — Generate SVG
  stays the only SVG generator.
* No stock upload (Upload tab owns FTPS), no EPS/JPEG packaging of *icon* output
  (SVG to upload owns the per-icon export package). The builder's PNG is a sheet
  preview, not a stock artifact.
* No changing of pair decisions from inside the builder — the library is read-only
  over approved artwork. (A "needs work" jump-link back to Selection V2 is allowed
  and is listed as an optional step, P9.)
* No `design temp/` files are moved, deleted or imported at runtime. The reference
  app stays a reference; nothing from it is copied verbatim into `src/` except ideas.

---

## 2. Research — what the reference gives us, and what it cannot

### 2.1 Reference inventory (measured)

| File | Lines | What it really is | Port decision |
|---|---:|---|---|
| `src/App.tsx` | 704 | Shell, seed/selection state, local undo/redo stacks, export menu, preset application | **Rewrite.** ~30 hooks and one 100-line component; the shell splits into `BuilderPanel` + hooks. Local undo stacks are replaced by the global timeline. |
| `src/components/LibraryPanel.tsx` | 312 | Fixed 272 px left rail, recipe segmented control, profile select, threshold slider, category chips, 6-col icon grid, capacity footer | **Port + rewrite data source.** Layout survives; `ICONS` → approved icons. |
| `src/components/ControlsPanel.tsx` | 406 | 318 px right rail, 4 collapsible sections (Artboard, Grid, Icon style, Banner) | **Port + restyle.** Field list is the spec; primitives replaced by shared ones. |
| `src/components/IconSheet.tsx` | 362 | The artboard: banner variants (side/top split), hero ring, grid cells, captions, `data-*` hooks for the exporter | **Rewrite the renderer.** Keep the visual grammar; render real SVG documents instead of lucide components. |
| `src/components/PromptBrief.tsx` | 458 | A modal containing a giant copy-ready product brief + decision log | **Drop as a tab surface.** Keep the text blocks behind an "About this sheet" dialog (already-archived brief), not a 458-line component. |
| `src/components/ui.tsx` | 381 | Local primitives: PanelSection, Field, NumberField, RangeField, Stepper, ColorField, Toggle, Segment, TextField | **Do not port.** Reuse `src/ui/fields.tsx` (Select/NumberField) and add the missing primitives to a builder-local `BuilderFields.tsx`, styled with `--v2-*`. |
| `src/lib/sheet.ts` | 227 | `SheetConfig` type, defaults, 3 presets, `getMatchScore`, `mulberry32`, `shuffled`, `chooseIcons`, `relativeLuminance`, `readableInk` | **Port as pure lib** (`src/lib/builder/config.ts`, `select.ts`, `contrast.ts`). The type is the contract; the seeded RNG is kept verbatim in spirit (the app has no seeded RNG yet — verified: no `mulberry` in `src/lib`). |
| `src/lib/layout.ts` | 125 | `computeLayout` → content/banner/grid rects + per-cell frames + `fitScale` + `overflow`; `wrapTitle` | **Port as pure lib** (`src/lib/builder/layout.ts`). This is the single most valuable file: it is already pure, tested-by-construction, and it encodes "never overflow silently". |
| `src/lib/exporter.ts` | 204 | DOM-measurement export: walks the rendered artboard, reads `getBoundingClientRect()`/`getComputedStyle()`, rebuilds an `<svg>` string, then PNG via canvas | **Reject as the export path.** DOM measurement breaks the moment zoom ≠ 1, and it cannot be unit-tested. Replace with a **model-driven serializer** (see §5.4) that emits SVG from `SheetConfig` + placements only. |
| `src/data/icons.ts` | 302 | 77 lucide icons with `{id,name,category,tags}` | **Delete from the plan.** Replaced by discovered approved icons. |
| `src/data/prompt.ts` | 114 | The brief text + decision log | Not needed at runtime (see PromptBrief). |

### 2.2 Five reference assumptions that do not survive contact with this app

1. **Icons are a fixed library, not the user's disk.** The reference's whole selection
   layer assumes a compile-time array with curated tags. Our library is whatever the
   scan finds — possibly 4 icons, possibly 998, with tags that come from generated
   metadata (may be missing entirely). Therefore: every recipe needs an honest
   "pool too small" path (RULE 4), and "similar by tags" must degrade to
   "similar by filename tokens" when metadata is absent.
2. **Icons are React components.** Ours are `.svg` files on disk. Rendering must be
   sanitised (`buildSvgPreview`) and cached per `relPath` with the identity-keyed
   pattern that `src/svg/usesvgtext.ts` already establishes (a row never paints another
   row's document).
3. **Export by measuring the DOM.** Rejected above; a model-driven serializer is
   deterministic, testable, and independent of zoom.
4. **Undo is local.** RULE 12 requires one global timeline; a local stack would make
   Ctrl+Z order depend on which tab you are standing in.
5. **Nothing persists but `localStorage`.** We need RULE 13 validated keys, session
   snapshot participation, and no persistence of prompt text or keys outside their
   existing owners.

### 2.3 What already exists in the app that this tab must not re-implement

| Need | Existing owner | Reuse mode |
|---|---|---|
| Approved icons + audit + exclusions | `src/upload/discovery.ts` (`discoverUploadSources`, `UploadRowSource`, `UploadAudit`) | import + thin projection |
| Pair sidecars / item review | `src/lib/pairmeta.ts`, `src/selection/pairstore.ts` | transitively via discovery |
| Safe inline SVG preview | `src/lib/svgpreview.ts` (`buildSvgPreview`, `PREVIEW_CSS`) | import |
| SVG read/parse/validate | `src/svg/svgfiles.ts` (`readSvgText`), `src/lib/svgvalidate.ts` (`parseSvg`, `validateSvg`) | import |
| Stroke restyle / unification | `src/lib/upload/restyle.ts`, `strokeglobal.ts`, `geom/fmt` | import (pure DOM helpers) |
| Bounds measurement for fitting | `src/lib/upload/geom/bounds.ts` (`visibleBounds`, `Bounds`) | import |
| Folder pick + path capture | `src/ui/pickroot.ts`, `src/ui/FolderBar.tsx` | import |
| Scan ticket / commit-once | `src/lib/scanseq.ts`, pattern of `src/upload/scan.ts` | copy the pattern, own module |
| Gemini endpoint/model/config/limits | `src/lib/upload/gemini.ts` | import (no new network code) |
| Gemini model list check | `src/lib/upload/geminimodels.ts` | import |
| Gemini config persistence | `src/upload/configstore.ts` (`iconSplitter.upload.gemini.v1`) | **share the same key** (one provider setup for the app) |
| Gemini key | `src/upload/keystore.ts` (`gemini-api-key` in IndexedDB) | **share the same key slot** |
| Metadata prompt + presets | `src/ui/PromptWindow.tsx`, `src/state/presetstore.ts` | own key list (`promptpresets` shape) |
| Metadata schema + validator | `src/lib/upload/meta.ts` (`IconMetadata`, `parseMetadata`, `validateMetadata`, `cleanMetadata`) | import |
| Sheet-metadata answer parsing | same module | **do not reuse `DEFAULT_METADATA_PROMPT` verbatim** — see §5.6 |
| Download helper | `src/lib/dom.ts` (`download`) | import |
| ZIP | `jszip` (already a dependency) | import |
| Undo | `src/state/HistoryProvider.tsx` + `src/state/apply.ts` | new entry type |
| Progress bars | `src/lib/activity.ts` + `src/ui/useBusyActivity.ts` | import |
| Logging | `src/log/logstore.ts` | import (redacted specs) |
| Toggle / preview background | `src/ui/LazyPreviewsToggle.tsx`, `src/lib/svgbackground.ts` | optional |

---

## 3. Architecture

### 3.1 Layer direction (unchanged, RULE 1/3)

```
ui/Workbench  ──►  builder/*  ──►  lib/builder/*  ──►  lib/*  (pure)
                        │
                        └──►  lib/upload/* (pure), upload/{keystore,configstore}, selection/pairstore
```

Rules:

* `lib/builder/*` is **pure**: no React, no storage, no network, no `document`
  *except* the two explicitly DOM-bound modules (`render.ts`, `export.ts`) which take an
  already-parsed `Element` or a `SheetConfig`. Pixel math, selection, layout, serialising
  and validating live there and are unit-tested (RULE 8).
* `builder/*` (feature folder) owns React state, effects, storage reads/writes, the
  scan bridge, and the export pipeline orchestration.
* `builder/*` may import from `lib/*`, `ui/*` (shared components), `log/*`, `state/*`,
  `upload/keystore.ts`, `upload/configstore.ts`, `selection/pairstore.ts`. It must **not**
  import `upload/useUpload.ts`, `svg/*` panel internals, or `batch/*` panel internals.
* No existing tab may import `builder/*` (keeps the graph acyclic). The one exception is
  `ui/Workbench.tsx` registering the tab and `state/*` knowing the tab id.
* `src/lib/builder/*` may import `src/lib/upload/*` (pure) — precedent:
  `src/lib/stockupload/*` already imports `src/lib/upload/*`.

### 3.2 Module map (new files)

#### Pure — `src/lib/builder/` (RULE 16: ≤30 lines/fn, ≤120/fn file ideal, CC ≤10)

| File | Owns | Key exports |
|---|---|---|
| `config.ts` | The one `BuilderConfig` shape (artboard/grid/icons/banner/type/export), defaults, presets, **validate-on-read** | `BuilderConfig`, `DEFAULT_BUILDER_CONFIG`, `BUILDER_PRESETS`, `parseBuilderConfig`, `applyPreset`, `configFingerprint` |
| `layout.ts` | Rect math: content, banner (5 positions × 2 styles), hero, cells, captions, fit scale, overflow flag | `computeBuilderLayout`, `BuilderLayout`, `BuilderCell`, `wrapTitle` |
| `capacity.ts` | Columns × rows, how many icons fit, overflow/capacity copy | `capacityOf`, `capacityNote` |
| `select.ts` | Selection recipes over a `BuilderIcon[]` pool: similar (tag or filename token), random (seeded), filtered (folder/tag), locks, fallback policy | `chooseIcons`, `selectRecipe`, `describeRecipe`, `RecipePool`, `SelectionRecipe` |
| `rng.ts` | `mulberry32` + `shuffled` (deterministic seed) | `mulberry32`, `shuffled`, `seedFrom` |
| `contrast.ts` | `relativeLuminance`, `readableInk` (banner text on accent) | `readableInk` |
| `rows.ts` | Approved icon projection + filtering/sorting/search: `BuilderIcon` type, from `UploadRowSource` + metadata cache, token search, tag facets | `BuilderIcon`, `toBuilderIcon`, `filterIcons`, `iconFacets`, `BuilderFilter` |
| `place.ts` | One icon's placement inside a cell: sanitise doc → fit → `{x,y,w,h,viewBox,inner}`; per-icon unsupported reasons | `planPlacement`, `PlacementPlan`, `PlacementRefusal` |
| `sheet.ts` | Sheet-level derivations: title/subtitle text, caption text per icon, hero icon choice, per-sheet stats | `sheetText`, `captionFor`, `heroCandidate`, `sheetStats` |
| `serialize.ts` | **Model-driven SVG emitter**: `BuilderConfig` + placements + icon markup → one editable SVG string (paths preserved, strokes hoisted, text as `<text>`) | `serializeSheet`, `SerializeInput` |
| `exportname.ts` | Deterministic file names + `builder/` folder naming, byte-safe slugs | `sheetFileBase`, `builderDirName` |
| `preset.ts` | Preset JSON record (settings + selection ids + seed + version) parse/serialize | `BuilderPresetRecord`, `parsePreset`, `serializePreset` |
| `meta.ts` | **Sheet metadata** domain: its own default prompt, labels (`Title`/`Description`/`Tags`), parser, validator (reusing `lib/upload/meta` primitives + its own minima for a *collection*), fingerprint | `DEFAULT_SHEET_PROMPT`, `parseSheetMetadata`, `validateSheetMetadata`, `sheetMetaFingerprint` |
| `metatarget.ts` | Which icons the metadata request describes (the composed sheet's captions + categories) — the disclosed input preview | `metadataBrief`, `disclosureLines` |

#### Feature — `src/builder/`

| File | Owns | Notes |
|---|---|---|
| `BuilderPanel.tsx` | The screen: header row, library rail, artboard stage, controls rail, dialogs, toast | Wiring only; target ≤200 lines; delegates to `BuilderWorkspace` |
| `BuilderWorkspace.tsx` | Three-column layout (library / stage / customize) + collapse behaviour | Keeps `BuilderPanel` small |
| `useBuilder.ts` | The tab's single hook composition (boot → model → ctx → actions), mirrors `useSvgGen`/`useUpload` | ≤60 lines, composition only |
| `ctx.ts` | `BuilderCtx`: refs (root handle, scan ticket, svg text cache), toasts, scan bridge, derived lists | mirrors `svg/ctx.ts` |
| `model.ts` | Reducer + model shape (`BuilderModel`), pure transitions | testable without DOM |
| `store.ts` | Module-scope store for config/selection/seed (undo + restart need it outside React) | same pattern as `state/appstore.ts` (React-free + `useSyncExternalStore`) |
| `persist.ts` | RULE 13 storage: `iconSplitter.builder.config.v1`, `.selection.v1`, `.prompts.v1`, `.prompt.v1`, `.meta.v1`, `.prefs.v1` | validated readers, safe writers |
| `scan.ts` | Scan ticket + commit-once + audit, over `discoverUploadSources` | mirrors `upload/scan.ts` |
| `textcache.ts` | Per-`relPath` SVG text cache keyed by `(rootToken, relPath, revision)` | the `usesvgtext` identity rule |
| `useiconsvg.ts` | React hook: lazily read + sanitise a document for the given icon | bounded concurrency (`lib/limiter`) |
| `actions.ts` | Config/selection/seed actions + undo entries (`builderConfig`, `builderSelection`, `builderSeed`) | every mutation goes through `apply` |
| `recipe.ts` | Recipe → selection run (reroll, mode change, profile change, clear, toggle lock) | wraps `lib/builder/select` |
| `metarun.ts` | The confirmed metadata request: disclosure → confirm → send → parse → validate → store | no auto-retry on unknown outcome |
| `metaactions.ts` | Prompt/preset/key/config handlers | thin |
| `exportrun.ts` | Export orchestration: build SVG → download / raster PNG / ZIP / commit to disk | gates + progress |
| `exportcommit.ts` | Write into `<root>/builder/` (or chosen subfolder) atomically (`writeFileNew`), never overwrite silently | reuse `lib/fs` |
| `raster.ts` | Sheet SVG → PNG bytes at N× (canvas), decoded back and dimension-checked | mirrors `lib/upload/raster.ts` |
| `undo.ts` | `toBuilderConfigPatch` / `toBuilderSelectionPatch` + apply helpers used by `state/apply.ts` | mirrors `upload/uploadundo.ts` |
| `hotkeys.ts` | Tab keys (R re-roll, L lock, +/- zoom, F fit, Ctrl+E export) | `useSelectShortcuts` for Q/E selection |
| `BuilderLibrary.tsx` | Left rail | ≤200 lines |
| `BuilderRecipe.tsx` | Recipe segmented control + profile/threshold/category | split from library |
| `BuilderIconGrid.tsx` | Virtual-free grid of icons with lock/in-sheet marks, tooltips (name · score) | lazy previews honoured |
| `BuilderStage.tsx` | Center: layout row (presets, zoom, fit, 1:1), scrollable stage, artboard | ≤150 lines |
| `BuilderArtboard.tsx` | Renders the sheet from `computeBuilderLayout` + placements | pure render of derived data |
| `BuilderBanner.tsx` | Banner variants (solid/split, 5 positions, hero, divider, title/subtitle) | split from artboard |
| `BuilderCells.tsx` | Cell grid: icon slot + caption | split |
| `BuilderControls.tsx` | Right rail frame + section list | ≤120 lines |
| `BuilderArtboardSection.tsx` | W/H/pad/radius/background | one section per file keeps each ≤120 |
| `BuilderGridSection.tsx` | Columns/rows/gaps/captions/caption ink+size+case | |
| `BuilderIconSection.tsx` | Box, stroke width, colour, caps, "scale with icon" | |
| `BuilderBannerSection.tsx` | Position, style, size, colours, hero, divider, title/subtitle, faces, sizes | |
| `BuilderFields.tsx` | Builder-local primitives: `Section`, `Slider`, `ColorField`, `Toggle`, `Segmented`, `TextField` (dark) | not a copy of `ui.tsx` from ref |
| `BuilderMetaPanel.tsx` | Sheet metadata panel + provider card + prompt + request button + confirmation dialog | reuses `PromptWindow`, `KeySlot` |
| `BuilderMetaDialog.tsx` | The exact-request confirmation (disclosed inputs) | RULE 20 gate |
| `BuilderExportDialog.tsx` | Export menu: SVG / PNG 1×2×3× / ZIP / preset JSON / commit to folder | |
| `BuilderToast.tsx` | One transient line (shared pattern, builder-prefixed) | |
| `BuilderEmpty.tsx` | Empty/unsupported states: no root, no approved icons, root unreadable | RULE 4 honesty |
| `builderlog.ts` | Log specs (redacted, no prompts/no keys/no bytes) | mirrors `upload/uploadlog.ts` |

#### Edited existing files

| File | Edit | Risk |
|---|---|---|
| `src/lib/session.ts` | `TabId` += `"builder"`; `TAB_IDS` order; `SessionBuilder` slice; `DEFAULT_SESSION.builder`; `parseBuilderSlice`; bump-free additive field (older build ignores it, session version stays 1) | **Tests pin the exact `TAB_IDS` array** (`tests/session.test.ts:133`) → update that assertion deliberately |
| `src/state/appstore.ts` | `AppState.builder`, `initialAppState`, `sessionOf`, `patchBuilder` | |
| `src/state/useAppState.ts` | slice accessor | |
| `src/state/listtargets.ts` | `CheckableList` += `"builder"` (if the library participates in Q/E undo) | |
| `src/state/apply.ts` | `ENTRY_TYPES` += `"builderConfig" \| "builderSelection" \| "builderSeed" \| "builderMeta"`; apply branches | `tests/apply.test.ts:165` pins `ENTRY_TYPES` exactly → update deliberately |
| `src/ui/Workbench.tsx` | `TABS` entry `{ id: "builder", label: "SVG builder", testid: "tab-builder" }`; `BuilderWorkspace` mount with the same "lazy on first visit, then parked hidden" pattern as Upload/StockUpload; activity mount `builder-progress-mount` | `tests/workbench_ui.test.tsx:117` pins tab order → update deliberately |
| `src/ui/ActivityBars.tsx` | `SOURCES.builder = "SVG builder"` | |
| `src/index.css` | New `/* ══ SVG builder ══ */` section, `--bld-*` tokens derived from `--v2-*`, all classes prefixed `.bld-` | file already 2 198 lines; append a section, do not restyle others |
| `docs/current/*` | New `sor/svg-builder.md`, `selectors/svg-builder.md`, `sor/OWNERS` row, `sor/STORAGE` rows, `sor/TESTS` row, router rows in `docs/current/README.md`, `OVERVIEW.md` mode list, `UI_SELECTORS.md` tab row, `sor/shared.md` "shell has five tabs" → six/seven | RULE 17 same-change requirement |
| `tests/session.test.ts`, `tests/apply.test.ts`, `tests/workbench_ui.test.tsx` | assertion updates above | |

---

## 4. Data model

### 4.1 `BuilderConfig` (the persisted sheet design)

```ts
export interface BuilderConfig {
  v: 1;
  artboard: { width: number; height: number; background: string; padding: number; radius: number };
  grid:    { columns: number; rows: number; gapX: number; gapY: number;
             captions: boolean; captionColor: string; captionSize: number;
             captionCase: "upper" | "normal" };
  icons:   { box: number; strokeWidth: number; scaleStroke: boolean;
             color: string; linecap: "round" | "square" | "butt" };
  banner:  { position: "left" | "right" | "top" | "bottom" | "none";
             style: "solid" | "split"; size: number;
             background: string; accent: string; textColor: string; subtitleColor: string;
             title: string; subtitle: string; titleSize: number; subtitleSize: number;
             titleFace: "sans" | "serif" | "mono"; hero: boolean; heroIconId: string;
             divider: boolean };
  export:  { pngScale: 1 | 2 | 3; background: "sheet" | "transparent" };
}
```

Ranges (clamped on read **and** in the UI): artboard 256…4096 px; padding 0…200;
radius 0…256; columns/rows 1…16; gaps 0…200; box 8…400; strokeWidth 0…40;
captionSize 4…40; banner size 0…half the artboard; titleSize 6…96; subtitleSize 4…40.

Validation: one `parseBuilderConfig(raw)` per RULE 13 — every field read through a
clamp/enum helper; anything unreadable → the default for that field only, never the
whole record and never a throw.

### 4.2 `BuilderIcon` (the library row)

```ts
export interface BuilderIcon {
  /** Stable pair id from the sidecar — never an index (I-10/I-41). */
  id: string;
  /** The approved version's SVG path relative to the root. */
  svgPath: string;
  /** Display name: file stem, trimmed of the app's `_AI` marker (lib/upload/export stemOf). */
  name: string;
  /** Folder path (the pair's dir), used as the coarse category. */
  folder: string;
  /** Tokens for search/similar: filename words + metadata tags (may be empty). */
  tags: string[];
  /** Where the tokens came from, so the UI can be honest. */
  tagSource: "metadata" | "filename" | "none";
  /** size:mtime fingerprint at scan time — the cache key for SVG text. */
  fingerprint: string;
}
```

Projection source: `UploadRowSource` (already carries `id`, `base`, `dirPath`,
`svgPath`, `fingerprint`) + optional `IconMetadata` tags from `upload/metacache`-style
cache (builder owns its own cache key: `iconSplitter.builder.meta.v1`, keyed by
`svgPath + fingerprint`, capped 2 000 entries).

### 4.3 `BuilderSelection` (persisted, undoable)

```ts
export interface BuilderSelection {
  /** Icon ids in CELL ORDER — index 0 is the first cell. Never a set. */
  slots: (string | null)[];
  /** Locked icon ids: pinned across re-rolls and cell-count changes. */
  locked: string[];
  seed: number;
  recipe: { mode: "similar" | "random" | "filtered"; threshold: number; folder: string; tag: string };
}
```

`slots` is stored in cell order deliberately: the reference stores a flat array and
re-derives positions, which silently reflows when `columns` changes. Keeping nulls
lets a sheet have holes (RULE 4: a hole is honest, not an error).

### 4.4 `BuilderSheetMetadata` (persisted)

```ts
export interface BuilderSheetMetadata {
  state: "empty" | "generated" | "invalid" | "accepted" | "interrupted";
  title: string;          // collection name, e.g. "Kitchen essentials"
  description: string;    // one phrase, ≥7 words
  tags: string[];         // ≥10, includes the 7 mandatory tokens
  prompt: string;         // the exact effective prompt sent
  provider: string;       // "Gemini"
  model: string;          // the configured id
  usage: { input: number | null; output: number | null; total: number | null };
  validation: { ok: boolean; errors: string[]; warnings: string[] };
  /** Binds the metadata to the exact sheet it describes. */
  fingerprint: string;
}
```

`fingerprint` = hash of (config fields that change the described content + ordered slot
ids + captions). A metadata record whose fingerprint no longer matches is shown as
**stale**, never as current, and is never silently re-sent.

### 4.5 Storage keys (RULE 13, all validated on read)

| Key | Shape | Notes |
|---|---|---|
| `iconSplitter.builder.config.v1` | `{ v: 1, config: BuilderConfig }` | one sheet design |
| `iconSplitter.builder.selection.v1` | `{ v: 1, selection: BuilderSelection }` | slots/locks/seed/recipe |
| `iconSplitter.builder.presets.v1` | `{ v: 1, list: BuilderPresetRecord[] }` | user presets, cap 20, oldest dropped |
| `iconSplitter.builder.prompt.v1` | `{ v: 1, prompt }` | sheet-metadata prompt text |
| `iconSplitter.builder.prompts.v1` | `{ v: 1, list: PromptPreset[] }` | reuses `lib/promptpresets` |
| `iconSplitter.builder.meta.v1` | `{ v: 1, record: BuilderSheetMetadata \| null }` | sheet metadata (no image bytes, no key) |
| `iconSplitter.builder.iconmeta.v1` | `{ v: 1, byKey: Record<string, string[]> }` | tag cache, cap 2 000 |
| `iconSplitter.builder.prefs.v1` | `{ v: 1, providerOpen, captionColourMode, previewBg }` | display-only |
| IndexedDB `iconSplitter/handles["__builder__"]` | root handle | **own slot**, like `__upload__` |
| IndexedDB `iconSplitter/rootpaths` | shared path binding (I-63) | via `ui/pickroot` |
| IndexedDB `iconSplitter/secrets["gemini-api-key"]` | shared key | **shared with SVG to upload** |
| localStorage `iconSplitter.upload.gemini.v1` | Gemini config | **shared** (one provider setup) |
| localStorage `iconSplitter.ui.scroll.v1` | scroll memory | already tab-keyed, key = `"builder"` |

Deliberately **not** persisted: the selected icons' SVG text (re-read on demand),
anything secret, prompt text beyond its own key, and any export bytes.

---

## 5. Interfaces between the parts

### 5.1 Discovery interface (builder over upload's)

```ts
// src/builder/scan.ts
export interface BuilderScan {
  rootName: string;
  rootToken: number;               // bumped on every pick/scan — invalidates caches
  icons: BuilderIcon[];            // approved + valid, sorted deterministically
  excluded: UploadExclusion[];     // reasons, verbatim from upload/discovery
  audit: BuilderAudit;             // files/svgFiles/sidecars/pairs/rows/excluded/unreadable
  corruptFiles: string[];
  unreadable: { relPath: string; reason: string }[];
}
```

Mapping rule: `UploadRowSource` → `BuilderIcon` is **lossless for identity**
(`id`, `svgPath`, `fingerprint`) and **lossy for metadata by design** (tags may be
empty; `tagSource` says so). Only rows whose `svgPath` is non-empty are listed;
exclusions are reported, never rendered as rows. This is the *same* approved-icon rule
as "SVG to upload" (I-78) — deliberately not a second definition (RULE 10).

### 5.2 Icon document interface

```ts
// src/builder/useiconsvg.ts
export type IconDoc =
  | { kind: "ready"; doc: Document; markup: string; viewBox: string; ratio: number }
  | { kind: "missing" }                     // file gone since the scan
  | { kind: "unsupported"; reason: string } // <text>, <image>, broken XML…
  | { kind: "loading" };

export function useIconDoc(rootToken: number, icon: BuilderIcon): IconDoc;
```

* Read via `readSvgText(root, svgPath)`; parse via `DOMParser` (never `innerHTML`).
* Sanitise via `buildSvgPreview`'s policy (strip script/foreignObject/events/external refs).
* "Unsupported" is a **placement refusal with a reason**, shown on the cell, never a
  silently blank cell (RULE 4).
* Cache key includes `rootToken` so a rescanned root cannot serve stale artwork.

### 5.3 Selection interface

```ts
// src/lib/builder/select.ts
export interface RecipePool { icons: readonly BuilderIcon[]; }
export interface SelectionRequest {
  mode: "similar" | "random" | "filtered";
  pool: readonly BuilderIcon[];
  capacity: number;
  seed: number;
  threshold: number;   // 0..100, similar-mode only
  folder: string;      // "" = all
  tag: string;         // "" = all
  lockedIds: readonly string[];
  anchorTags: readonly string[]; // the reference tag profile (from the active icon)
}
export interface SelectionResult {
  slots: (string | null)[];
  /** True when the pool could not fill the sheet — the UI says so. */
  shortfall: number;
  /** Which tag source the score used, so the copy can be honest. */
  basis: "metadata" | "filename" | "none";
}
```

Determinism: same `(pool ids, mode, seed, threshold, folder, tag, lockedIds, capacity)`
→ same `slots`. Locked ids keep their existing index; free cells are filled from the
seeded shuffle; shortfall leaves `null` holes unless the user opts into "repeat from
library" (explicit switch, never silent).

### 5.4 Export interface (model-driven, no DOM measurement)

```ts
// src/lib/builder/serialize.ts
export interface Placement { iconId: string; x: number; y: number; w: number; h: number;
                             viewBox: string; innerMarkup: string; caption: string | null }
export interface SerializeInput {
  config: BuilderConfig;
  layout: BuilderLayout;
  placements: readonly Placement[];
  /** The resolved stroke style + linecap actually applied. */
  stroke: { width: number; color: string; linecap: string };
  title: string;
  subtitle: string;
  hero: { placement: Placement; ink: string } | null;
}
export function serializeSheet(input: SerializeInput): string; // one editable <svg>
```

Guarantees the serializer must satisfy (each a test):

1. `width`/`height`/`viewBox` equal the configured artboard px.
2. Every icon becomes a nested `<svg x y width height viewBox>` (keeps its own
   coordinates) inside a `<g data-cell="n">`, so the sheet stays editable and every
   glyph keeps its path data verbatim.
3. Stroke is declared **once**, on the group that owns it (`lib/upload/strokeglobal`
   semantics), and never multiplied by zoom.
4. Text is real `<text>` with `font-family`, `font-size`, `letter-spacing`,
   `text-anchor="middle"`, escaped content — not outlined, not raster.
5. Output is byte-identical for identical input (no timestamps, no random ids) so a
   preset + seed reproduces a sheet exactly.
6. Well-formed: `DOMParser(... "image/svg+xml")` reports no `parsererror`, and
   `validateSvg()` (the app's existing gate) passes.

Raster path (`src/builder/raster.ts`): `serializeSheet` → `Blob` → `<img>` →
`canvas` at `pngScale × artboard` → decode back and assert the pixel dimensions,
exactly the pattern `lib/upload/raster.ts` already uses.

### 5.5 Undo interface

| Entry type | before/after | label examples |
|---|---|---|
| `builderConfig` | `BuilderConfig` (whole object; ≤ ~1 KB) | "Change stroke width", "Apply preset «Top split»" |
| `builderSelection` | `{ slots, locked, seed }` | "Re-roll selection (seed 2841)", "Fill 32 cells" |
| `builderMeta` | `BuilderSheetMetadata \| null` | "Accept sheet metadata" |

Rules: every mutation goes through `state/apply.ts` (one path); slider drags coalesce by
`gesture` key (`builder:box`, `builder:gapX`, …) so one drag is one entry; a failed
apply leaves the cursor unchanged; undo of a selection whose ids a rescan removed is
refused by `selectionTargetsKnown("builder", …)`.

### 5.6 Provider interface (Gemini — shared config, its own prompt)

```ts
// src/builder/metarun.ts
export interface SheetMetaRequest {
  /** Exactly what will be disclosed: the sheet render summary + the prompts. */
  disclosure: { lines: string[]; iconCount: number; captionSample: string[] };
  prompt: string;                    // effective (edited or default)
  config: GeminiConfig;              // shared with SVG to upload
  model: string;
}
```

Two decision points to settle before coding (see §10, Q1/Q2):

* **Image vs text request.** SVG to upload sends the icon *image* (`inlineData`) and
  never sends a data URL into logs. The builder's subject is a *collection*. Cheapest,
  most honest option: `buildGeminiRequest` with the **sheet PNG as the image** plus a
  text instruction naming the collection — reuses the existing builder-free code path
  and keeps the same wire shape that is already tested. Alternative: text-only request
  reusing `sendGemini` with a two-part body (needs a small, tested variant of
  `buildGeminiRequest` because its `contents.parts` type is a fixed tuple).
* **Validator.** `validateMetadata` from `lib/upload/meta` enforces per-icon minima
  (title ≥5 words naming an abstract idea, 7 mandatory tags). For a *collection* title
  ("Kitchen & cooking pictograms") that is wrong-ish but harmless; the plan is: **reuse
  the mandatory-tag rule, relax the title to ≥3 words, keep description ≥7 words**, in
  `lib/builder/meta.ts`, delegating tag hygiene to `dedupeTags`/`MANDATORY_TAGS`. The
  alternative (reuse verbatim) costs odd copy and none of the policy.

Failure policy (same as upload): a timeout/disconnect is **outcome-unknown**, never
auto-retried; a refusal (`blocked`) is terminal; a malformed answer is terminal with
the raw text kept out of the log; retries only on classified-retryable HTTP.

### 5.7 Export-to-disk interface

```ts
// src/builder/exportcommit.ts
export interface CommitTarget { root: DirHandleLike; subdir: string } // default "builder"
export async function commitSheet(t: CommitTarget, base: string, files: SheetFile[]):
  Promise<{ written: string[]; refused: { name: string; reason: string }[] }>;
```

* Uses `ensureDirPath` + `writeFileNew` (never overwrite an existing file; a name
  collision gets `-2`, `-3` …, and the refusal is reported).
* Names: `<slug(title || "icon-sheet")>-<columns>x<rows>-<n>icons.svg|.png|.json`
  — deterministic and traceable (RULE 22 flavour: sheet → config → seed).
* The `builder/` folder is the only thing this tab ever creates inside a scanned root.
  `upload/discovery` ignores only `export/`, so **`builder/` must be added to the
  builder's own scan ignore list** to avoid feeding itself (an exported sheet is an
  `.svg` but has no `.svg.json`, so it is excluded already — still ignore the folder
  explicitly to keep the audit counts honest).

### 5.8 Top-menu parity (the "as in other tabs" requirement)

`BuilderControls` renders, top → bottom, the same furniture as SVG to upload:

1. `svg-toolbar` row: `OpenFolderButton` (`builder-open-folder`), `↻ Rescan`
   (`builder-rescan`), scope copy ("Approved SVGs only · recursive · N icons"),
   audit line (`builder-audit`).
2. `FolderPathRow` (`builder-folder-path`) — shared component, full path + honest note.
3. Metadata prompt panel (`builder-prompt-panel`, `PromptWindow` with `testId="builder"`).
4. Gemini provider card (`builder-provider-card`): Model, Endpoint, Timeout, Retries,
   Parallel, `Check model`, key slot (`builder-key`), minimize toggle — **same shared
   config and key slot as SVG to upload**, labels adapted ("sheet metadata generation").
5. Filter/search row: `SearchField` (`builder-search`) + tag/folder multi-filters
   (`MultiSelect`) — same look as the list tabs.
6. The three-column workspace.

---

## 6. UI redesign → dark theme

### 6.1 Token mapping (reference light → app dark)

Reference values are hard-coded hex in Tailwind classes (`#FBFAF6`, `#EDEAE1`,
`#17271F`, `#D9F36C`…). None of them ship. The builder uses the app's existing tokens
plus a small `--bld-*` layer, so a future global theme change still reaches it:

| Role | Reference (light) | Builder (dark) |
|---|---|---|
| App/stage background | `#EDEAE1` | `var(--v2-bg)` `#070b16` |
| Panel/rail surface | `#FBFAF6` | `var(--v2-surface)` `#0c1222` |
| Inputs / chips | `#F7F4EC`, `#F2EFE6` | `var(--v2-surface-2)` `#10172a` |
| Hairlines | `#E1DDD0`, `#E7E3D8` | `var(--v2-line)` `#222c46` |
| Primary text | `#252B25` | `var(--v2-text)` `#e8edfa` |
| Secondary text | `#909385` | `var(--v2-muted)` `#8591ae` |
| Accent (select/CTA) | `#8FA153` (olive) | `var(--v2-purple-2)` `#8c79ff` |
| "In sheet" tint | `#E8EDD7` | `#1a2138` + accent ring |
| Success / warning / danger | `#6D803E` / — / `#ff5b7e`-ish | `var(--v2-green)` / `--v2-yellow` / `--v2-red` |
| Artboard "paper" | `#F4F0E7` (config default) | **stays configurable** — the user's sheet background, not the app theme |

Important distinction: the *artboard* keeps the user's chosen sheet colours (cream,
ink, olive) — that is the product. Only the app chrome around it becomes dark. The
default config ships a "dark sheet" preset (`#0e1420` background, `#e8edfa` ink, accent
`#8c79ff`) so a first-time user sees a dark sheet too, plus the reference's three light
presets for parity.

### 6.2 Layout at 1× (dark)

```
┌ BuilderControls (shared furniture) ───────────────────────────────────────────┐
│ [Open folder] [↻ Rescan]   Approved SVGs only · recursive · 128 icons          │
│ Full path ▸ F:\Stocks\…\s1_test_process_01_split_output                        │
│ ┌ Metadata prompt ───────────────┐ ┌ Gemini · sheet metadata ──────────────┐   │
│ │ prompt editor + presets        │ │ Model/Endpoint/Timeout/Retries/Par.   │   │
│ └────────────────────────────────┘ │ [Check model]  key ●●●●  Forget        │   │
│ Search ▸ …            Folder ▸ All   Tag ▸ All   Sort ▸ Name                   │
├──────────────┬──────────────────────────────────────────┬─────────────────────┤
│ LIBRARY 272  │ LAYOUT  [Side banner][Top split][Plain]  │ CUSTOMIZE 318       │
│ recipe       │ ZOOM −115%+ [Fit] [1:1]      × 1080×660   │ ▸ Artboard          │
│ profile      │ ┌──────────────────────────────────────┐ │ ▸ Grid              │
│ threshold    │ │        (dark stage, sheet paper)     │ │ ▸ Icon style        │
│ chips        │ │   banner  │  grid of approved icons   │ │ ▸ Banner            │
│ icon grid    │ │           │  + captions               │ │ ▸ Export            │
│ 32 of 32     │ └──────────────────────────────────────┘ │                     │
└──────────────┴──────────────────────────────────────────┴─────────────────────┘
```

* Zoom: reuse `lib/zoom` (`clampZoom`, `zoomBoxFit`) rather than the reference's local
  min/max — one definition of "thumbnail/zoom size" in the app (RULE 10).
* Left rail grid uses the same 6-col icon grid as the reference but with `--v2-surface-2`
  tiles; the "in sheet" mark is an accent dot + ring; "locked" is a lock glyph in the
  corner (accessible: `aria-pressed`, `title`).
* Right rail sections are collapsible (`<details>`-style, native disclosure semantics as
  the app already prefers) so the rail can hold Artboard + Grid + Icon + Banner + Export
  without a 700-line file.
* The reference's top header (glyph logo, "Collection / 01", seed pill, Prompt brief,
  Export dropdown) collapses into: a compact builder sub-header inside the tab
  (title/collection name + seed pill + Export button). The app already has a global nav
  and history bar, so a second 58 px app header would be redundant chrome.

---

## 7. Behaviour contracts (what must be true)

1. **Approved only.** The library lists exactly the pairs SVG to upload would list
   (I-78) — same sidecar rule, same `export/` ignore, plus the builder's own `builder/`
   ignore. Nothing unapproved can be placed on a sheet.
2. **Honest discovery.** Audit line always present: rows · SVG files · pairs not listed ·
   corrupt pair files · unreadable files. Empty library says *why* it is empty (no root /
   no approved icons / all approved files unreadable), never a blank panel.
3. **Determinism.** `(pool, recipe, seed)` reproduces the selection; a preset JSON +
   root reproduces the sheet byte-for-byte.
4. **No silent overflow.** `computeBuilderLayout` reports `overflow`; the stage shows an
   inline warning + one-click "Auto-fit"; the export is blocked until the warning is
   cleared or acknowledged (RULE 15 spirit: no unverified artifact).
5. **Stroke truth.** Stroke width is in final px on the sheet; "scale with icon" is an
   explicit toggle, off by default (reference decision 03, kept).
6. **One undo timeline.** Every config/selection/metadata mutation is undoable from any
   tab; a lost target refuses instead of guessing.
7. **Restart.** Tab, config, selection, seed, recipe, prompt, provider prefs, sheet
   metadata and scroll position all return after reload; in-flight metadata request is
   reported as `interrupted` and never re-sent.
8. **Privacy.** Local by default; the only network calls are the confirmed sheet-metadata
   request and the model check (both disclose their inputs); keys never leave IndexedDB;
   prompts/captions never enter logs; no image bytes in the log or the session.
9. **Atomic deliverable.** Exports are produced by a verified serializer (parse +
   validate gate) before any download or disk write; disk writes are create-only.
10. **Accessibility.** `data-testid` on every interactive element with the `builder-`
    prefix; buttons have text or `aria-label`; state never signalled by colour alone
    (lock/selected/stale all carry glyphs + text).

---

## 8. Phased TDD plan (each phase independently shippable)

Phases are ordered so every step compiles, tests green, and the tab is never half-broken
in `main`. Sizes are line budgets (RULE 16), not time.

### P0 — Skeleton and shell registration (~250 lines src, ~120 lines tests)

1. `tests/session.test.ts`: add `"builder"` to the expected `TAB_IDS` array (witness
   failure), then edit `src/lib/session.ts`.
2. `tests/workbench_ui.test.tsx`: expect `tab-builder` in the tab order and that
   clicking it opens the panel (witness failure), then `src/ui/Workbench.tsx` +
   `ActivityBars.SOURCES`.
3. `src/builder/BuilderPanel.tsx` shell: `BuilderControls` furniture with a disabled
   "Open folder" and an empty state; `useBusyActivity("builder", busy)`; `useRunning`.
4. `appstore` slice + `sessionOf` + `useAppState` accessor.
5. CSS: append the `.bld-*` token block.
6. Docs: `docs/current/sor/svg-builder.md` stub (behaviour), router row, `OVERVIEW` mode
   list, `UI_SELECTORS` tab row.
7. Persistence: `src/lib/session.ts` gains the `builder` slice; `src/builder/persist.ts`
   gains `iconSplitter.builder.config.v1` + `.selection.v1` readers/writers (the P3
   fields are added to the same shapes, not to new keys).

Exit gate: tab opens, persists, no console errors, `npx tsc --noEmit`, lint, `quality:changed`.

### P1 — Discovery and library (~450 lines src, ~250 lines tests)

1. `tests/builder_scan.test.ts` with `tests/helpers/fakefs.ts` + `tests/helpers/pairfile.ts`:
   approved pair → one icon; declined → excluded with reason; missing SVG → excluded;
   `export/` ignored; `builder/` ignored; duplicate sidecar → one row.
2. `src/lib/builder/rows.ts` (`toBuilderIcon`, `filterIcons`, facets) — pure, tested.
3. `src/builder/scan.ts` (ticket + commit-once) + `useBuilder` boot with the
   `__builder__` handle slot.
4. `BuilderLibrary` + `BuilderRecipe` + `BuilderIconGrid`, with lazy SVG thumbnails via
   `useIconDoc` and a bounded limiter.
5. Empty/unsupported states.

Exit gate: real folder scan lists icons; audit line accurate; exclusion reasons visible.

### P2 — Layout and artboard render (the heart) (~500 lines src, ~350 lines tests)

1. `tests/builder_layout.test.ts`: port the reference invariants as assertions —
   banner on each side leaves the right content rect; grid never exceeds content;
   `fitScale === 1` when it fits; `overflow` true when it does not; caption block height
   follows `captionSize`; capacity = columns × rows.
2. `src/lib/builder/layout.ts`, `capacity.ts`, `contrast.ts`.
3. `src/lib/builder/place.ts` — placement planning incl. refusals (`text`, `image`,
   broken XML, empty document).
4. `BuilderArtboard` / `BuilderBanner` / `BuilderCells` rendering from derived data;
   zoom via `lib/zoom`; selection grid marks.
5. Tests are DOM-light: layout + placement pure tests carry the weight; one happy-dom
   render test asserts `data-cell` count and caption text.

Exit gate: a sheet renders with real approved artwork; zoom/fit works; overflow warns.

### P3 — Controls, presets, undo, persistence (~450 lines src, ~200 lines tests)

1. `tests/builder_config.test.ts`: `parseBuilderConfig` clamps every out-of-range field
   independently; `applyPreset` merges deeply; `configFingerprint` stable.
2. `src/lib/builder/config.ts` + `preset.ts`.
3. `BuilderControls` + four section files + `BuilderFields` primitives (dark).
4. `src/builder/store.ts`, `persist.ts`, `actions.ts`, `undo.ts`; `state/apply.ts`
   `ENTRY_TYPES += builderConfig | builderSelection | builderSeed`; `tests/apply.test.ts`
   updated deliberately; `builder_undo.test.ts` proves undo/redo + coalescing + refusal
   of a stale selection.
5. Session snapshot: config/selection/seed/recipe return after reload.

Exit gate: every control live-updates; undo from another tab works; reload restores.

### P4 — Recipes, locks, presets gallery (~350 lines src, ~200 lines tests)

1. `tests/builder_select.test.ts`: same seed → same slots (3 runs); threshold excludes
   below-threshold icons; fallback only when enabled and reported; locked icons keep
   their index; capacity change preserves locks and adds/removes trailing holes;
   shortfall reported.
2. `src/lib/builder/rng.ts`, `select.ts`; `src/builder/recipe.ts`.
3. Mode/profile/threshold/category controls, re-roll, clear, lock, "repeat from library"
   opt-in.
4. Preset gallery (3 shipped + user presets, save/delete, cap 20).

Exit gate: re-roll is reproducible; preset JSON round-trips.

### P5 — Export (serializer + PNG + disk) (~450 lines src, ~300 lines tests)

1. `tests/builder_serialize.test.ts`: the six guarantees of §5.4 — dimensions, nested
   `<svg>` per icon, one stroke declaration, real `<text>`, byte-identical output,
   parses + passes `validateSvg`.
2. `src/lib/builder/serialize.ts`, `sheet.ts`, `exportname.ts`.
3. `src/builder/exportrun.ts` + `BuilderExportDialog`: SVG download, PNG 1×/2×/3×,
   ZIP (sheet SVG + PNG + preset JSON), preset JSON; progress + completion sound.
4. `src/builder/raster.ts` with a decode-back dimension assertion.
5. `src/builder/exportcommit.ts`: `builder/` folder, create-only, collision suffixes,
   refusals reported; `tests/builder_commit.test.ts` on a fake FS.

Exit gate: exported SVG opens in Illustrator/Inkscape with editable paths and text;
sizes match the artboard; repeated export identical.

### P6 — Sheet metadata + provider parity (~400 lines src, ~250 lines tests)

1. `tests/builder_meta.test.ts`: default prompt states every rule the validator
   enforces; `parseSheetMetadata` rejects a missing label; validator enforces ≥10 unique
   tags incl. the 7 mandatory; a title with 3 words passes, 2 fails; fingerprint changes
   when the slot order changes and does not when only the zoom changes.
2. `src/lib/builder/meta.ts`, `metatarget.ts`.
3. `BuilderMetaPanel` (+ `PromptWindow` reuse, `KeySlot` reuse), provider card bound to
   the **shared** `configstore`/`keystore`.
4. `src/builder/metarun.ts` + confirmation dialog (disclosure lines: sheet size, icon
   count, captions sample, prompt, model) → `sendGemini` → parse → validate → store;
   interrupted-state journal (`iconSplitter.builder.meta.journal.v1`).
5. Model check via `listGeminiModels`.

Exit gate: request only after confirmation; refusal/timeout paths honest; metadata
survives reload and marks stale when the sheet changes.

### P7 — Polish: theme, a11y, hotkeys, docs (~300 lines src, ~150 lines tests)

1. Dark-theme pass over every builder surface (visual check + contrast assertions in one
   test on computed tokens).
2. Hotkeys (`R`, `L`, `F`, `+/-`, `Ctrl+E`, Q/E via `useSelectShortcuts`), documented in
   the selectors page.
3. `builderlog.ts` specs + `tests/secret_hygiene`-style assertion that no prompt text
   reaches the log.
4. Docs completion: `sor/svg-builder.md` (behaviour), `selectors/svg-builder.md`
   (handles), `sor/STORAGE.md` rows, `sor/OWNERS.md`, `sor/TESTS.md`,
   `sor/invariants/` new IDs (proposal: **I-86** builder approved-only library,
   **I-87** deterministic sheet reproduction) — IDs are assigned by the owner page, not
   invented here; if the owner map is full, extend it there.

Exit gate: `npm run verify` green; manual pass at 1280×800 and 1920×1080.

### P8 (optional, after P7) — "Needs work" jump link

A cell whose icon is approved but unplaceable (unsupported tags inside the SVG) gets a
"Open in Generate SVG" link that switches tab with that pair active — one `setAppState`
call, no coupling beyond the shared store.

---

## 9. Test plan (index)

| Area | Test file | What it proves |
|---|---|---|
| Shell | `tests/workbench_ui.test.tsx` (edited) | tab exists, order, opens, persists |
| Session | `tests/session.test.ts` (edited) | `builder` tab + slice parse/serialize; junk → defaults |
| Apply/undo | `tests/apply.test.ts` (edited), `builder_undo.test.ts` | new entry types validated; stale ids refused |
| Discovery | `builder_scan.test.ts` | approved-only, exclusions with reasons, ignores |
| Projection | `builder_rows.test.ts` | `BuilderIcon` mapping, tag fallback honesty, search facets |
| Layout | `builder_layout.test.ts` | banner/content/fit/overflow invariants |
| Placement | `builder_place.test.ts` | unsupported docs refused with reason; fit correct |
| Selection | `builder_select.test.ts` | seeded determinism, threshold, locks, shortfall |
| Config | `builder_config.test.ts` | per-field clamp, preset merge, fingerprint |
| Serializer | `builder_serialize.test.ts` | six guarantees; `validateSvg` passes |
| Raster | `builder_raster.test.ts` | decode-back dimensions per scale |
| Commit | `builder_commit.test.ts` | create-only, collision suffix, refusal report |
| Metadata | `builder_meta.test.ts` | prompt/validator/parse/fingerprint |
| Request | `builder_metarun.test.ts` | disclosure built, no auto-retry on unknown, refusal terminal |
| Privacy | extend `tests/secret_hygiene.test.ts` | no key/prompt/bytes in builder log specs |
| Storage | `builder_persist.test.ts` | every key validated on read; corrupt → defaults |

Test harness notes: `happy-dom` environment; fake FS via `tests/helpers/fakefs.ts`;
pair files via `tests/helpers/pairfile.ts`; transport stubs via
`tests/helpers/svgtransport.ts` pattern for the provider; never a live provider call.

---

## 10. Decisions needed before implementation

| # | Question | Options | Plan's recommendation |
|---|---|---|---|
| Q1 | **Metadata request shape** | (a) sheet PNG + text instruction (reuses `buildGeminiRequest` unchanged) · (b) text-only body (needs a tested variant) | (a) — zero new wire code, and the sheet render is the honest disclosed input |
| Q2 | **Validator for a collection** | (a) reuse `validateMetadata` verbatim · (b) builder variant: title ≥3 words, description ≥7, ≥10 tags incl. 7 mandatory | (b) — a collection title is not an "abstract idea of one icon" |
| Q3 | **Sheet metadata scope** | (a) one record per sheet · (b) per caption/icon too | (a) for P6; captions stay editable text the user types |
| Q4 | **Where exports go** | (a) browser download only · (b) also commit to `<root>/builder/` | both, with (b) opt-in and create-only |
| Q5 | **Icons unplaceable in the builder** (embedded `<text>`/`<image>`) | (a) refuse the cell with a reason · (b) rasterise the glyph | (a) — never silently degrade an editable export |
| Q6 | **Tag source when metadata is missing** | (a) filename tokens with an honest label · (b) hide the icon from "similar" | (a) with `tagSource: "filename"` shown in the tooltip |
| Q7 | **Tab label** | `SVG builder` (as requested) | confirmed — testid `tab-builder` |

---

## 11. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| `ENTRY_TYPES` / `TAB_IDS` / tab-order tests are pinned literal arrays | Red CI on a one-line change | Update them in the same commit as P0, deliberately, with the test's comment explaining why |
| `src/index.css` is 2 198 lines with global `.svg`, `.v2` scopes | Builder classes could leak into other tabs | Every builder class prefixed `.bld-`; no edits to existing selectors |
| 998-icon libraries | Library rail render cost | `LazyPreviewsToggle`-style lazy SVG thumbs + `readTextAt` limiter; the grid only parses a document when a cell is visible |
| Large sheet exports (4096² @3× = 12 288² canvas) | Browser canvas limits (~16 384 px, memory) | Cap PNG scale by area: 4096×3 is refused with a clear reason and the max allowed scale offered |
| Fonts: the reference uses Google fonts | App builds to one self-contained `dist/index.html`; a font CDN import would break offline and RULE 20 | Use the app's current stack; banner faces become `sans`/`serif`/`mono` **system** stacks. If custom faces are wanted later, they must be embedded (own decision, own phase) |
| DOM-measurement temptation (reference exporter) | Non-deterministic, zoom-dependent output | Serializer-only export; the DOM exporter is explicitly rejected in §2.2 |
| Scan of a different root while a sheet is composed | Cells point at files that no longer exist | `rootToken` invalidates caches; missing documents render as "missing" per cell, never a blank; selection ids pruned on rescan |
| Global undo + big configs | Timeline bloat (100 entries × config) | Coalescing by gesture key; config is ~1 KB so 100 entries ≈ 100 KB — acceptable, and capped by `MAX_HISTORY` |

---

## 12. Definition of done

* `npm run verify` green (tests + coverage, lint, quality gates, build).
* The tab opens from the top menu, restores after reload, and keeps working when the
  root is gone (empty state, not a crash).
* An approved-only library is listed with honest audit + exclusion reasons.
* A sheet can be composed, styled, captioned, zoomed, seeded, locked, undone, redone,
  saved as a preset and exported as (a) editable SVG that passes `validateSvg`,
  (b) PNG at 1×/2×/3×, (c) preset JSON, (d) committed into `<root>/builder/`.
* Sheet metadata can be generated only after an explicit confirmation that lists the
  disclosed inputs; the result is validated, persisted, and marked stale when the sheet
  changes.
* `docs/current/` owns the behaviour, selectors, storage keys, owners and tests for the
  new mode; this archive page is never edited afterwards.
