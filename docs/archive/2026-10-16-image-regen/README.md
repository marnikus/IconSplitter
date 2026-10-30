# AI source image regeneration — image connection, confirmed prompt, versioned main

2026-10-16 · status: designed before implementation (TDD:
`tests/svgimgreg.test.ts`, `tests/svg_imgreg_ui.test.tsx`).

## 1. The request

> "Use Image generation connection to regenerate image references … regenerate
> image AI source image with prompt. the prompt will be selected and confirmed
> in pop up win same as it works now for SVG generation. drop list of presets
> with same prompts for generation. It also should support batch processing.
> … output image will replace the current AI source image. AI source should
> also support version storing so all Image versions stored in folder
> (subfolder AI source regeneration versions) and user can select different
> version as main whenever he want. reuse code same as it works for SVG
> versions."

## 2. The reuse map (verified against the code)

| Need | Reused | Where |
|---|---|---|
| Wire request | `imageUrl` + `buildImageBody` (snake_case, b64_json) | `lib/svgconnections.ts` (verified against Requesty docs 2026-10-16) |
| Confirm-dialog UX | `SvgConfirm` shell pattern: counts, provider/model, FULL PROMPT box, Cancel/Generate | new `SvgImgConfirm`, same classes |
| Prompt + preset dropdown | the SAME main prompt and preset list as SVG generation (`m.prompt`, `m.presets`, `preset-pick`) — "presets with same prompts" | `promptstore`/`promptpresets` |
| Version storage | `PairMeta` additive fields — the I-54 trick (`preferred`): `imageVersions: ImageVersion[]`, `imagePreferred: number \| null`, `v` stays 2 | `lib/pairmeta.ts` |
| Read/write pair file (atomic, tmp-verified) | `loadMetaAt` / `saveMetaAt` | `selection/pairstore.ts` |
| Version-number rule | one past the highest of (disk names, history) — never overwrite | `svgfile.nextVersion` rule, reimplemented for images |
| Row plumbing | rows already carry `meta: PairMeta` | `rowmodel`/`types` |
| AI thumb | `useImageUrl(rootRef, relPath)` — the main switch is the relPath it loads | `SvgThumbs.tsx` |
| File writes | `ensureDirPath` + `writeFileNew` (user outputs never overwritten, RULE 23) | `lib/fs.ts` |
| Batch shape | bounded worker pool, stop checked per item start | `batch/process.ts` pattern |

**Honest capability note**: Requesty's docs have NO image-edit endpoint —
generation is text→image only. The current AI image cannot be sent as a visual
reference; the prompt alone drives the result. The confirm dialog says so.

## 3. Design

**Layout.** For a pair at `<dir>/<stem>_AI.png`, regenerated images land in
`<dir>/AI source regeneration versions/<stem>_AI_v<N>.png` (N = one past the
highest of disk + history). The original file is never touched.

**Versions.** `ImageVersion { version, file, status: "done"\|"failed", prompt,
model, requestId, error, updatedAt }` lives in the pair file next to the SVG
history. `imagePreferred` names the version shown as MAIN; absent/invalid → the
original AI file (legacy behaviour). The splitter and every consumer keep
reading the original file — the regen pipeline picks the main via the pair file
(all main-switching is additive; nothing is deleted, I-54 discipline).

**Flow.** Row button (`svg-row-image-regen-{id}`) and bulk-bar button
(`svg-bulk-image-regen`) → guard (image connection active, key present, rows
selected) → confirm dialog `image-regen` (provider/model, honest note, editable
prompt + preset dropdown, per-request plan 1 image per source) →
**Generate now** → bounded batch (concurrency, stall-window timeout per
request, stop per item start) → each result: decode b64 → write
`writeFileNew` → `saveMetaAt` (append version, point `imagePreferred` at it) →
row refresh + toast + log. A failed request records a `failed` version entry —
the honest history, like the SVG side.

**Main switch.** Version chips on the row's AI pane (`svg-ai-version-{id}`);
clicking one sets `imagePreferred` (persisted) and the AI thumb loads that
file (`preferredImagePath`), falling back to the original.

## 4. TDD gates

1. Lib (RED first): regen dir/file names; `parseImageVersions` repair matrix;
   `nextImageVersion` (disk + history); `parseImageResponse` (b64/url/junk);
   `b64ToBlob` bytes; `preferredImagePath` fallback; pairmeta round-trip with
   the additive image fields and legacy-file tolerance.
2. UI (RED first): guard refuses without an image connection; the dialog shows
   provider/model, prompt and presets; Generate (runner mocked) writes the
   version file + appends history + selects it as main; chips switch the main
   (persisted via `saveMetaAt`).
