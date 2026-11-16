# SVG builder tab — research and implementation plan

- Date: 2026-11-07
- Branch: `arena/82342cab-iconsplitter`
- Status: **PLAN ONLY**. No production code, behaviour, or UI has been changed by this document.
- Reference: `design temp/ref SVG constructor tab/`
- Screenshot: `/tmp/arena-coding-uploads/image-1.png` (attached in conversation; 2559×1890, readable)
- Purpose: plan how to add `SVG builder` as a seventh Workbench tab, using only the app's already-approved SVG assets, with the full shared folder widget, metadata prompt, Gemini provider connection, a dark-theme redesign, and well-split interfaces.

---

## 1. Ordered implementation steps (steps first)

### Step 0 — Freeze decisions and write the build contract
1. Confirm the four decisions in §9: Gemini output target, registration write policy, export destination, and default artboard colours.
2. Convert the relevant parts of this plan into `design/svgBuilder/SPEC.md` before coding: exact copy strings, states, failure texts, `data-testid` handles, persistence keys, and dark-theme tokens.
3. Write the first failing tests for tab routing, approved-only discovery, layout, selection seeding, and SVG composition. No live provider requests.

### Step 1 — Add the tab to the app shell without changing other tabs
1. Add `"svgBuilder"` to `TabId` and `TAB_IDS` in `src/lib/session.ts`.
2. Add a validated optional `builder` session slice; update `DEFAULT_SESSION`, `parseSession`, `serializeSession`, `AppState`, `initialAppState`, `sessionOf`, `useAppState` getters, and `patchBuilder`.
3. Add `{ id: "svgBuilder", label: "SVG builder", testid: "tab-svg-builder" }` to `TABS` in `src/ui/Workbench.tsx`.
4. Add a lazy-mounted `SvgBuilderWorkspace` that stays hidden after first visit, matching `UploadWorkspace`/`StockUploadWorkspace`, so a long composition or scan is not destroyed by a tab switch.
5. Keep the existing global `Nav`, `HistoryBar`, `LazyPreviewsToggle`, `ActivityBars`, `LogDock`, and `ScrollTopButton`. Do **not** add a second undo/redo bar or a second top-level header.
6. Tests: `tests/workbench_tabs.test.tsx` (or extend the existing tab suite), `tests/session.test.ts`, `tests/scroll_memory.test.tsx`.

### Step 2 — Extract shared Gemini/provider interfaces without changing upload behaviour
1. Keep the existing storage keys and key slot: `iconSplitter.upload.gemini.v1` and IndexedDB `gemini-api-key`.
2. Move the provider contract behind a shared facade, `src/lib/gemini/*`: `GeminiConfig`, defaults, parse/serialize, URL builders, `sendGemini`, `listGeminiModels`, and the redaction helpers. Leave `src/lib/upload/gemini.ts` as a thin compatibility re-export so upload imports keep working.
3. Extract the provider card from `src/upload/UploadControls.tsx` into `src/ui/GeminiProviderCard.tsx`, parameterised by `testIdPrefix`, title, config, model-check state, key state, and callbacks. `SVG to upload` keeps its `upload-*` handles; `SVG builder` uses `builder-*` handles.
4. Extract the model-check action into a shared hook so both cards call one implementation.
5. Reuse `src/ui/PromptWindow.tsx`, `src/ui/PromptPresetBar.tsx`, `src/ui/KeySlot.tsx`, `src/ui/presetops.ts`, `src/state/presetstore.ts`, `src/lib/keyvault.ts`, and `src/upload/keystore.ts`.
6. Tests: existing Gemini/upload suites must stay green; add a shared-card test that proves both prefixes render from one component.

### Step 3 — Build one shared approved-SVG catalog service
1. Refactor the discovery core out of `src/upload/discovery.ts` into `src/lib/approvedSvgCatalog.ts` with explicit options: `ignore`, `hideOutsideSplit`, and `audit labels`.
2. Preserve `UploadRowSource`, `UploadExclusion`, `UploadDiscovery`, and `discoverUploadSources()` as a compatibility wrapper with today's behaviour: `EXPORT_IGNORE = ["export"]`, split-scope filtering on, approved item + valid preferred SVG + no substitution for a missing selected version.
3. Add `discoverBuilderAssets(root)` with `hideOutsideSplit: false`, `ignore: ["export", "svg-builder"]`, because the builder must parse **all folders** under the selected root.
4. Reuse the improved mechanics already on this branch: `readDirTree()` (`WALK_CONCURRENCY = 24`), `walkTree()` canonical order, `loadPairFiles()` (`PAIR_READ_CONCURRENCY = 16`) with `paircache` session caching, `rebaseMeta()`, `parsePairMeta()`, `preferredVersion()`, `approvedValid()`, and file `size:mtime` fingerprints.
5. Source of truth remains the per-pair `<stem>.svg.json`: `PairMeta.review === "approved"`, `versions[].status === "generated"`, `validation.ok === true`, with `meta.preferred` when valid, else newest valid. No global manifest, no Lucide catalogue, no arbitrary SVG file outside the approved/preferred version.
6. Tests: `tests/approved_svg_catalog.test.ts`, `tests/svgBuilder_discovery.test.ts`, and the existing `tests/upload_discovery.test.ts` as an equivalence gate.

### Step 4 — Add explicit registration support, but keep normal scanning read-only
1. Extract the pure registration core from `src/svg/registerexisting.ts` and `src/lib/svgimport.ts` into a UI-free service, `src/svg/registration.ts`, with a narrow interface taking a root, pair rows, a validator, a reader, and a sidecar writer.
2. `Generate SVG` keeps its `Register existing SVGs` action and its `SvgRefs` progress bar; the builder calls the same service only through an explicit `Register approved SVGs found in all folders` button.
3. Normal `Open folder`, `Rescan`, and tab switching never write `.svg.json` files. Registration preserves item `review`, validates every SVG through `validateSvg()`, isolates per-folder failures, reports counts, uses `beginScan`/`scanseq`, and can be cancelled.
4. After a confirmed registration, invalidate the pair cache and rerun discovery once.
5. Tests: existing `svg_register_existing*.test.ts` plus `tests/svgBuilder_registration.test.ts`.

