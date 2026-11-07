# Vendored: transformers.js 3.8.1 (browser build)

`transformers.min.js` is `@huggingface/transformers@3.8.1/dist/transformers.min.js`, unmodified except the
trailing source-map comment was removed. Licence: Apache-2.0 (`LICENSE`). SHA-256 of the npm file:
`aa5002b70e789798da263f5f99c62bd3e8fcd0c119258a493c40c180648365fa` (before removing the comment).

Vendored (2026-11-08) because the npm registry in this environment cannot resolve the package's
Node-only transitive dependencies (`sharp`, `bare-events`); the browser build needs none of them.
It is only ever loaded inside the SVG builder's indexing worker. At run time it fetches the ONNX
WASM runtime from `cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/` and the two models
from `huggingface.co` (cached in IndexedDB) — downloads only; no icon data is sent anywhere.
`transformers.min.d.ts` declares only the parts the app uses.
