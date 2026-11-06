# AI source regeneration — tokens and cost on the row

2026-10-19 · status: implemented the same day (TDD: `tests/svg_imgreg_ui.test.tsx` "tokens and cost on the row",
`tests/svgimgreg.test.ts`).

## 1. The request

> "The AI source raster generation does not display the cost and tokens spent
> after generation finished. Fix it to show it the same way it is done for SVG
> generation. In the version/tokens/cost column add a small header 'SVG gen.',
> then under a line a small header 'Image gen.' and then the same way:
> vx · x tokens · y reported."

## 2. Cause (verified)

- The image runner already reads the provider's usage (`imgrunner` →
  `result.usage`). `imglog` writes it to the global log and the run toast.
- `recordImageResult` (`svg/imgcommit.ts`) builds the pair file's
  `ImageVersion` **without** usage or cost: the number is dropped at the commit.
  `ImageVersion` has no fields for it.
- The row's `UsageCell` (`svg/SvgRow.tsx`) reads only the shown SVG version.

## 3. Design

- **Data:** `ImageVersion` gains `usage: TokenUsage` and `cost: CostInfo`, the
  same shapes `SvgVersion` uses. The fields are additive, so `v` stays 2.
  - The reader reuses `svgmodel`'s tolerant parsers, now exported as
    `toUsage` and `toCost`.
  - An old entry reads back as unknown usage, with cost basis `none`.
- **Cost decision:** `costInfoFor(model, usage)`, the single owner. Reported
  stays reported; a rate card gives an estimate.
- **Composite requests:** one request covers N cells, so each saved (or failed
  after sending) cell gets `allocateUsage(usage, N)`.
  - N = 1 keeps the reported number.
  - N > 1 stores an *estimated share* (basis `batch-split`), the same rule the
    SVG batches use.
  - The log still records the request once (`image-regen-request`).
- **Row UI** (`UsageCell`):
  - small header `SVG gen.`, then `vN`, tokens, cost (unchanged content);
  - a divider, small header `Image gen.`, then the AI image shown as main:
    `vN`, `x tokens`, the cost label;
  - shown only when the pair has an image history;
  - when the main image is the original, the line reads `original` with no usage.
- **Test ids:** `svg-usage-svg-{id}`, `svg-usage-img-{id}`, with the existing
  `svg-usage-{id}` around both.

## 4. Steps

1. Failing tests:
   - `svgimgreg.test.ts`: round-trips usage and cost; an old entry reads as unknown.
   - `svg_imgreg_ui.test.tsx` (its fixture runs the real image runner):
     - a single regen stores reported usage and cost, and the row shows it under
       `Image gen.`;
     - a two-pair composite stores half shares as estimates;
     - the `SVG gen.` header is present.
2. `svgmodel` exports the parsers; `svgimgreg` gains the fields and the reader.
3. `imgcommit` stores `usage` + `cost`; `imgbatchrun` passes each cell its share.
4. `SvgRow.UsageCell` gets the two sections; CSS for the headers and the divider.
5. Docs: a selector row, a test index line, the ledger; then gates, commit, push.

## 5. Out of scope

- Usage in the Versions dialog for images (there is no image versions dialog yet).
- Back-filling cost for images generated before this change: the log has it,
  the pair file never did.

## 6. Follow-up: tokens but "no cost reported" (2026-10-19)

> "Image gen. v3 · 1,319 tokens · no cost reported — the cost is equal to one
> full image generated, then divided by the number of icons in that batch. Fix."

- **Cause:** the image endpoint reports tokens but no `cost`, and the rate card
  had only the text model, so `costInfoFor` returned basis `none`.
- **Fix:** `RATE_CARD` gains `openai/gpt-image-2.5-sunburst` at image input $8 and
  image output $30 per 1M (OpenAI's model page; text input is $5, but the usage
  has a single input count, so the estimate can only be too high).
  `PRICING_VERSION` becomes `requesty-2026-10-19`.
- A composite cell already stores `allocateUsage(usage, N)`, so its rate-card
  estimate is the whole image's cost ÷ N, labelled **Estimated**.
- Entries saved before the fix (tokens with basis `none`) are priced on read in
  `svgimgreg.entryOf`. An unknown model or missing counts still read as unknown.
- Tests: `svg_cost` (rate + 3-way share), `svgimgreg` (repricing on read),
  `svg_imgreg_ui` (a composite with no reported cost shows `$0.0225 Estimated`).
