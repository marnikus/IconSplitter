# Generate SVG tab — design (2026-10-01)

Status: core, state layer, runner and the panel UI are landed (2026-10-01).
UI reference:
`design temp/SVG tab generation/SVG generation Tab.html` and
`Generate SVG workspace.png`.

## 1. Requesty contract (researched 2026-10-01)

| fact | value | source |
|---|---|---|
| base URL | `https://router.requesty.ai/v1` (configurable) | docs.requesty.ai quickstart |
| endpoint | `POST /chat/completions`, OpenAI-compatible | docs.requesty.ai API reference |
| auth | `Authorization: Bearer <key>` | same |
| model id | `openai/gpt-6.1-sol` — Requesty requires the provider prefix; the bare OpenAI id is `gpt-6.1-sol` (vision-capable, released 2026-09-29) | docs + OpenAI model index |
| images | OpenAI multimodal content parts: `{type:"image_url", image_url:{url:"data:image/png;base64,…"}}` | OpenAI chat-completions format, normalised by Requesty |
| usage | `usage.{prompt_tokens, completion_tokens, total_tokens, cost}` — `cost` is provider-reported actual | API reference response sample |
| errors | OpenAI-shaped `{error:{type, code, message}}`; 401/403 auth, 429 rate limit, 404 model, 413 payload, 5xx/timeout unknown | OpenAI error-code guide |

Deviations / decisions:

- **D1 — RULE 20 is user-overridden for this tab only.** Images leave the
  browser solely when the user confirms a generation; the provider and model
  are shown before send. Detection/rendering (the rest of the app) stays local.
- **D2 — never blind-retry an uncertain state.** `timeout`, network drop and
  5xx classify as `unknown`/`retryable:false` at the request level; the row is
  marked `interrupted`/`failed` and a retry is an explicit user action that
  starts a *new* request and a new version.
- **D3 — API key storage.** A browser app has no OS credential manager; the key
  lives in `localStorage` under `iconSplitter.svggen.key.v1` (the existing
  safe-storage path), is masked in every UI surface, and is redacted from
  error text, logs, exports, presets and reports. Documented limitation:
  localStorage is not encrypted — this is a local tool, same trust level as
  the session store.
- **D4 — sidecar is per file, not per folder.** The image mock labels rows
  "per-file sidecars"; the sidecar is `<base>.svg.json` beside the AI image.
  Missing sidecar ⇒ not generated. Corrupt sidecar ⇒ warn, never delete SVGs.
- **D5 — versions never overwrite.** Version *n* is `<base>.v{n}.svg`; a retry
  or regeneration always writes *n+1*. The newest **valid** version is the one
  previewed; invalid output is recorded in the sidecar with `status:"failed"`
  and no file, or with a file that is never shown as valid.
- **D6 — 4-icon check is a warning.** `validateSvg` counts top-level drawable
  clusters; ≠ 4 produces a warning (the default prompt asks for 4 split icons)
  but does not by itself make the SVG invalid. Unsafe or structurally broken
  SVG is invalid and never previewed/saved as valid.

## 2. Batch model

`makeBatches` sorts sources by `relPath + name` (deterministic), chunks them by
`perRequest` (1…9, default 4) and gives each item a batch-local `position`
starting at 1; the stable `sourceId` and fingerprint ride along, so nothing
after the request relies on list index. `gridFor` returns the smallest square
grid: `cols = ceil(sqrt(n))`, `rows = ceil(n/cols)`, unused cells empty
(3 → 2×2 + 1 empty; 4 → 2×2; 9 → 3×3).

The request prompt = fixed contract header + ordered manifest
(`1 — <name>` per line) + the user's editable prompt. The response contract:
numbered code blocks and/or `<title>` equal to the source name. Matching order:
explicit number, then exact title; duplicates, unknown titles and out-of-range
numbers are issues, never guesses; a missing position never shifts the rest.

## 3. Module map (pure `src/lib/`)

| module | owns |
|---|---|
| `svggrid.ts` | `gridFor` |
| `svgextract.ts` | balanced `<svg>` extraction, titles, numbered blocks, `matchSvgs` |
| `svgvalidate.ts` | sanitize (script/on*/foreignObject/javascript:), structural + visible-geometry validation, cluster count |
| `svgmanifest.ts` | batching, manifest text, prompt composition, svg file names |
| `svgsidecar.ts` | sidecar schema, tolerant parse, versions, latest-valid, review |
| `secrets.ts` | `maskKey`, `redact` |
| `requesty.ts` | config defaults, request body, response parse, error classification |

State/IO (`src/svggen/`, next step): `configstore`, `promptstore`, `keystore`,
`sidecarstore` (atomic like `reviewstore`), `composite.ts` (square contact
sheet via an injected canvas factory), `runner.ts` (concurrency, cancel,
partial results), `useSvgGen.ts`, then the panel UI.

## 4. As built (2026-10-01)

- **A1** — the tab is registered as `svggen` ("Generate SVG") in the Workbench;
  it reuses `useSelection` for the root folder, the recursive scan and the
  decisions file, then filters to `approved + AI side` (`svggen/rows.ts`).
- **A2** — one request per batch through `svggen/runner.ts` (injected fetch, so
  tests run the real logic); retries only 429; timeout/network/5xx are reported
  as uncertain and never resubmitted automatically.
- **A3** — versions are `<base>.v{n}.svg`; the newest *valid* version is the one
  previewed, copied and shown; invalid attempts are recorded with
  `status:"failed"` and write no file. Review changes upsert the version record.
- **A4** — the confirm dialog precedes every send and shows count, model and the
  exact prompt; the key is set in the tab, stored locally, masked everywhere.
- **A5** — known gaps, deliberately recorded: the provider card shows the
  configured timeout/retries/concurrency but they are edited only via the config
  store (no per-control UI yet); composite PNGs are transient (not persisted for
  diagnostics yet); the History modal lists versions read-only.
