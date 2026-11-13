# AI source regeneration sends the reference image — correction + change

2026-10-19 · status: shipped (TDD: `tests/svgimgedit.test.ts`,
`tests/svg_imgrunner.test.ts`, `tests/svg_imgreg_ui.test.tsx`).

## What was wrong

`archive/2026-10-16-image-regen/README.md` (§2 "Honest capability note") and a
comment in `lib/svgconnections.ts` said Requesty has **no image-edit endpoint**,
so regeneration was text→image: only the prompt was sent and the dialog said
"Text-to-image only". That was wrong. Requesty documents
`POST {base}/images/edits` (OpenAI-compatible, read 2026-10-19 at
docs.requesty.ai/api-reference/endpoint/images-edits-create). The owner's
request was always: the prompt AND the last selected image as the reference.

## The wire

`multipart/form-data` (the browser writes the boundary — no `Content-Type`
header from us): `model`, `prompt`, `image[]` (one file part per reference),
`size`, `quality`, `background`, `output_format`. Not sent: `n` (one image per
source anyway) and `response_format` (not documented for the edit endpoint).
`quality` is mapped to the documented set — `xhigh`/`max` ask for `high`. The
response is the same `data[]` (`b64_json` | `url`) the generation endpoint
returns, so `parseImageResponse` is unchanged.

## What is the reference

The source's CURRENT MAIN AI image — `preferredImagePath(...)`, the file the
row's thumbnail shows: the chosen regeneration if one is main, else the original
`<stem>_AI.png`. So a second run edits the first run's result when it is main,
and clicking the `original` chip makes the original the reference again. The
path is fixed when the run is confirmed; the bytes are read when each request
starts (lazy — a 1000-pair batch never holds every image in memory).

## Failure policy

A reference that cannot be read fails THAT item with "the current AI image
could not be read, so nothing was sent" and records a `failed` version in the
pair file — it is never silently sent as a text-only request (RULE 4, RULE 5).
Other items still run.

## Where it lives

`lib/svgimgedit.ts` (pure: URL, mime, quality map, form builder) ·
`svg/imgrunner.ts` (`attempt` = one edit request, `ImageRegenItem.reference`) ·
`svg/imgregfiles.ts` (`readReferenceImage`) · `svg/imgactions.ts`
(`referenceItem`) · `SvgImgConfirm.tsx` (dialog copy, handle `svg-img-caps`).