### Step 5 — Port the reference builder's pure domain, not its React app
1. Move `SheetConfig`, presets, `readableInk`, and seeded random helpers from `design temp/ref SVG constructor tab/src/lib/sheet.ts` into `src/lib/svgBuilder/sheet.ts`, with dark-friendly defaults and no imports from `data/icons.ts`.
2. Move `computeLayout()` and `wrapTitle()` into `src/lib/svgBuilder/layout.ts`; keep them pure and explicit.
3. Rewrite `chooseIcons()` as `selectAssets(assets, recipe)` in `src/lib/svgBuilder/selection.ts`: no module-level `ICONS`, deterministic `mulberry32(seed)`, locks, capacity, `similar`/`random`/`filtered` modes, threshold `shared tags ÷ reference tags`, explicit fallback, and honest pool-shortage notices.
4. Replace the reference's `data/icons.ts` with `BuilderIconAsset` records built from approved SVGs. Derive `label`, `category`, and fallback `tags` from `PairMeta.base`, `suffix`, and `dirPath`; optionally read already-accepted stock metadata from a committed `export.json` as tags, but never treat an `export/` file as an icon source.
5. Replace the DOM-scraping exporter with a pure `composeSheet()` in `src/lib/svgBuilder/compose.ts`: layout + config + asset SVG documents + accepted sheet metadata → one standalone SVG string. Keep editability, strokes, captions, banner, and `<title>/<desc>/<metadata>` traceability.
6. Add `src/lib/svgBuilder/svgAsset.ts` to parse, validate, sanitise, normalise a square `viewBox`, scope IDs, recolor strokes to `currentColor`, and fit an approved SVG into a cell. Extract the shared sanitizer from `src/lib/svgpreview.ts` instead of copying it.
7. Tests: `tests/svgBuilder_layout.test.ts`, `tests/svgBuilder_selection.test.ts`, `tests/svgBuilder_compose.test.ts`, `tests/svgBuilder_svgAsset.test.ts`.

### Step 6 — Build the dark-theme UI in small components
1. `src/svgBuilder/SvgBuilderPanel.tsx` wires the model only; no rules live here.
2. `SvgBuilderControls.tsx`: full-width folder widget + metadata prompt panel + Gemini provider card + status chips.
3. `SvgBuilderLibrary.tsx`: searchable, virtualised approved-icon library with selection recipe, category/tag filters, threshold, seed, re-roll, locks, and honest empty/broken states.
4. `SvgBuilderStage.tsx` + `SvgBuilderArtboard.tsx`: live zoomable artboard, presets, zoom controls, warning strip, and status footer.
5. `SvgBuilderInspector.tsx`: collapsible Artboard, Grid, Icon style, Banner, and Text sections, split into small field components.
6. `SvgBuilderExportMenu.tsx`: editable SVG, PNG, copy markup, and save preset.
7. `SvgBuilderBrief.tsx`: a dark modal that shows/copies the reference product brief; no network request.
8. `SvgBuilderDialogs.tsx`: exact-request Gemini confirmation, preset load/save, and registration confirmation.
9. `src/svgBuilder/svgBuilder.css`: namespace all new rules under `.builder-*`; reuse `.svg-btn`, `.svg-input`, `.svg-field`, `.svg-panel`, `.svg-note`, `.svg-chip`, `.prompt-window`, `.folder-*`, `.svg-provider*`, and `:root --v2-*` tokens. Do not port the reference's light `#EDEAE1` UI, Google-Fonts import, `lucide-react` dependency, or Tailwind utility soup.
10. Tests: `tests/svgBuilder_ui.test.tsx`, `tests/svgBuilder_controls.test.tsx`, `tests/svgBuilder_library.test.tsx`, `tests/svgBuilder_dark_theme.test.tsx` (token/class assertions, not pixel snapshots).

### Step 7 — Connect Gemini to sheet metadata, with informed consent
1. Add a builder-specific `SheetMetadata` model and deterministic parser/validator in `src/lib/svgBuilder/metadata.ts`: `title`, `subtitle`, `keywords`; bounded lengths; no brands; no automatic acceptance.
2. Add `iconSplitter.svgBuilder.prompt.v1` and `iconSplitter.svgBuilder.prompts.v1`, using the shared `PromptWindow` and existing preset store with `testId="builder"`.
3. The provider card uses the **same** Gemini config and key vault as `SVG to upload`; the user does not paste the key twice.
4. `Generate sheet metadata` opens an exact-request dialog showing: one JPEG preview of the composed sheet, the exact prompt, provider/model/endpoint, timeout/retries/parallel, and the fact that only that preview and prompt are sent. Send is disabled until the preview is ready.
5. `src/svgBuilder/runSheetMetadata.ts` calls the shared `buildGeminiRequest()` + `sendGemini()` with an injectable `fetch`, an `AbortSignal`, redacted failures, and the same retry policy: only provider-confirmed failures are retried; timeout/disconnect is outcome-unknown and is never auto-resent.
6. A parsed answer becomes a **draft**. The user explicitly accepts it before it updates the banner or is embedded in an export. Invalid answers stay drafts with the validator's exact errors.
7. No live provider requests are made during development or tests.

### Step 8 — Persistence, global undo, and state ownership
1. `src/svgBuilder/configstore.ts`: validated `iconSplitter.svgBuilder.config.v1`.
2. `src/svgBuilder/prefsstore.ts`: validated `iconSplitter.svgBuilder.prefs.v1` for zoom, provider-open, inspector-open, library thumb size, and preview background.
3. `src/svgBuilder/promptstore.ts`: builder prompt and presets; no key material.
4. `src/svgBuilder/listview.ts`: validated `iconSplitter.svgBuilder.listView.v1` using `src/state/listviewstore.ts`.
5. Root handle: `IndexedDB iconSplitter/handles["__svgBuilder__"]`, with fallback to `__upload__`, `__svg__`, `__selection__`; call `restoreKnownRoot()` on boot. Never persist SVG bytes or prompts in IndexedDB.
6. Add `builderChecked` and `builderConfig` to `ENTRY_TYPES` in `src/state/apply.ts`; add `src/svgBuilder/undoBinding.ts` so config changes join the **one global timeline**. Remove the reference builder's local `history`/`future` stacks.
7. `useSvgBuilder()` owns a reducer and stable action slices; `BuilderApi` is the only shape the panel sees. Use `useAppSlice("builder")` for checked/active/anchor IDs so hidden-tab selection state survives a tab switch.
8. Tests: `tests/svgBuilder_persistence.test.ts`, `tests/svgBuilder_undo.test.tsx`, `tests/session.test.ts`.

