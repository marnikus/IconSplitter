# Storage — SVG builder

Back to the [storage map](../STORAGE.md) and [behaviour contract](../svg-builder.md). Every persisted value is validated field-by-field on read (RULE 13). No key, prompt bytes, image bytes or data URL is stored in localStorage.

| Where | What | Rules |
|---|---|---|
| `SESSION_KEY` builder slice | `checked`, `activeId`, `anchorId`, `config`, `seed`, `lockedIds`, `recipe` | parsed by `parseBuilderSlice`; unknown tab/slice → default |
| localStorage `iconSplitter.svgBuilder.config.v1` | full `SheetConfig` | `parseSheetConfig` clamps every field; one owner in `configstore.ts` |
| localStorage `iconSplitter.svgBuilder.prefs.v1` | zoom, fit, provider-card open state, layout choice (`editorial`/`masthead`/`plain`/`custom`) | `parseBuilderPrefs`; display-only, not undoable |
| localStorage `iconSplitter.svgBuilder.prompt.v1` | sheet metadata prompt | `parseBuilderPrompt`; default restored on junk, key never stored here |
| localStorage `iconSplitter.svgBuilder.prompts.v1` | prompt preset list | shared `presetStore`; validated on read |
| localStorage `iconSplitter.svgBuilder.listView.v1` | library query, category, sort | `parseBuilderListView`; display-only |
| localStorage `iconSplitter.upload.gemini.v1` | shared Gemini endpoint/model/limits | read on boot and written by `setGemini`; the builder does not own a second config |
| IndexedDB `iconSplitter/keys` | shared Gemini API key | `src/upload/keystore.ts`; key vault only, masked in UI and redacted from logs |
| IndexedDB `iconSplitter/handles["__svgBuilder__"]` | builder root handle | falls back to the older upload/SVG/selection handle; permission re-requested on restore |
| IndexedDB `iconSplitter/rootpaths` | full path of the picked folder | shared `rootpath` identity; read-only `builder-folder-path` |
| downloaded `{slug}-preset.json` | `version`, `generator`, `created`, config, `selection` (= `placedIds`), source fingerprints, locks, seed, recipe, accepted metadata | `parseSheetPreset` also reads the reference `{version, selection, seed}` shape; prunes stale ids; no filesystem write |

The session and history are global; builder config/checked entries use the shared timeline, never a panel-local stack. The exact 768 px JPEG preview and the provider draft live in memory only, are cleared on cancel, and are never persisted.
