# Storage map — current keys and files

Jump to a domain; validate everything read from storage (RULE 13). Image-edit keys carry metadata only, never image bytes or prompts.

**Detail pages:** [Generate SVG and image edits](storage/svg.md) · [SVG to upload](storage/upload.md) · [SVG builder](storage/svg-builder.md).

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
| IndexedDB `iconSplitter/handles["__selection__"]` | Selection V2 review root handle (compatible key retained) | permission re-requested on restore |
| localStorage `iconSplitter.selectionV2.prefs.v1` | V2 view prefs `{ mode, thumbHeight }` | validated + clamped on read (RULE 13) |

## Shared paths and log

| Where | What | Rules |
|---|---|---|
| IndexedDB `iconSplitter/rootpaths` | the picked folders' real full paths, records `[{ handle, path, how }]` — one per folder HANDLE (I-63) | normalised + validated on write and read (I-29/I-39); identity is `isSameEntry`, never the name; capped at 20; never leaves the browser. The old name-keyed `localStorage iconSplitter.rootpaths.v1` is **never read** (a guess may not survive as data, I-59) |
| localStorage `iconSplitter.log.v1` | the global activity log: `{ v, max, minimized, entries }` | validated + re-sanitised on read; foreign version or corrupt JSON → the default state (I-25); cap 50–1000 governs display and storage; no key, header, data URL or payload may enter it (I-24) |
| localStorage `iconSplitter.session.v1` | the restart snapshot: last tab, the review view, the sheet options and each list tab's **checked ids** + active id + anchor (`svg`, `upload`, `builder`, `stockUpload`, `batch`, `v2`) | validated field by field on read (`lib/session`, RULE 13); a selection change is written in the same task, everything else after 250 ms; the write is read back and retried once (`state/sessionstore.ts`); a page never overwrites a snapshot another page stamped after its own last selection change (`lib/sessionorder`) |

Original Selection tab removal: stored `tab: "selection"` is read as
`selectionV2`; the existing `selection` session view slice remains V2's filter,
sort, active row and comparison state. Obsolete `collapsed` state is dropped.
No session schema/key, shared root handle or pair-sidecar deletion is performed.

## Stock Upload

| Where | What | Rules |
|---|---|---|
| localStorage `iconSplitter.stockUpload.batches.v1` | bounded (200 records), validated per-target upload-run history: stock/run IDs and name snapshot, timestamp, success/failure counts, cancellation flag, optional upload note (max 1000 characters), relative file paths, and captured full paths when known | append-only run records; old rows without notes remain valid; successful file entries only; no credentials or image bytes; a full path is built only from the exact path captured for that root handle, otherwise only the relative path is retained |

## SVG builder

| Where | What | Rules |
|---|---|---|
| `iconSplitter.svgBuilder.config.v1` | validated sheet config | one owner: `src/svgBuilder/configstore.ts` |
| `iconSplitter.svgBuilder.prefs.v1` | zoom, card open state, thumb size | display-only, validated |
| `iconSplitter.svgBuilder.prompt.v1` / `.prompts.v1` | sheet prompt and presets | no key or image bytes |
| `iconSplitter.svgBuilder.listView.v1` | library query/category/sort | display-only, validated |
| IndexedDB `iconSplitter/handles["__svgBuilder__"]` | builder root | falls back to older roots; permission re-requested |
| shared Gemini config + key vault | endpoint/model/limits and API key | no second builder key store; masked, redacted, local |

See [the builder storage page](storage/svg-builder.md) for the full contract.
