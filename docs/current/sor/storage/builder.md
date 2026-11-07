# Storage — SVG builder

Validate on read (RULE 13). Part of the [storage map](../STORAGE.md).

| Where | What | Rules |
|---|---|---|
| IndexedDB `iconSplitter/handles["__builder__"]` | the builder's root handle, in its own slot | falls back to SVG to upload's handle, then Generate SVG's; its persisted path rebinds to THIS handle (I-51/I-63) |
| IndexedDB `iconSplitter/rootpaths` | the picked folder's real path | shared with every tab: one record per folder handle, normalised and validated (I-29/I-39) |
| localStorage `iconSplitter.session.v1` → `builder` | the session slice `{ slots, locked, seed, recipe }` | validated field by field: a junk slot becomes a hole **in place** (position is the sheet's meaning), locks keep only placed ids, the seed is a positive integer (0 would re-seed), the recipe falls back per field and is capped at `BUILDER_MAX_SLOTS` = 256 |

**Shared, never duplicated:** the Gemini key (`iconSplitter/gemini-api-key`), the
provider config (`iconSplitter.upload.gemini.v1`), the metadata prompt
(`iconSplitter.upload.prompt.v1`) and its presets (`iconSplitter.upload.prompts.v1`).
The builder reads and writes the same records SVG to upload owns, so a key entered in
one tab is the key in the other (design §10, Q2).

The builder writes no pair sidecar and no artwork until it commits an export into its
own `builder/` folder (P5); that folder is excluded from the library walk
(`builder/scan`), so a placed sheet is never read back as an icon.