### Step 9 — Export and preset delivery
1. `src/svgBuilder/exporter.ts` builds a complete SVG/PNG blob in memory, then downloads once (RULE 23). `Copy SVG markup` uses `navigator.clipboard.writeText` and fails open with a clear message.
2. Verification gate before delivery: composed SVG parses and validates, canvas/blob is non-empty, every placed ID is present in the current approved registry, no unapproved asset is present, and asset fingerprints match the current scan (RULE 15/RULE 22).
3. `Save preset` writes a JSON with `config`, placed IDs, locked IDs, seed, accepted sheet metadata, and source fingerprints. `Load preset` validates the shape, prunes missing IDs, and says which IDs were dropped.
4. Default delivery is download/clipboard only; writing into the selected root requires an explicit `Save to folder` action, `writeFileNew()`, a dedicated `svg-builder/` folder, and no overwrite. Add that folder to the discovery ignore list.
5. Tests: `tests/svgBuilder_export.test.ts`, `tests/svgBuilder_preset.test.ts`.

### Step 10 — Documentation, selectors, and quality ledger
1. Add `docs/current/sor/svg-builder.md`, `docs/current/selectors/svg-builder.md`, `docs/current/sor/owners/svg-builder.md`, and `docs/current/sor/storage/svg-builder.md` only when the behaviour exists.
2. Add the new tab to `docs/current/README.md` task route, `docs/current/selectors/shared.md` §K, `docs/current/sor/OVERVIEW.md`, `docs/current/sor/OWNERS.md`, `docs/current/sor/STORAGE.md`, and the top-level `README.md`.
3. Keep each current page ≤ 9 KB; split into `-<part>` siblings if needed.
4. Append one measured dated entry to `docs/current/QUALITY_RECHECK.md` without reading the ledger.
5. Do not edit this archived plan to "catch up" (RULE 17).

### Step 11 — Verification and push
1. `npm run setup`, `npx tsc --noEmit`, `npm run lint`, `npm run quality:changed`, focused tests, `npm run verify:fast`, and `npm run verify` before push.
2. Confirm no `node_modules/`, `dist/`, `coverage/`, `.env*`, `*.key`, or secret-like file is staged.
3. Commit coherent scoped changes with `Verified:` and attribution.
4. Push only `origin arena/82342cab-iconsplitter`; do not create, switch, merge, or push another branch.

---

## 2. Research evidence

### 2.1 Repository and branch state
- Cloned repository: `marnikus/IconSplitter`, local HEAD `63f15b3 upd`, working branch `arena/82342cab-iconsplitter`, clean tree at the start of this plan.
- `origin` is reachable; `gh` is authenticated as `marnikus`; push permission is true. The session branch was not yet on the remote.
- `origin/main` is a shallow/grafted `d3cdfe5`. Git cannot compute a merge base in this clone; `git rev-list --left-right --count HEAD...origin/main` reports `1 1`. It is **not** an ancestor relationship that should be rebased onto. The local branch contains the newer parallel walk, pair-cache, and registration mechanics. Keep this branch as the source of truth and do not overwrite it with `main`.

### 2.2 Reference builder inventory
| Reference file | What it owns | Integration decision |
|---|---|---|
| `src/App.tsx` (704 lines) | local config/history/future, seed, selection, zoom, export menu, light header, toast | Split into shell, model, actions, stage, export menu, dialogs. Delete local undo/redo stacks in favour of global history. |
| `src/data/icons.ts` (302 lines) | ~80 Lucide icons with `id/name/category/tags/Icon` | Replace entirely with approved SVG assets from the selected root. Do not add `lucide-react` to the main app. |
| `src/lib/sheet.ts` (227 lines) | `SheetConfig`, presets, seeded selection, luminance helpers | Port to `src/lib/svgBuilder/` and inject the asset list; remove global `ICONS` dependency. |
| `src/lib/layout.ts` (125 lines) | banner/content/grid/cell geometry, `overflow`, `fitScale`, title wrapping | Port nearly as-is as a pure module; add tests for every banner position. |
| `src/lib/exporter.ts` (204 lines) | DOM scraping of `[data-cell]`, `[data-banner]`, computed styles, SVG/PNG/preset export | Replace with pure composition; DOM scraping is fragile for arbitrary approved SVGs and unsafe to reuse. |
| `src/components/IconSheet.tsx` (362 lines) | Lucide `<Icon>` rendering, banner hero, captions, locks | Replace Lucide component with a sanitised nested `<svg>` per `BuilderIconAsset`; keep layout and caption semantics. |
| `src/components/LibraryPanel.tsx` (312 lines) | recipe, profiles, threshold, category, search, icon grid | Port behaviour with dynamic categories/profiles from folder paths and tags; virtualise for ~1000 assets. |
| `src/components/ControlsPanel.tsx` (406 lines) | Artboard/Grid/Icon style/Banner controls | Split into small dark-theme field groups under one inspector component. |
| `src/components/PromptBrief.tsx` (458 lines) | light-theme product brief modal | Keep the content as a copyable dark modal; do not port the light markup. |
| `src/components/ui.tsx` (381 lines) | local field primitives | Reuse existing app `.svg-*` classes and `src/ui/*` primitives instead. |
| `src/index.css` | light cream theme, Google Fonts, dot stage | Do not import. Use app `--v2-*` tokens and system fonts because the production build is one offline `dist/index.html`. |

The attached screenshot shows two visual layers that must be reconciled: the dark `SVG to upload` application shell/controls above, and the light `glyph.` builder workspace below. The new tab must keep the dark shell/controls and restyle the builder workspace; it must not create a second application header.

