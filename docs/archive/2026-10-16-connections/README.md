# Connection profiles — quick-switch dropdown, a Requesty image connection, full image controls

2026-10-16 · status: designed before implementation (TDD:
`tests/svgconnections.test.ts`, `tests/svg_connections_ui.test.tsx`).

## 1. The request

> "in SVG generate [provider widget] add a main drop list with models for quick
> switch between different set up connections (will be several). There could be
> same providers for models but also different providers. new connection -
> second added - sunburst model from same provider for image generation. find
> more on the doc of this provider! … add all controls for user to change any
> parameter in setup. Quality, custom wxh image and presets, n of images,
> background, output format."

## 2. Provider research (fetched 2026-10-16)

**"Sunburst" is real**: `gpt-image-2.5-sunburst` — GPT-Image-2.5 **Sunburst**,
OpenAI's base image model released 2026-09-08 (developers.openai.com,
openai.com/ai-news/introducing-chatgpt-images-2-5). Parameters per the image
prompting guide: quality `auto | low | medium | high | xhigh | max`; size
`auto` or a custom resolution (common: 1024×1024, 1536×1024, 1024×1536,
2048×2048, 2048×1152, 3840×2160, 2160×3840); background `auto | opaque |
transparent`.

**Requesty's docs** (docs.requesty.ai, llms.txt + api-reference):
- OpenAI-compatible router, base `https://router.requesty.ai/v1`; model ids are
  `provider/model` — so the Sunburst id here is **`openai/gpt-image-2.5-sunburst`**.
- Image generation: `POST {base}/images/generations`, Bearer key, body
  `{ model, prompt, n, size, quality, response_format, background, output_format }`;
  response `{ created, data: [{ url?, b64_json? }] }`.
- **No image-edit endpoint** in the docs index — only generation. The widget
  therefore ships generation only (honest scope).

## 3. Design

**Model** (`lib/svgconnections.ts`, pure, one owner):
`Connection { id, name, kind: "text" | "image", baseUrl, model, image: ImageSettings }`;
`ImageSettings { sizePreset, customW, customH, quality, n, background, outputFormat, responseFormat }`.
Defaults ship the user's two setups: the existing text connection (GPT 6.1 Sol)
and **Sunburst Image** (kind image, Sunburst model, documented defaults).

**Storage** (`iconSplitter.svg.connections.v1`, safestorage, RULE 13):
`{ v: 1, activeId, list }`; junk parses to defaults; `activeId` must exist.
Migration: with no stored list, the text connection seeds from the user's
CURRENT config (model/baseUrl) so an existing setup is never clobbered.

**State** (`statemodel.ts`): `SvgModel` += `connections`, `activeConn`. One new
action `{ type: "connections", list, activeId }` is the SINGLE WRITER that also
syncs `config.baseUrl/model` — no drift between dropdown and runner. The
existing `config` handler mirrors manual model/base edits back into the active
connection. Caps/params need no new logic: `useModelSync` already re-resolves
whenever `config.model` changes (per-model sampling map reused as-is).

**UI** (`SvgConnections.tsx` inside the provider card): the main dropdown
(`svg-connection-select`) + name field + kind select + `+`/`✕`. When the active
kind is `image`, the text-only rows (temperature / max tokens / reasoning) hide
and the image grid shows: Quality, Size (presets + Custom → W×H inputs), N
images, Background, Output format, Response format. `Select`/`NumberField`
move to `ui/fields.tsx` (one owner, no import cycle).

**Scope decision**: this change delivers connection management + the exact
image request builder (`imageUrl`, `buildImageBody`, lib-tested). Hooking the
SVG runner to `images/generations` (raster output has no row/file flow yet) is
a deliberate follow-up.

## 4. TDD gates

1. Lib: defaults (both connections, Sunburst id, documented image defaults),
   migration seeding from live config, RULE 13 repair matrix, clamps
   (n 1..10, custom dims 256..4096), `resolveSize`, exact `buildImageBody`
   wire shape (snake_case), `imageUrl`.
2. UI: dropdown lists both; switching swaps MODEL + shows the image grid and
   hides text rows; every image control updates state; custom size reveals
   W/H; add/remove; persistence across remount.
