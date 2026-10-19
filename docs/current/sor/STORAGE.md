# Storage map — current keys and files

Jump to a domain; validate everything read from storage (RULE 13). Image-edit keys carry metadata only, never image bytes or prompts.

## Batch and sheets

| Where | What | Rules |
|---|---|---|
| localStorage `iconSplitter.presets.v1` | preset list (JSON) | validated on read (RULE 13) |
| localStorage `iconSplitter.lastPreset.v1` | last-used preset name | restores on boot |
| IndexedDB `iconSplitter/handles` | source/dest directory handles per preset | permission re-requested on restore |
| IndexedDB `iconSplitter/handles` store `batchPreviews` (DB v4, `PREVIEW_STORE`) | one rendered batch preview per row: key `<rootName>::<relPath>`, value `{ relPath, count, thumbs, boxes, status: "done", rootName, at, key }` — `key` is the `previewKey` the record was rendered under (I-68); the fallback-shaped record an undecodable file produced is what persists | validated entry-by-entry on read (`isStoredPreview`, RULE 13): junk → that row is simply not restored; written on every rendered `done` preview (`at` = write time); "↺ Regenerate splits" overwrites the row, plain Preview reuses it while the key matches the current settings and re-renders stale rows; Clear deletes this root's rows |
| localStorage `iconSplitter.batch.merges.v1` | per-item split decisions per preset: `{"<preset>": {"<relPath lowercase>": 0…0.15 \| null}}` (`lib/batchmerges`, I-67) | validated entry by entry on read (RULE 13): junk value/key → that entry only; capped at 500 rows per preset and 20 presets (oldest preset dropped); written by the ONE `rowMerges` effect in `useBatch`; pruned on scan; a preset's map dies with the preset (Delete) |
| `<refDir>/<base>.json` | per-reference source status records | rewritten after every scan/batch; app-owned, overwrite allowed |
| `<root>/_split_output/…` or custom dest | batch outputs | never overwritten (I-8) |

## Selection

| Where | What | Rules |
|---|---|---|
| `<root>/review-decisions.json` | **legacy** approve/decline records — read as a fallback only | never written or deleted by this build (I-42); a local pair file wins; corrupt → warn + keep memory (I-12) |
| IndexedDB `iconSplitter/handles["__selection__"]` | selection root handle (shared by both Selection tabs) | permission re-requested on restore |
| localStorage `iconSplitter.selectionV2.prefs.v1` | V2 view prefs `{ mode, thumbHeight }` | validated + clamped on read (RULE 13) |

## Generate SVG and image edits

| Where | What | Rules |
|---|---|---|
| IndexedDB `iconSplitter/handles["__svg__"]` | Generate SVG root handle | falls back to the Selection handle |
| localStorage `iconSplitter.svg.prefs.v1` | SVG tab view prefs `{ thumbHeight, providerOpen, previewBg }` | clamped/validated on read (RULE 13); a missing/non-boolean `providerOpen` keeps the model card open |
| localStorage `iconSplitter.svg.imageEditBatch.v1` | independent image-edit icons/request `{ v: 1, count }` (default 4, 1–16; active square size further limits useful cells) | validated integer/version on read; corrupt → default + visible warning in image confirmation; never provider output `n` |
| localStorage `iconSplitter.svg.imageInflight.v1` | metadata only for sent image-edit groups: group id, pair IDs, sent/review state, time, provider/model and optional request ID | validated/bounded; corrupt → empty + warning; never bytes/prompt/key; cleared on confirmed save/discard or known failure, unknown transport outcome remains until dismissal/deliberate retry |
| localStorage `iconSplitter.svg.prompt.v1` | generation prompt | empty/missing → documented default |
| localStorage `iconSplitter.svg.connections.v1` | saved provider setups `{ v, activeId, list }` (2026-10-16): name, kind text\|image, base, model, image params | junk → shipped defaults (GPT 6.1 Sol text + Sunburst image); unknown activeId → first; the active connection mirrors the live config's base+model (one writer, `statemodel` "connections") |
| localStorage `iconSplitter.svg.prompts.v1` | the Generate SVG prompt presets `{ v, presets: [{ name, text }] }` | validated entry by entry (names trimmed 1–60, text ≤ 8000), duplicates keep the last, capped at 50 (`lib/promptpresets`, `state/presetstore`) |
| localStorage `iconSplitter.svg.regen.v1` | "Regenerate SVG from" choice + the saved prompt's name | validated on read (RULE 13); the saved prompts are `iconSplitter.svg.prompts.v1` |
| localStorage `iconSplitter.svg.config.v1` | provider settings (base URL, model id, stall window, retries, concurrency, images/request, max tokens) | clamped on read (RULE 13) |
| localStorage `iconSplitter.svg.inflight.v1` | the in-flight journal: run/batch id, source ids + names, model, start time, provider request id — no key, no prompt, no answer | validated on read; corrupt = empty; cleared when a request gets a confirmed outcome |
| IndexedDB `iconSplitter/secrets` | Requesty API key | never in localStorage, presets, reports or Git (RULE 20); DB version 2 added this store — an install that predates it upgrades on first open, and a write that still fails falls back to a session-only key the UI names as such |
| `<dir>/<stem>.svg` | one generated SVG version | never overwritten; `_v2`, `_v3`… allocated from disk + the pair file |
| `<dir>/<stem>.svg.json` | **the pair's own file** (I-41): pair identity + both image faces + the pair's `decision` + one record per SVG version (status, review, prompt, provider/model, timestamps, tokens, cost + basis, validation, error, batch ref) + the AI source's own regeneration history (`imageVersions[]`, `imagePreferred` — 2026-10-16, see I-71) | one file per pair, beside its images; atomic write; corrupt → named + decision kept (I-43); a legacy `v: 1` file keeps its versions and upgrades on the next write (I-42) |