### 2.3 Current app shell
- `src/ui/Workbench.tsx` owns six tabs, the global nav, `app-main`, progress mounts, log dock, history bar, and scroll memory.
- `src/lib/session.ts` owns `TabId`, `TAB_IDS`, validated session slices, and the restart snapshot. `src/state/appstore.ts` is a React-free module-scope store bound by `useSyncExternalStore`; `sessionOf()` projects it back to disk.
- `src/state/HistoryProvider.tsx` exposes `push`, `pushGesture`, `undo`, `redo`. `src/state/apply.ts` owns `ENTRY_TYPES` and validated undo applies. The reference builder's local `history`/`future` would violate RULE 12 and must not be ported.
- `src/ui/FolderBar.tsx` exposes `OpenFolderButton` and `FolderPathRow`. `src/ui/pickroot.ts` captures the real path from the user's clipboard, binds it to the folder handle, and calls `rememberKnownRoot`/`persistRootPath`. `src/ui/rootcapture.ts` handles Rescan retry and Ctrl+V recovery. This is the "full widget": green button, Rescan, scope/audit chips, and full-width read-only path row.
- `src/lib/fs.ts` `readDirTree()` now walks with `WALK_CONCURRENCY = 24`; `src/lib/scan.ts` `walkTree()` imposes deterministic case-insensitive order. `src/selection/pairstore.ts` `loadPairFiles()` reads sidecars with `PAIR_READ_CONCURRENCY = 16` and a session `paircache`; `loadMetaAt()` rebases a pair onto the picked root. These are the improved mechanics to reuse.
- Root handles are stored in IndexedDB by `src/batch/store.ts` with tab-specific keys such as `__upload__`, `__svg__`, and `__selection__`. `src/upload/scan.ts` shows the `bootRoot()` fallback chain and `restoreKnownRoot()`.

### 2.4 Approved-icon source of truth
- `src/lib/pairmeta.ts` defines `PairMeta` v2 in `<stem>.svg.json`: `id`, `base`, `suffix`, `dirPath`, `ai`, `source`, `decision`, `review`, `versions`, `preferred`, `imageVersions`, `imagePreferred`. The item-level `review` is mirrored into each version for older readers.
- `src/lib/svgmodel.ts` defines `ReviewStatus` and `SvgVersion`: `version`, `svgPath`, `status`, `review`, `validation`, timestamps, usage, cost, etc.
- `src/upload/discovery.ts` lists exactly one row per pair whose item `review === "approved"` and which has at least one `status === "generated"` and `validation.ok` version on disk. `preferredVersion()` chooses `meta.preferred` when valid; a missing selected version is reported, never silently replaced. `export/` is ignored. Corrupt sidecars, orphans, outside-split scope, duplicates, and unreadable files are reported with reasons.
- `src/svg/registerexisting.ts` and `src/lib/svgimport.ts` can register SVG files already in a folder into pair history, validate them, preserve item review, and write the pair's own `.svg.json`. `src/svg/registerimages.ts` does the analogous work for AI source images. This is a user action in Generate SVG, not an implicit scan side effect.

### 2.5 Metadata and Gemini infrastructure
- `src/upload/UploadControls.tsx` renders the folder widget, the metadata `PromptWindow`, and a contained Gemini provider card: model, endpoint, timeout, retries, parallel, model check, masked key, and provider note.
- `src/lib/upload/gemini.ts` owns `GeminiConfig`, `DEFAULT_BASE_URL`, `DEFAULT_MODEL = "gemini-3.1-flash-lite"`, the `x-goog-api-key` header, request/response parsing, and `sendGemini`.
- `src/upload/configstore.ts` persists `iconSplitter.upload.gemini.v1`; `src/upload/keystore.ts` wraps one IndexedDB `gemini-api-key` vault. The key is never in localStorage, logs, journals, or exports.
- `src/upload/modelcheck.ts` calls `listGeminiModels()` and never silently substitutes the configured model id.
- `src/upload/UploadMetaDialog.tsx` shows the exact prompt and the exact previewed image before any send. `src/upload/runmetadata.ts` renders a 512 px JPEG from the approved SVG, sends it with the prompt, parses/validates `Title/Description/Tags`, and journals outcome-unknown requests. `src/lib/upload/meta.ts` owns `IconMetadata`, `parseMetadata`, `validateMetadata`, `cleanMetadata`, and `metadataFingerprint`.
- RULE 20 requires local-by-default behaviour, explicit informed consent, disclosed inputs, no automatic sends, no keys/prompts/image bytes in logs, and no live provider calls during development/testing.

### 2.6 Rules and quality constraints
- RULE 4: distinguish empty from broken.
- RULE 5/7/9: progress, interruption, and disabled-option isolation.
- RULE 8: tests execute real logic, not mocks of the core.
- RULE 10: one control per decision; no duplicated provider/key/prompt stores.
- RULE 12: one global undo timeline.
- RULE 13: validate every persisted value on read.
- RULE 15/22/23: verify before delivery, trace output to approved sources, deliver atomically.
- RULE 16: new function ≤ 30 lines, ≤ 4 params, CC ≤ 10, nesting ≤ 4, new file ≤ 300 lines, ≤ 15 hooks/component; no gaming helpers.
- RULE 17: plans/designs go to `docs/archive/<date>-<topic>/`; current docs own only what is true today.
- RULE 18: prefer 150–300 line files, 5–15 cohesive files per module, current docs ≤ 9 KB.
- RULE 20: privacy/provider consent.
- RULE 21: semantic selectors first, stable `data-testid` where needed.
- RULE 25: if the library is implemented as a checkable list, reuse Batch's active/checked/anchor gestures, Q/E, and header scope.

---

## 3. Screenshot checklist — what the new tab must show

1. **Global header:** existing top tabs plus `SVG builder`; the active tab uses the existing indigo style. Keep `Any prevented`-style filter/status controls if they belong to the shell, plus Undo, Redo, `Unselect visible`, `History (N)`, lazy-preview toggle, and the global log dock. No duplicate brand header.
2. **Full folder widget:** `Open folder`, `Rescan`, approved-only/recursive scope copy, audit line, count chips, and the full-width read-only `Full path` row with the honest "path not captured" note. Use `OpenFolderButton`, `FolderPathRow`, `pickFolderFor`, and `retryCapture`.
3. **Metadata prompt:** a labelled `Sheet metadata prompt · saved locally · default/custom` window with reset, editable textarea, and preset list/quick-load/delete/save-as. It must not contain a key.
4. **Gemini connection:** provider card with model, endpoint, timeout, retries, parallel, `Check model` and its state line, masked key with source, forget/editor, and the privacy note. Same config/key as `SVG to upload`.
5. **Builder workspace:** left icon library/recipe, centre zoomable live artboard, right `Customize` inspector, top layout presets/zoom bar, bottom status/warning strip.
6. **Reference builder tools:** re-roll seed, prompt/spec brief, export menu (editable SVG, PNG, copy SVG, save preset), per-cell locks, search/tag/category filters, threshold, seed, empty-cell/overflow notices.
7. **Dark theme:** dark nav, panels, fields, buttons, chips, cards, modal, toasts, scrollbars, and dotted stage; the artboard remains a user-controlled document surface so black stroke icons stay visible. Provide an optional dark-artboard preset.
8. **Honest states:** no folder, unsupported browser, scanning, zero approved assets, corrupt/missing sidecars, unreadable SVGs, pool shortage, overflow, empty cells, provider check states, key states, metadata draft/invalid/accepted, export busy/failure.

