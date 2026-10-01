# Design — multi-request confirmation, effort-aware limits, preview fidelity

Date: 2026-10-01 · Status: implemented · Mode: Generate SVG (tab 5)

Prompt under work (two reports, one surface):

* **MULTI-BATCH CONFIRMATION** — images/request = 4, selecting more than 4
  shows ONE batch preview; expected: split into batches, show the total request
  count and every batch before confirming, paginate the previews, each page
  with its own composite + exact ordered filenames, a partial last batch keeps
  empty cells; each batch is a separate request with per-batch status, tokens,
  cost, success and failure; every returned SVG maps back to its source; one
  failed batch must not corrupt successful ones. Verify 1, 3, 4, 5, 8, 9 and
  larger selections.
* **SVG GENERATION & PREVIEW** — (1) one zoom slider must resize the AI and SVG
  thumbnails equally, keep aspect, grow the row, never crop/overlap/clip;
  (2) batch size must respect the selected reasoning level — medium max 2,
  high max 1, split automatically, validated before send with the request count
  shown, and timeouts configured per tier instead of an unexplained error;
  (3) the preview must not modify stroke, fill, opacity or any internal colour,
  the background control changes only the area behind the SVG, and no
  `currentColor` forcing, CSS stroke override, filter or inversion may be used.

## 1. Root causes (evidence, before the change)

| # | Defect | Where | Why |
|---|---|---|---|
| R1 | only the first batch is previewed | `src/svg/SvgDialogs.tsx` `CompositePreview` | it slices `picked.slice(0, imagesPerRequest)` and labels it "request 1 of N"; no page state exists, so batches 2..N are never built or shown |
| R2 | batch size ignores the reasoning level | `src/svg/actions.ts` `requestGenerate`, `src/svg/runner.ts` `runGeneration` | both read `config.imagesPerRequest` directly; `SamplingParams.effort` never constrains the request size, so a `high` run may send 4 icons at once |
| R3 | unexplained timeout | `src/lib/svgrequest.ts` `sendChatRequest` + `src/lib/svgconfig.ts` | one global 90 s default; a reasoning model that thinks for minutes aborts and reports the bare "request timed out" with no tier, no guidance, no raised budget |
| R4 | one slider, two different sizes | `src/svg/SvgThumbs.tsx`, `src/svg/SvgPreview.tsx`, `src/index.css` | the slider only dispatches `thumb`; nothing writes `--svg-thumb`, so the row's `min-height` never follows; the AI `<img>` keeps `height` + `max-width:116px` while the SVG host grows a square up to 240 px inside a fixed 220 px grid column — overlap, clipping, unequal resize |
| R5 | preview recolours / re-renders the artwork | `src/lib/svgpreview.ts` `PREVIEW_CSS`, `src/index.css` `.contrast` | the shadow stylesheet sets `svg{color:#000000}`, a rule that beats an author's root `color="…"` presentation attribute (so a document that is red standalone previews black), and the contrast hint is a `drop-shadow` **filter** on the artwork |

## 2. Decisions

**D1 — one plan, two consumers.** The confirmation and the runner must split the
selection with the same rule. `lib/svgbatch.planBatches` stays the only splitter;
a new `lib/effortlimits.effectivePerRequest(configured, caps, params)` is the
only place that decides how many icons one request may carry. Both call sites
(the dialog and `runGeneration`) call the pair, so the count the user confirms
IS the number of requests sent.

**D2 — effort limits.** The selected reasoning level caps the batch:

| effort | icons per request | request timeout floor |
|---|---:|---:|
| low | configured (1..9) | 120 s |
| medium | **2** | 300 s |
| high | **1** | 600 s |
| xhigh | **1** | 600 s |
| not sent / non-reasoning | configured (1..9) | configured |