## Shared paths and log

| Where | What | Rules |
|---|---|---|
| IndexedDB `iconSplitter/rootpaths` | the picked folders' real full paths, records `[{ handle, path, how }]` — one per folder HANDLE (I-63) | normalised + validated on write and read (I-29/I-39); identity is `isSameEntry`, never the name; capped at 20; never leaves the browser. The old name-keyed `localStorage iconSplitter.rootpaths.v1` is **never read** (a guess may not survive as data, I-59) |
| localStorage `iconSplitter.log.v1` | the global activity log: `{ v, max, minimized, entries }` | validated + re-sanitised on read; foreign version or corrupt JSON → the default state (I-25); cap 50–1000 governs display and storage; no key, header, data URL or payload may enter it (I-24) |

## SVG to upload

| Where | What | Rules |
|---|---|---|
| IndexedDB `iconSplitter/handles["__upload__"]` | SVG to upload root handle | falls back to the Generate SVG handle, then the Selection handle |
| localStorage `iconSplitter.upload.settings.v1` | upload settings `{ v, defaults, overrides }` (global defaults + per-icon overrides map) | validated/clamped on read (RULE 13): `background` is `transparent` or a hex (a missing or junk value → `transparent`; a stored white from before 2026-10-08 stays white), `strokeColor` is a hex or `artwork` (missing or junk → `#000000`, the 2026-10-08 default; a stored `artwork` stays `artwork`), `strokePx` is 0–32 px (the pre-2026-10-08 key `strokePt` is read as the same number and never written back; the fingerprint is positional, so nothing flips to stale); the undo path writes through the same store |
| localStorage `iconSplitter.upload.gemini.v1` | the Gemini provider config (endpoint, model, timeout, retries, concurrency) | clamped on read (RULE 13) |
| localStorage `iconSplitter.upload.bridge.v1` | the Inkscape helper config `{ v, url }` (2026-10-09) | validated on read (RULE 13): only an `http(s)://` URL is kept, anything else → `http://127.0.0.1:47391`; device config, never per icon |
| localStorage `iconSplitter.upload.prompt.v1` | the metadata prompt `{ v, prompt }` | validated on read: missing/empty/junk/foreign version → the documented default (`parsePromptText`, RULE 13); written on every edit, so a restart opens with the user's own text |
| localStorage `iconSplitter.upload.prompts.v1` | the saved prompt presets `{ v, presets: [{ name, text }] }` | validated entry by entry (names trimmed 1–60, text ≤ 8000), duplicates keep the last, capped at 50; corrupt → no presets |
| localStorage `iconSplitter.upload.prefs.v1` | upload view prefs `{ thumbHeight, providerOpen, previewBg }` | clamped/validated on read; display-only — the zoom never feeds the output scale |
| localStorage `iconSplitter.upload.journal.v1` | the in-flight metadata-request journal (row id, start time, request id — no key, no prompt, no answer) | validated on read; corrupt = empty; an open entry after a restart is `interrupted`, never resent |
| localStorage `iconSplitter.upload.meta.v1` | the **accepted-metadata cache** (CP-15), keyed by the sha256 of the SOURCE SVG: `{ v, cache: { [sha256]: { state: generated \| accepted, meta } } }` | validated entry-by-entry on read (junk dropped, foreign version = empty); bounded at 512 entries, oldest evicted first; an entry whose text no longer passes `upload-meta-v1` comes back `invalid`, never exportable: edited artwork misses the cache by construction |
| localStorage `iconSplitter.upload.jobs.v1` | the **per-icon job store** (CP-2): `{ v, states: { [pairId]: queued \| running \| processed \| partial \| failed \| cancelled \| interrupted } }` | validated on read (unknown states dropped), bounded at 1024; a `queued`/`running` entry left by a previous session becomes `interrupted` **once per page load**; the store never re-sends, retries or re-bills anything |
| IndexedDB `iconSplitter/secrets["gemini-api-key"]` | the Gemini API key | its own slot beside the Requesty key; never in localStorage, logs or exports (RULE 20); a refused write falls back to a session-only key the UI names as such |
| `<pair-folder>/export/<base>.svg|.jpg|.eps` | the export package (prepared SVG copy, 15.1 MP JPEG, optional genuine EPS). `<base>` keeps the icon's own name and drops ONLY the app's `_AI` marker (`lib/upload/export.ts` `stemOf`, the ONE rule the commit and the published-JPEG path share) — `fog_AI.svg` → `fog.svg`, `fog_AI_03.svg` → `fog_03.svg`, `icon-bunny-face_AI_7_04.svg` → `icon-bunny-face_7_04.svg`, `fog_AI_v2.svg` → `fog_v2.svg`; every numeric tail STAYS (the digits are what tell one icon from another — `fog_AI.svg` and `fog_AI_7.svg` are different pairs and stay `fog.*` and `fog_7.*`), and a name without a trailing `_AI` marker (or with a non-numeric tail, `fog_AI_x.svg`) comes back unchanged, never invented | written only by the validated export commit; the approved source and its sidecar are never touched. The approved version also stays in `export.json` (`source.version`) as before |
| `<pair-folder>/export/export.json` | the per-icon export record (schema v1: source/settings fingerprints, svgo + eps tool records, metadata block, outputs with hashes, stage, status, validation, timestamps) | one per icon, no global multi-icon file; written LAST as the commit marker; corrupt/missing → rebuilt, never destroys outputs |

Object URLs from user files are revoked on sheet removal (sheets mode).