---

## 4. Target architecture

```text
src/ui/Workbench.tsx
  └─ SvgBuilderWorkspace (lazy, hidden after first visit)
      └─ SvgBuilderPanel                    thin wiring only
          ├─ SvgBuilderControls            folder + prompt + Gemini + status chips
          ├─ SvgBuilderLibrary             approved assets + recipe + filters
          ├─ SvgBuilderStage               zoom + layout presets + Artboard
          ├─ SvgBuilderInspector           config sections
          ├─ SvgBuilderExportMenu / Brief / Dialogs
          └─ SvgBuilderStatusBar
              │
              ├─ useSvgBuilder()            reducer + stable action slices
              ├─ AssetRepository            FS reads, validation, LRU cache
              ├─ lib/svgBuilder/*           pure domain: sheet/layout/selection/compose/metadata
              ├─ lib/gemini/* + ui/GeminiProviderCard.tsx   one shared provider
              ├─ state/appstore + HistoryProvider           selection + global undo
              └─ exporter.ts                 verification + atomic delivery
```

### 4.1 Ownership boundaries
- `src/lib/svgBuilder/*`: pure geometry, selection, composition, metadata, preset validation. No React, no DOM scraping, no filesystem globals.
- `src/lib/approvedSvgCatalog.ts`: one approved-SVG discovery algorithm used by Upload and Builder.
- `src/svgBuilder/discovery.ts`, `repository.ts`, `scan.ts`, `registration.ts`: File System Access orchestration only.
- `src/svgBuilder/store.ts`, `configstore.ts`, `prefsstore.ts`, `promptstore.ts`, `listview.ts`: validated persistence.
- `src/svgBuilder/useSvgBuilder.ts`, `actions.ts`, `undoBinding.ts`: React state and global-history wiring.
- `src/svgBuilder/*.tsx`: presentation only; every value comes from `BuilderApi`.
- `src/ui/GeminiProviderCard.tsx` and `src/lib/gemini/*`: provider contract shared by Upload and Builder.
- `src/svgBuilder/svgBuilder.css`: namespaced dark-theme presentation only.

### 4.2 No duplicated ownership
| Value | One owner | Explicitly not duplicated in |
|---|---|---|
| Active tab | `state/appstore` / `lib/session` | `SvgBuilderPanel` |
| Checked/active/anchor asset IDs | `AppState.builder` | local `useState` |
| Sheet config | `configstore` + reducer | `ControlsPanel` local state |
| Gemini config/key | `upload/configstore` + `upload/keystore` | builder config/prompt stores |
| Approved asset list | `AssetRepository` from `.svg.json` | `data/icons.ts`, Lucide, global JSON registry |
| Undo/redo | `HistoryProvider` | reference `history`/`future` |
| Full path/root | `knownroots` + `rootstore` + `FolderBar` | builder-local path input |
| Export verification | `exporter.ts` | artboard DOM query |

---

## 5. Proposed interfaces

```ts
// src/lib/svgBuilder/types.ts
export interface BuilderIconAsset {
  id: string;                 // PairMeta.id / UploadRowSource.id
  base: string;
  suffix: string;
  label: string;              // humanised base + suffix
  category: string;           // derived from dirPath, fallback "Uncategorised"
  tags: readonly string[];    // path/base tokens + optional accepted export.json metadata
  svgPath: string;            // preferred approved version, root-relative
  svgName: string;
  version: number;
  fingerprint: string;        // size:mtime
  metaPath: string;           // <stem>.svg.json
  approved: true;
}

export interface BuilderDiscovery {
  assets: readonly BuilderIconAsset[];
  excluded: readonly { id: string; relPath: string | null; kind: string; reason: string }[];
  audit: {
    files: number; svgFiles: number; sidecars: number; pairs: number;
    rows: number; excluded: number; unreadable: number;
  };
  corruptFiles: readonly string[];
  unreadable: readonly { relPath: string; reason: string }[];
}

export interface AssetRepository {
  list(): readonly BuilderIconAsset[];
  byId(id: string): BuilderIconAsset | null;
  readSvg(id: string, signal?: AbortSignal): Promise<string | null>;
  render(id: string): Promise<{ ok: true; html: string; viewBox: string; ratio: number } | { ok: false; error: string }>;
  fingerprintOf(id: string): string | null;
  invalidate(rootToken: number): void;
}

export type SelectionMode = "similar" | "random" | "filtered";
export interface SelectionRecipe {
  mode: SelectionMode;
  profileId: string;
  threshold: number;
  category: string;
  count: number;
  seed: number;
  lockedIds: readonly string[];
  fillFromFullLibrary: boolean;
}

export interface SheetConfig {
  artboard: { width: number; height: number; background: string; padding: number; radius: number };
  grid: { columns: number; rows: number; gapX: number; gapY: number; captions: boolean;
          captionColor: string; captionSize: number; captionCase: "upper" | "normal" };
  icons: { box: number; strokeWidth: number; color: string; linecap: "round" | "square" };
  banner: { position: "left" | "right" | "top" | "bottom" | "none"; size: number;
            background: string; accent: string; textColor: string; subtitleColor: string;
            style: "solid" | "split"; title: string; subtitle: string;
            titleSize: number; subtitleSize: number; titleFace: "sans" | "serif" | "mono";
            hero: boolean; heroIconId: string | null; divider: boolean };
}

export interface SheetLayout {
  content: Rect; banner: Rect | null; grid: Rect | null;
  cells: readonly CellFrame[]; fitScale: number; overflow: boolean; capacity: number;
}

export interface SheetMetadata {
  title: string;
  subtitle: string;
  keywords: readonly string[];
  state: "empty" | "draft" | "invalid" | "accepted" | "edited";
  validation: { ok: boolean; errors: readonly string[]; warnings: readonly string[] } | null;
  fingerprint: string | null;
}

export interface SheetDocument {
  svg: string;                 // standalone, validated, editable
  title: string;
  placedIds: readonly string[];
  sourceFingerprints: readonly { id: string; fingerprint: string }[];
  configFingerprint: string;
  metadata: SheetMetadata | null;
}

export interface GeminiProviderCardProps {
  testIdPrefix: "upload" | "builder";
  title: string;
  config: GeminiConfig;
  modelCheck: ModelCheck;
  keySet: boolean;
  keyMask: string;
  keySource: KeySource;
  open: boolean;
  onConfig: (patch: Partial<GeminiConfig>) => void;
  onCheckModel: () => void;
  onOpen: (open: boolean) => void;
  onSaveKey: (key: string) => void;
  onForgetKey: () => void;
  note: string;
}

export interface BuilderApi extends BuilderModel, BuilderActions {
  supported: boolean;
  checked: readonly string[];
  activeId: string | null;
  visibleAssets: readonly BuilderIconAsset[];
  layout: SheetLayout;
  document: SheetDocument | null;
  repository: AssetRepository;
}
```

