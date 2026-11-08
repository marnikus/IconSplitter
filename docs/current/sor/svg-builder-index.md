# SVG builder — icon vector index (Icons indexing)

Detail page of the [SVG builder contract](svg-builder.md). User decisions 2026-11-08: local AI (transformers.js), one JSON per icon next to its approved SVG, PNG render kept in memory only, Similar reference = locked icons, one 0–100 % similarity with a user-set look/mean mix.

## What an index is

For every approved icon (its final selected approved SVG version):

| Input | Model (local, in a Web Worker) | Vector | Captures |
|---|---|---|---|
| 224 × 224 render of the approved SVG on white (in memory, never written) | `Xenova/clip-vit-base-patch32` (q8) | 512-d image vector | what it looks like |
| `title. description. tags` from `export/export.json` | `Xenova/all-MiniLM-L6-v2` (q8) | 384-d text vector | what it means |

Both vectors are normalised and written to **`<approved svg>.index.json`** beside the SVG (`src/lib/iconIndex/record.ts`). The name never ends in `.png`, `.svg` or `.svg.json`, so Batch, Selection V2, Generate SVG, Upload and Stock upload ignore it (a PNG beside the pair would be imported as an AI-source version — that is why the render stays in memory). Icons without metadata get an image vector only.

## Freshness and the run

- `indexStateOf`: **missing** (no file / foreign id), **stale** (SVG fingerprint or version changed, model id changed, or the metadata text changed), **ok**.
- **◈ Icons indexing** (folder bar, `builder-index-start`) processes every approved icon in the scanned root and all sub-folders whose state is not ok, one at a time (`src/svgBuilder/indexer/runIndexing.ts`). An unchanged SVG reuses its image vector (metadata edits re-embed text only). One failing icon is counted and skipped (RULE 5); **Cancel** stops between icons. The chip shows `N/M indexed · K to do`; progress shows the model download, then `Indexing d/t`.
- Scans read the index files back (`indexer/indexstore.ts`, batches of 24); a corrupt or foreign file means "not indexed".

## Library markers

- **⚠ yellow** (`builder-unindexed-{id}`, `data-unindexed`): index missing or stale.
- **Dashed amber tile** (`is-nometa`, `data-nometa`): no name/metadata (no title, description or tags) — only its image can be indexed.

## Similar mode (replaces tag profiles)

- **Reference** = the locked icons on the sheet (their centroid), else the first placed icon (`useIconIndex.ts`).
- **Similarity** = (100 − T) % image-vector cosine + T % text-vector cosine, each clamped 0–1; when either side has no text vector, the image cosine alone (`src/lib/iconIndex/similarity.ts`). **Similarity ≥ N %** (0–100) is the cut-off; **Look alike ◀▶ Mean alike** (`builder-text-weight`, 0–100 % step 5, default 50) sets T, shown as a split bar (`builder-weight-image` / `builder-weight-text`). Both re-pick without a toast and update every tile's `NN% similar`; T is part of the recipe (`textWeight`).
- The pool is every icon ≥ N % (seeded draw); a short pool is topped up with the **next most similar** icons and reported. Without an indexed reference, Similar refuses with a toast; the first-scan auto placement falls back to Random. Tile tooltips show `NN% similar`; a dot marks unplaced icons ≥ N %.

## Network, privacy and storage

The worker runs the vendored `src/vendor/transformers/transformers.min.js` (transformers.js 3.8.1, Apache-2.0; see its README). First use downloads the two public models from `huggingface.co` and the ONNX WASM runtime from `cdn.jsdelivr.net` — **downloads only**; no icon, name, metadata or key is sent anywhere. Model files are kept in IndexedDB `iconSplitter-models` (`indexer/modelcache.ts`) so later runs load offline. See [storage](storage/svg-builder.md).

Tests: `tests/icon_index.test.ts` (record, freshness, balanced score), `tests/icon_indexing_run.test.ts` (loop, reuse, failure isolation, cancel, read-back), `tests/svg_builder_workspace.test.tsx` (markers, button, Similar by locked reference with a fake model runtime). The real models cannot run in the test lanes; `setIndexRuntime` injects the fake.
