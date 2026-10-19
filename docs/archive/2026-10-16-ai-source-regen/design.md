# AI source regeneration — design (2026-10-16)

## Goal
On the **Generate SVG** tab, when the active connection is `kind: "image"`
(e.g. `openai/gpt-image-2.5-sunburst` → `/v1/images/generations`), pressing
Generate/Regenerate must send the chosen prompt through that image-generation
connection and save the returned PNG/JPEG/WebP as a new **versioned AI source
image** beside the pair. Versions live in a subfolder named
`AI source regeneration versions/` and the user can pick any past version as
the "current" AI source (which is what the row shows and what future SVG
generation sees).

Mirror the SVG pipeline exactly (confirm popup → run → queue → streaming-
style stall handling → versioned save → versions dialog), but adapted for the
non-streamed OpenAI Images API.

## Non-goals
- Image-to-image / edits: Requesty's docs index has no image-edit endpoint
  (`lib/svgconnections.ts` note 2026-10-16). Regeneration is text-only prompt
  for now.
- Separate top-level tab: stays inside the existing Generate SVG tab, routed
  by `activeConn.kind`.
- Moving/deleting the original AI file: v1 always stays at its original
  location. Choosing a version logically replaces it via `aiPreferred`.

## Files added / touched

### Pure lib (src/lib/) — tested first (TDD, RULE 8)
| File | Responsibility |
|---|---|
| `imgfile.ts` | Version subfolder constant, file naming, next-version, chosen/newest valid helpers, ext-for-format |
| `imgmodel.ts` | `AiVersion` record shape, tolerant parser, `AiStatus`, `ImageValidationInfo`, NO_COST reuse |
| `imgprompt.ts` | DEFAULT_IMG_PROMPT, parsePrompt/serializePrompt, singlePrompt/batchPrompt with the ORDER_LINE manifest, default presets |
| `imgrequest.ts` | buildImageBody is reused from svgconnections; add response parse + failure classification + b64/url decode |
| `imgextract.ts` | Decode a batch response (array of image parts in position order) → Blob[] mapped to manifest positions |

### Pair meta extension (src/lib/pairmeta.ts)
- Bump `PAIR_META_VERSION` to 3.
- Add `aiVersions: AiVersion[]`, `aiPreferred: number | null`; v2 reader
  defaults them to [] / null; add `withAiVersion()`, `setAiPreferred()`.
- Add helper to synthesize a v1 "original" record lazily.

### Run pipeline (src/svg/ — reuse, branch by connection kind)
Rather than duplicate the entire `svg/run*.ts` tree, the run dispatcher reads
`state.args.caps.kind` (or a new `mode: "svg" | "img"` in RunArgs) and at the
two branch points uses:
- `sendBatch` → `sendImageBatch` (one POST to /v1/images/generations, JSON,
  not SSE; same stall watchdog, same retry/backoff, same redaction).
- `saveSvgVersion` → `saveAiVersion` (writes Blob into subfolder, validates
  decodable image, records AiVersion, updates meta via `withAiVersion`).
- The rest of the runner (plan, queue, progress events, journal, recovery)
  is identical; event kinds reuse the same RunEvent union with an extra
  `kind: "item-saved"` discriminated by the saved file's extension/type, OR
  a parallel `img-saved` event — keep one union to avoid splitting reducers.

Decision: add an explicit `mode: "svg" | "img"` field to `RunArgs`, plus a
discriminant on saved outcomes. The runplan guards perRequest at 1 for
img-regeneration; img-generation uses `conn.image.n` clamped 1..10.

### src/img/ (UI only — thin)
Keep UI components in `src/img/` so rule 18's directory cohesion holds
(runner code is shared; confirm + versions dialogs are specific to the
image side because the fact grid and preview art differ):

| File | Lines | Responsibility |
|---|---|---|
| `imgconfirm.tsx` | ~160 | AiConfirm dialog (mirrors SvgConfirm.tsx) |
| `imgversions.tsx` | ~140 | AiVersionsDialog (mirrors VersionsDialog.tsx, raster thumbs) |
| `imgprompt.ts` | ~60 | ImgPrompt zone props, default presets list |
| `saveimg.ts` | ~80 | saveAiVersion (mirror of svg/saveversion.ts for Blob) |
| `imgsend.ts` | ~90 | sendImageBatch — one POST, decode b64/url, return blobs |
| `imgdefaults.ts` | ~20 | DEFAULT_IMG_PRESETS |