The exact TypeScript shapes are a contract sketch, not code. Group by domain concept to stay under the 4-parameter gate; do not introduce `options: any`.

---

## 6. Critical data flows

### 6.1 Folder pick → approved registration → asset library
```text
Open folder
  → pickFolderFor(take) captures path + stores __svgBuilder__ handle
  → restoreKnownRoot / retryCapture
  → readDirTree(root, ["export", "svg-builder"])   parallel, deterministic
  → loadPairFiles()                               parallel, session-cached, rebased
  → PairMeta review/versions/preferred gate
  → discoverBuilderAssets(root)                    all folders; no split-scope hiding
  → AssetRepository registers stable id + fingerprint
  → read/validate SVG lazily for thumbs and composition
```
Normal flow is read-only. Corrupt sidecars, unreadable SVGs, declined/pending items, orphans, and duplicates are counted and named, never silently included. The optional registration action is the only path that writes `.svg.json`.

### 6.2 Asset rendering
1. `readSvg(id)` uses `readSvgFile()` and a cache keyed by `(rootToken, svgPath, fingerprint)`.
2. `validateSvg()` rejects scripts, event handlers, remote URLs, `<foreignObject>`, and non-renderable documents.
3. A shared sanitizer adds `xmlns`, a square/fitted `viewBox`, `preserveAspectRatio`, scoped IDs, `currentColor`, and no remote references.
4. `SvgBuilderAssetThumb` paints inside a shadow root, like `SvgPreviewBox`, so an approved SVG cannot restyle the app or fetch the network.
5. `composeSheet()` uses the same sanitized document source as the preview; preview and export cannot drift.

### 6.3 Config change → global undo
```text
Inspector field → BuilderActions.setConfig(patch)
  → reducer validates/clamps and updates BuilderModel
  → useHistoryActions().push/pushGesture({ type: "builderConfig", before, after })
  → persistence effect writes validated config
  → layout + artboard + document recompute via useMemo
```
Slider drags use `pushGesture` with an absolute `after`, so coalescing cannot lose the first edit. Undo works even when the builder tab is hidden by binding an applier like `src/upload/uploadundo.ts`.

### 6.4 Gemini sheet metadata
```text
Generate sheet metadata
  → compose current sheet locally
  → render one bounded JPEG preview
  → exact-request dialog: preview + prompt + provider facts + key state
  → user confirms
  → buildGeminiRequest(prompt, preview) → sendGemini(config, key, signal)
  → parseSheetMetadata / validateSheetMetadata
  → draft shown with errors/warnings
  → explicit Accept updates banner title/subtitle and export metadata
```
No automatic call on tab open, folder scan, preset load, or export. A failed or outcome-unknown request is never auto-resent. Stop cancels unsent work.

### 6.5 Export
```text
Export menu → composeSheet() → validate composed SVG → verify asset IDs/fingerprints
  → build complete Blob → optional canvas PNG → one download / clipboard write
  → honest success or failure toast
```
The source `.svg.json` and approved SVG files are never modified. Output filenames derive from the accepted sheet title and a config fingerprint; the SVG `<metadata>` carries placed IDs and source fingerprints (RULE 22).

---

## 7. Proposed file map

| Path | Responsibility | Approx. size target |
|---|---|---:|
| `src/lib/gemini/*` | shared config, request, model list, redaction | 5 files |
| `src/lib/approvedSvgCatalog.ts` | one approved-SVG discovery core | ≤ 300 lines, split if needed |
| `src/lib/svgBuilder/types.ts` | domain types | ≤ 120 lines |
| `src/lib/svgBuilder/sheet.ts` | config defaults, presets, clamps, colour helpers | ≤ 200 lines |
| `src/lib/svgBuilder/layout.ts` | pure geometry | ≤ 160 lines |
| `src/lib/svgBuilder/selection.ts` | seeded asset selection and scoring | ≤ 200 lines |
| `src/lib/svgBuilder/svgAsset.ts` | parse/sanitise/normalise one approved SVG | ≤ 250 lines |
| `src/lib/svgBuilder/compose.ts` | pure standalone sheet SVG builder | ≤ 300 lines |
| `src/lib/svgBuilder/metadata.ts` | sheet metadata parse/validate/clean | ≤ 180 lines |
| `src/lib/svgBuilder/preset.ts` | preset parse/serialise/prune | ≤ 150 lines |
| `src/svgBuilder/discovery.ts` | builder-specific discovery wrapper + audit | ≤ 160 lines |
| `src/svgBuilder/repository.ts` | FS asset repository and LRU cache | ≤ 220 lines |
| `src/svgBuilder/scan.ts` | boot root, scan ticket, scan key | ≤ 180 lines |
| `src/svgBuilder/registration.ts` | explicit registration adapter | ≤ 180 lines |
| `src/svgBuilder/configstore.ts` / `prefsstore.ts` / `promptstore.ts` / `listview.ts` | validated persistence | 4 files |
| `src/svgBuilder/statemodel.ts` / `actions.ts` / `useSvgBuilder.ts` / `undoBinding.ts` | reducer, stable actions, hook, global undo | 4 files |
| `src/svgBuilder/SvgBuilderPanel.tsx` | thin wiring | ≤ 150 lines |
| `src/svgBuilder/SvgBuilderControls.tsx` | folder + prompt + provider + chips | ≤ 220 lines |
| `src/svgBuilder/SvgBuilderLibrary.tsx` | library and recipe | ≤ 260 lines |
| `src/svgBuilder/SvgBuilderStage.tsx` / `SvgBuilderArtboard.tsx` | stage and artboard | 2 files |
| `src/svgBuilder/SvgBuilderInspector.tsx` + field components | config controls | 3–5 files |
| `src/svgBuilder/SvgBuilderDialogs.tsx` / `SvgBuilderExportMenu.tsx` / `SvgBuilderBrief.tsx` / `SvgBuilderStatusBar.tsx` | dialogs, export, brief, status | 4 files |
| `src/svgBuilder/svgBuilder.css` | namespaced dark-theme rules | ≤ 300 lines |
| `tests/svgBuilder_*.test.ts(x)` | real logic + DOM tests | one file per concern |

