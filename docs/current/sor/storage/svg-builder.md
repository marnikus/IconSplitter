# Storage — SVG builder

Back to the [storage map](../STORAGE.md) and [behaviour contract](../svg-builder.md). Every persisted value is validated field-by-field on read (RULE 13). No key, prompt bytes, image bytes or data URL is stored in localStorage.

| Where | What | Rules |
|---|---|---|
| `SESSION_KEY` builder slice | `checked` (positional, `~empty:N` holes), `activeId`, `anchorId`, `lockedIds`, `excludedIds` | parsed by `parseBuilderSlice`; unknown tab/slice → default; locks/exclusions are mirrored from the builder model so a reload keeps them |
| localStorage `iconSplitter.svgBuilder.config.v1` | full `SheetConfig` (banner text placement: `textPadding`, `titleDx/Dy`, `subtitleDx/Dy`; absent = 0) | `parseSheetConfig` clamps every field; one owner in `configstore.ts` |
| localStorage `iconSplitter.svgBuilder.prefs.v1` | zoom, fit, provider-card open state, layout choice (`editorial`/`masthead`/`plain`/`custom`), metadata widget `metaOpen` and dragged `metaHeight` (160–1200 px or null), artboard `showScores` and `scoreOpacity` (1–100), template picture height `templateZoom` (48–800 px) | `parseBuilderPrefs`; display-only, not undoable |
| localStorage `iconSplitter.svgBuilder.prompt.v1` | sheet metadata prompt | `parseBuilderPrompt`; default restored on junk, key never stored here |
| localStorage `iconSplitter.svgBuilder.prompts.v1` | prompt preset list | shared `presetStore`; validated on read |
| localStorage `iconSplitter.svgBuilder.templates.v1` | saved templates: `id`, `name` (1–60 chars), look-only `config` (banner title/subtitle/hero blank), `created`, `updated`; ≤ 60 | `parseTemplates`; junk entries dropped, duplicate ids keep the first; `templatestore.ts` |
| localStorage `iconSplitter.svgBuilder.listView.v1` | library query, category, sort | `parseBuilderListView`; display-only |
| localStorage `iconSplitter.upload.gemini.v1` | shared Gemini endpoint/model/limits | read on boot and written by `setGemini`; the builder does not own a second config |
| IndexedDB `iconSplitter/keys` | shared Gemini API key | `src/upload/keystore.ts`; key vault only, masked in UI and redacted from logs |
| `<approved svg>.index.json` beside each SVG | icon vector index: image (512-d CLIP) + text (384-d MiniLM) vectors as base64 float32, fingerprints, model ids | `parseIndexRecord`; corrupt/foreign = not indexed; rewritten by Icons indexing ([vector index](../svg-builder-index.md)) |
| `<root>/icon-map.json` | named icons → id, folder, files (preview, svg, svg.json, export.json, index, usage) | rewritten after each scan only when changed; `iconmapstore.ts` |
| IndexedDB `iconSplitter-models/files` | downloaded public model files (huggingface.co), keyed by URL | indexer worker cache only; no icon data or keys |
| IndexedDB `iconSplitter/handles["__svgBuilder__"]` | builder root handle | falls back to the older upload/SVG/selection handle; permission re-requested on restore |
| IndexedDB `iconSplitter/rootpaths` | full path of the picked folder | shared `rootpath` identity; read-only `builder-folder-path` |
| downloaded `{slug}-preset.json` | preset JSON v2 (2026-11-13): `format`, `version`, `name`, config, `icons` (`{name, id}` / `null`), `lockedIcons`, seed, recipe, metadata | `readPresetJson`: merged onto the sheet; also reads v1 `placedIds`/`selection` ids; unresolved icons reported; no filesystem write |

The session and history are global; builder config/checked entries use the shared timeline, never a panel-local stack. The exact 768 px JPEG preview and the provider draft live in memory only, are cleared on cancel, and are never persisted.