### Wires touched
- `src/svg/SvgThumbs.tsx` — left slot reads `chosenAiImage(meta, aiPreferred)`
  instead of always `source.relPath`.
- `src/svg/SvgRow.tsx` — add "AI versions" button + show/hide AI status badge;
  label Generate/Regenerate appropriately when mode is image.
- `src/svg/SvgPanel.tsx` — swap prompt zone + bulk-bar labels + dialogs based
  on active connection kind.
- `src/svg/SvgBulkBar.tsx` — accept a `mode` prop for labels.
- `src/svg/SvgDialogs.tsx` — mount AiConfirm + AiVersionsDialog alongside
  existing ones.
- `src/state/presetstore.ts` and `svg/promptstore.ts` — add load/save for
  img-prompt text and img-presets list under new keys.

## Key invariants (I-*)
- I-70: Original AI file is never moved, renamed or deleted; v1 always points
  at source.relPath.
- I-71: Every generated AI version is written first as a complete Blob into
  `AI source regeneration versions/<stem>_vN.<ext>` before the pair meta is
  updated (atomic save — RULE 23).
- I-72: Nothing is overwritten — nextVersion always = max(onDisk, recorded)+1.
- I-73: Pair file is still `<stem>.svg.json`; AI version history lives under
  new keys in that same file (one file travels with the folder, preserving
  I-41).
- I-74: The row's visible AI source is `preferredAi(meta)` when that version
  is valid and its file exists, otherwise `newestValidAi(meta.aiVersions)`,
  otherwise the original (matches the SVG preferred/newest rules).
- I-75: Confirm dialog shows the EXACT prompt text that will be sent (RULE 8
  — honest preview), per page, per request.
- I-76: A stalled image request (no response within stall window) is reported
  "outcome unknown" with its request id, never retried automatically (same
  policy as SVG RULE 4/23).
- I-77: API keys are redacted from logs and error messages (reuse
  lib/svgsecret.redact).

## Response parsing contract
POST `{base}/images/generations` with Bearer key, JSON body per
`buildImageBody(conn, prompt)`. Response shape:
```json
{ "data": [ { "b64_json": "..." }, { "url": "..." } ], "usage?"?, "error"? }
```
- Order of `data[]` must match the request's `n` / batch position order.
- `b64_json` → base64-decode into a Blob using `output_format` mime.
- `url` → fetch to get Blob (CORS may fail; default is b64_json).
- Non-2xx → classify via `classifyHttp` (reused from svgrequest.ts) — auth,
  rate_limit, model, payload, provider, provider_timeout, network, stalled
  keep the same semantics.

## Defaults
- DEFAULT_IMG_PROMPT: "Create a clean monochrome line-art icon of the same
  subject, pose, composition and proportions as shown. Single consistent
  stroke width, no fill, transparent background, high-contrast black strokes,
  crisp edges suitable for vector tracing."
- Three default presets shipped (Clean line-art 2px / Bold filled glyph /
  Thin outline 1.5px).

## TDD order (RULE 8/16.6)
1. `tests/imgfile.test.ts` → fail → implement `src/lib/imgfile.ts` → pass.
2. `tests/imgmodel.test.ts` → fail → implement `src/lib/imgmodel.ts` → pass.
3. `tests/imgprompt.test.ts` → fail → implement `src/lib/imgprompt.ts` → pass.
4. `tests/pairmeta_ai.test.ts` → fail → extend `src/lib/pairmeta.ts` → pass.
5. `tests/imgextract.test.ts` → fail → implement `src/lib/imgextract.ts` → pass.
6. `tests/imgrequest_parse.test.ts` → extend imgrequest response parse.
7. `tests/saveimgversion.test.ts` with fakefs → implement `src/img/saveimg.ts`.
8. UI tests (img_confirm_ui, img_versions_ui) + wire into existing panel.
9. Run `npm run verify:fast` at the end; no RULE 16/18 breaches.