Do not copy the reference's `@/` alias, package, `index.html`, `main.tsx`, `vite.config.ts`, or `package-lock.json`; the main app already has its own Vite single-file build and dependency set.

---

## 8. Dark-theme contract

| Reference light token | App replacement |
|---|---|
| `#EDEAE1` page / `#EAE7DF` stage | `var(--v2-bg)` / `var(--v2-surface)` with a dotted dark stage |
| `#FBFAF6` panels/header | `var(--v2-surface-2)` and `var(--v2-surface-3)` |
| `#E1DDD0` borders | `var(--v2-line)` / `var(--v2-line-strong)` |
| `#252C25` text | `var(--v2-text)` |
| muted `#9B9D8E` | `var(--v2-muted)` / `var(--v2-muted-2)` |
| green `#24362A` primary | `#17714c` `.folder-open` green or `var(--v2-purple)` `.svg-btn.primary` |
| lime `#D9F36C` accent | `var(--v2-green)` for success/approved; keep lime only as an artboard accent option |
| warning/red | `var(--v2-yellow)` / `var(--v2-red)` and their background tokens |
| DM Sans / Instrument Serif / DM Mono | system `ui-sans-serif`, `ui-serif`, `ui-monospace`; no external font import |

The artboard is a document, not chrome. Default to the reference's light paper surface (`#F4F0E7`) with dark strokes so approved black SVGs remain visible; offer a `Dark artboard` preset with a dark fill and light stroke override. UI chrome, library cards, inspector, dialogs, toolbar, status bar, and toasts are always dark. Focus rings use `var(--v2-purple-2)`; success uses `var(--v2-green)`; the folder button remains the existing green `.folder-open`.

---

## 9. Decisions to confirm before implementation

1. **Gemini target.** Recommended: one explicitly confirmed request that generates `title`, `subtitle`, and `keywords` for the whole composed sheet from one previewed JPEG. Alternative: batch per-icon metadata to build tags for every approved asset, reusing `runmetadata.ts`; this costs more requests and needs a larger consent UI. A third option is to share only the config/key/card and offer no builder-specific send. The plan above assumes option 1.
2. **Registration write policy.** Recommended: discovery is read-only; a separate explicit button registers already-present SVG files into `.svg.json` using the shared service. Do not auto-write sidecars on tab open or rescan.
3. **Export destination.** Recommended: downloads/clipboard only in v1, with an explicit `Save to folder` action writing into a new `svg-builder/` folder with no overwrite. Do not write into `export/` or overwrite source SVGs.
4. **Default artboard.** Recommended: light paper artboard inside dark chrome, plus a dark preset. Confirm whether the screenshot's dark-green banner and cream sheet should remain as the default output look.
5. **Asset categories/tags.** Recommended: derive from folder names, `base`, `suffix`, and optional accepted `export.json` metadata; do not infer tags with Gemini without a separate confirmed batch flow.
6. **Library list gestures.** If the library becomes a checkbox list, implement RULE 25 with `AppState.builder.checked/activeId/anchorId`; if it remains a grid of `aria-pressed` toggle cards, document that it is not a checkable list and keep keyboard navigation equivalent.

---

## 10. Selector and persistence plan

### 10.1 Stable handles (prefix `builder-`)
- Shell: `tab-svg-builder`, `builder-panel`, `builder-shell`.
- Folder: `builder-open-folder`, `builder-open-folder-empty`, `builder-folder-path`, `builder-rescan`, `builder-scope-copy`, `builder-audit`, `builder-count-*`.
- Prompt/provider: `builder-prompt-panel`, `builder-prompt`, `builder-prompt-reset`, `builder-preset-*`, `builder-provider-card`, `builder-model`, `builder-endpoint`, `builder-model-check`, `builder-model-state`, `builder-timeout`, `builder-retries`, `builder-concurrency`, `builder-key-state`, `builder-key-input`, `builder-key-save`, `builder-key-forget`, `builder-provider-note`.
- Library: `builder-library`, `builder-search`, `builder-recipe-mode`, `builder-recipe-profile`, `builder-threshold`, `builder-category`, `builder-seed`, `builder-shuffle`, `builder-clear`, `builder-asset-{id}`, `builder-lock-{id}`, `builder-register-approved`.
- Stage/inspector: `builder-stage`, `builder-artboard`, `builder-cell-{n}`, `builder-layout-{presetId}`, `builder-zoom-in`, `builder-zoom-out`, `builder-zoom-fit`, `builder-inspector`, `builder-artboard-width`, `builder-grid-cols`, `builder-grid-rows`, `builder-icon-box`, `builder-stroke-width`, `builder-stroke-color`, `builder-banner-title`, `builder-banner-position`.
- Export/dialogs/status: `builder-export`, `builder-export-svg`, `builder-export-png`, `builder-export-copy`, `builder-export-preset`, `builder-brief`, `builder-meta-dialog`, `builder-meta-preview`, `builder-meta-prompt`, `builder-meta-confirm`, `builder-meta-cancel`, `builder-statusbar`, `builder-toast`, `builder-busy`, `builder-empty`, `builder-unsupported`.