Sources: OpenAI/Requesty latency guidance (reasoning models need 180 s+ for hard
problems, 300 s for medium and 900 s for high effort; high effort is 3–10 min
per request), Requesty `docs.requesty.ai/features/reasoning` for the effort
vocabulary. The configured timeout is a *floor-raised* value:
`effectiveTimeoutMs = max(configured, floor)` — the app increases the wait and
says the effective value in the provider line and the confirmation; a timeout
failure names the tier and the fix instead of returning an unexplained error.

**D3 — validate before send, fail closed.** `lib/svgbatch.validateBatchPlan`
checks the plan (never more than the cap, positions contiguous from 1, the
last batch's grid covers its items). `requestGenerate` refuses to open the
confirmation when the plan is invalid; `runGeneration` refuses to send and
reports why (RULE 15 spirit: nothing is sent on a plan that cannot be mapped).

**D4 — paginated confirmation.** `src/svg/SvgConfirm.tsx` owns the confirm
dialog: one page per batch, in plan order, with Previous/Next, "request k of N",
that page's grid shape, its ordered `position — name` manifest, its empty-cell
count and its own composite (built lazily when the page is shown, cached for the
dialog's lifetime, honest error when unreadable). The last partial batch keeps
its empty cells — shown, never filled.

**D5 — per-batch outcome tracking.** `lib/svgbatch.batchOutcome` builds one
`BatchOutcome` per request: id, index, count, status (done/failed), saved,
failed, missing, tokens, the one cost decision (`costInfoFor`, so reported vs
Estimated stays honest) and the redacted error. The runner accumulates them in
`RunSummary.outcomes` and streams them through `batch-done` events; the batch
strip lists every finished request with its own numbers, and the summary line
names failed requests when there are any. The run's failure isolation is locked
by a test: a 500 on request 2 leaves request 1's files and rows intact.

**D6 — one slider, one box size.** The slider value is written to `--svg-thumb`
on the panel root (one writer, RULE 24). Both preview boxes are `thumb × thumb`
— the same size, so both resize equally; the AI image uses `object-fit:contain`
and the SVG uses `preserveAspectRatio="xMidYMid meet"`, so art keeps its aspect
and is never cropped; the row's `min-height` and the previews column
(`calc(var(--svg-thumb) * 2 + gap)`) derive from the same variable, so the row
grows with the slider and a thumbnail can never overlap the next column.

**D7 — the preview never paints the artwork.** No CSS `color` is injected into
the shadow root (the app must not choose an ink). `currentColor` keeps the
value a standalone document resolves — the UA default — by setting the root's
`color` **presentation attribute** to `#000000` and *only* when the document
declares no colour of its own (no `color` attribute, no `color:` declaration in
its style). A presentation attribute has the lowest priority, so the author's
own `color`, any descendant colour, fill, stroke and opacity win untouched.

**D8 — fit is geometry only.** The fit may set `viewBox`, `width="100%"`,
`height="100%"`, `preserveAspectRatio` and strip only `width`/`height`
declarations from the root style (an inline `width:512px` would otherwise beat
the fit). It never touches colour, opacity, dash, filters or any other
declaration. The contrast hint for a dark background becomes an `outline` on
the frame that sits behind the artwork — not a filter on the artwork.

**D9 — docs move in the same change.** SYSTEM_OF_RECORD §2/§8/§9/§11,
UI_SELECTORS §P, this archive entry and the QUALITY_RECHECK record.

## 3. Module plan

| File | Change | Responsibility after |
|---|---|---|
| `src/lib/effortlimits.ts` | new (~90 lines) | effort → icon cap + timeout floor, the effective values and their honest notes |
| `src/lib/svgbatch.ts` | extend | + `validateBatchPlan`, `batchOutcome`, `requestCount` (planner untouched) |
| `src/lib/svgpreview.ts` | edit | standalone-ink rule replaces `PREVIEW_INK`; fit stays geometry-only |
| `src/lib/svgconfig.ts` | edit | timeout ceiling raised to 15 min (floors can exceed the old 10 min) |
| `src/svg/runner.ts` | edit | effective cap + effective timeout, per-batch outcomes, timeout guidance |
| `src/svg/runstate.ts` | edit | `batch-done` → progress with the outcome list; summary line |
| `src/svg/types.ts` | edit | `RunProgress.index/perRequest/outcomes`, dialog loses precomputed counts |
| `src/svg/actions.ts` | edit | plan + validate before opening the confirmation |
| `src/svg/SvgConfirm.tsx` | new (~180 lines) | the paginated confirmation |
| `src/svg/SvgDialogs.tsx` | edit | delegates the confirm kind; keeps code/history |
| `src/svg/SvgThumbs.tsx`, `SvgPreview.tsx` | edit | one box size from the slider |
| `src/svg/SvgBatchStrip.tsx` | edit | current request + the per-request outcome list |
| `src/svg/SvgBulkBar.tsx`, `SvgPanel.tsx` | edit | request count before send; `--svg-thumb` writer |
| `src/index.css` | edit | thumbs column derives from `--svg-thumb`; contrast outline replaces the filter |

## 4. TDD order (each test fails before the change)

1. `tests/svg_batch.test.ts` (new) — plan sizes for 1, 3, 4, 5, 8, 9, 11 and 23
   sources at 4/request; contiguous positions; last partial batch's empty cells;
   `validateBatchPlan` rejects an oversized or mis-numbered plan;
   `requestCount`; `batchOutcome` status/cost shape.
2. `tests/svg_effort.test.ts` (new) — medium 2, high 1, xhigh 1, low configured,
   no effort configured, configured 1 stays 1; timeout floors and
   `effectiveTimeoutMs`; the notes name the tier.
3. `tests/svg_runner.test.ts` (new) — the real `runGeneration` over a fake
   transport and a fake FS: 8 sources at 4 → exactly 2 requests with the right
   composites; 2 valid answers map to the right sources; outcomes carry tokens
   and cost; a failed second request leaves the first batch's SVG + sidecar in
   place; medium effort with 4 configured → 4 requests for 8 sources; a timeout
   error names the tier and the effective timeout.
4. `tests/svg_confirm.test.tsx` (new) — the paginated confirmation: request
   count, page 1/2 navigation, per-page ordered filenames, per-page composite,
   last-page empty cells, nothing is sent by opening it.
5. `tests/svg_preview.test.ts` (edit) — no injected colour, author colour wins,
   standalone ink only when the document declares none, explicit stroke/fill/
   opacity byte-for-byte, no filter anywhere in the pipeline constants.
6. `tests/svg_ui.test.tsx` (edit) — the zoom slider resizes BOTH boxes to the
   same inline size, writes `--svg-thumb`, and the frame uses the outline hint
   instead of a filter; the confirm dialog shows the request count.

## 5. Rule budget (RULE 16/18/19)

* every new function ≤ 20 lines (hard fail 30), params ≤ 3 (hard fail 4), CC ≤ 10,
  nesting ≤ 4; new files ≤ 200 lines (hard fail 300).
* extraction follows RULE 19 order: flatten → simplify → name → split last.
* no `partN` helpers, no options-bag dodges; `BatchOutcome`/`BatchPlan` are
  domain types, not parameter hiding.
* `src/lib` coverage stays ≥ 80% (new lib modules are covered by tests 1–2).

## 6. Rejected alternatives

* Build every composite when the dialog opens — decodes the whole selection
  before the user confirms, and a large selection may not fit memory; lazily
  building the visible page is the same guarantee for less work.
* Cap the request size by truncating the selection — silently drops sources;
  the requirement is to split, so nothing is dropped, only re-grouped.
* Render the preview through an `<img>` data URL — perfectly faithful colour,
  but loses the sanitize/id-scope/security guarantees the archive
  `2026-10-01-svg-preview-rendering` established for inline markup.
* Force `color:#000` in the shadow stylesheet (the previous fix) — overrides an
  author's root presentation attribute; a presentation attribute on the root
  only fixes the inherited default and lets every author value win.
* Keep the `drop-shadow` contrast hint — it is a filter on the artwork; the
  requirement bans filters, so the hint moved to the frame's outline.