Semantic role/label/text queries remain first choice; `data-testid` is the explicit handle where structure is ambiguous (RULE 21).

### 10.2 Storage keys
| Where | Value | Rule |
|---|---|---|
| `iconSplitter.session.v1` | existing key; optional `builder` slice | no version bump; unknown/missing slice → safe default |
| `iconSplitter.upload.gemini.v1` | shared Gemini config | one writer; builder reads/writes through shared adapter |
| IndexedDB `gemini-api-key` | shared key vault | never copied into builder stores or logs |
| `iconSplitter.svgBuilder.config.v1` | validated `SheetConfig` | clamped on read; corrupt → default |
| `iconSplitter.svgBuilder.prefs.v1` | zoom, provider/inspector open, preview bg, library thumb | display-only |
| `iconSplitter.svgBuilder.prompt.v1` | builder sheet prompt text | no key, no image bytes |
| `iconSplitter.svgBuilder.prompts.v1` | builder prompt presets | shared bounded preset store |
| `iconSplitter.svgBuilder.listView.v1` | search/filter/sort | shared list-view store |
| IndexedDB `iconSplitter/handles["__svgBuilder__"]` | picked root | fallback chain; permission re-request |
| IndexedDB `iconSplitter/rootpaths` | handle-bound full path | owned by `knownroots`/`rootstore` |
| Downloaded preset JSON | config + IDs + seed + metadata + fingerprints | validated on load; no key |

No global approved-icon registry JSON is written. The registry is a validated in-memory/session cache derived from the per-pair `.svg.json` files.

---

## 11. Test strategy

| Concern | Test file(s) | Must prove |
|---|---|---|
| Tab/session | `workbench_tabs.test.tsx`, `session.test.ts` | seventh tab, restart, backward-compatible session parse |
| Shared provider contract | new `gemini_provider_card.test.tsx`, existing upload suites | one component, two prefixes, upload behaviour unchanged |
| Approved catalog | `approved_svg_catalog.test.ts`, `svgBuilder_discovery.test.ts`, existing `upload_discovery.test.ts` | all folders for builder, unchanged split scope for upload, no declined/orphan/export SVG, preferred missing file not substituted |
| Registration | `svgBuilder_registration.test.ts`, existing `svg_register_existing*.test.ts` | explicit only, review preserved, invalid skipped, per-folder failure isolated, cache invalidated |
| Geometry | `svgBuilder_layout.test.ts` | all banner positions, padding, gaps, captions, overflow, fit scale, deterministic cells |
| Selection | `svgBuilder_selection.test.ts` | same seed/settings → same order, locks, threshold, fallback opt-in, no duplicates, blank cells |
| SVG asset | `svgBuilder_svgAsset.test.ts` | 24×24 and width/height-only SVGs, unsafe content rejected, IDs scoped, strokes normalised, no remote URLs |
| Composition/export | `svgBuilder_compose.test.ts`, `svgBuilder_export.test.ts` | editable SVG, captions, banner, metadata, traceability, verification gate, atomic blob |
| Metadata | `svgBuilder_metadata.test.ts`, `svgBuilder_runSheetMetadata.test.ts` | exact prompt/preview, injectable fetch, no live calls, draft/accept, invalid errors, no auto-retry on unknown outcome |
| Persistence/undo | `svgBuilder_persistence.test.ts`, `svgBuilder_undo.test.tsx` | corrupt payload fallback, one global timeline, hidden-tab apply |
| UI/dark theme | `svgBuilder_ui.test.tsx`, `svgBuilder_controls.test.tsx`, `svgBuilder_library.test.tsx`, `svgBuilder_dark_theme.test.tsx` | semantic handles, empty vs broken, folder path, provider states, dark token classes, no light-theme root |

All new `src/lib/svgBuilder/` functions need a test that would fail if the function were deleted or a boolean inverted (RULE 8/16.3). Happy-DOM is the acceptance gate; a real browser probe is optional evidence only.

---

## 12. Verification and delivery checklist

```text
[ ] npm run setup
[ ] npx tsc --noEmit
[ ] npm run lint
[ ] node tools/quality.mjs --changed --allow-legacy
[ ] focused vitest suites
[ ] npm run verify:fast
[ ] npm run verify
[ ] no new function >30 lines, >4 params, CC >10, nesting >4
[ ] no new file >300 lines without a split-by-responsibility reason
[ ] no local undo timeline, second key, second prompt store, or global icon manifest
[ ] no Lucide/Google Fonts/new package dependency
[ ] no live provider request during development or tests
[ ] no key, prompt, image bytes, or data URL in logs/journals/exports
[ ] current docs, selectors, owners, storage, README, and quality ledger updated when code lands
[ ] git status contains only intended files
[ ] commit message includes `Verified:` and attribution
[ ] git push origin arena/82342cab-iconsplitter
```

This planning commit itself changes documentation only. It is not a claim that the builder has been implemented or that any verification lane has been run for production code.

---

## 13. Verification of this planning commit

`npm run verify` was run on 2026-11-07. Because this commit changes documentation only, the result is reported honestly rather than claimed as a full pass:

- PASS: `npm run setup`; TypeScript `npx tsc --noEmit --incremental` (20.1 s); ESLint (0 errors, 23 existing warnings); changed-file quality gate (`GATE PASSED`, no changed `src/` files); Vite single-file build (9.1 s).
- FAIL, unrelated to this docs-only diff: native performance lane `tests/algo_efficiency.test.ts` (synthetic 1000 px detect 239.2 ms vs a 200 ms budget); tests+coverage `tests/bridge_ftps.test.ts` (missing `cache-control: no-store` header) and `tests/docs_navigation.test.ts` (four existing current docs are 9016–9088 bytes, above the 9000-byte test budget).
- Test totals in the coverage lane: 4057 passed, 2 failed, 4059 total. No production source was changed, no live provider request was made, and no browser UI was exercised.
- The plan therefore remains a design/architecture deliverable. Implementation must resolve or explicitly waive those unrelated baseline failures before claiming a green pre-push gate.
