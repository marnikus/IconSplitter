# Reasoning effort vs. request budget — design (2026-10-02)

Reported after the preview-colour round:

* *"if user change reasoning from low to medium that able do only 2 icons.
  3 or 4 return the error."*
* *"if high - than only one per run. Timeout issue ? fix it."*

Two defects, two root causes, one new module. Everything below is measured
against the code as it stands (`9c27981`), not against a guess about the
provider.

## Root cause 1 — the output ceiling is shared with the reasoning

`buildChatRequest` sends one flat `max_completion_tokens` (32 000 by default,
`src/lib/modelcaps.ts` `DEFAULT_MAX_TOKENS`). On a reasoning model that ceiling
is **combined**: the hidden reasoning tokens are billed inside it, and only what
is left can become the answer.

So the same 32 000 that fits four SVG documents at `low` effort is mostly spent
on reasoning at `medium`, and almost entirely at `high`. The provider stops
mid-answer with `finish_reason: "length"`, the response contains one or two
complete `<svg>` blocks, and the runner reports the rest as
`no SVG returned for position 3` / `position 4` — a *malformed* failure that
blames the model for a budget the app chose.

`readContent` never looks at `finish_reason`, so the app cannot tell a cut-off
answer from a model that simply did not answer. That is the second half of the
defect: the error message is wrong even when the request is not.

## Root cause 2 — the timeout ignores the batch and the effort

`config.timeoutMs` (90 s) is one flat per-request budget. It does not know how
many images the composite carries, and it does not know that a `high` answer
takes several times longer than a `low` one. A four-image `medium` composite
needs roughly twice the low-effort time; a `high` one roughly four times. The
request is aborted client-side and classified `timeout`, which is the failure
the user sees for the larger batches.

## The fix — derive the budget, and say what was derived

`src/lib/svgbudget.ts` (new, pure) owns the three numbers a request needs, all
derived from the reasoning effort and the user's own settings:

| budget | rule | why |
|---|---|---|
| `maxTokensFor` | `user ceiling × effort weight`, clamped to the model's maximum | the reasoning the user asked for is paid for out of the same ceiling, so the artwork needs the room back |
| `timeoutMsFor` | `user timeout × weight ÷ 2 × images in the batch`, clamped to `[user timeout, TIMEOUT_CEILING_MS]` | wall clock grows with both the artwork and the thinking |
| `imagesPerRequestFor` | the largest batch whose derived timeout still fits `TIMEOUT_CEILING_MS`, then the user's setting, then the documented 1..9 grid | a batch that cannot finish inside the provider's own gateway limit must never be sent |

Weights — `low 1 · medium 2 · high 4 · xhigh 8` — are calibrated on the user's
own report (4 images at `low` fit the 90 s budget; 2 at `medium`; 1 at `high`),
with the ÷2 giving every tier twice the measured head-room:

| effort | per-image budget | images one request may carry (90 s base, 600 s ceiling) |
|---|---:|---:|
| low | 45 s | 9 (the documented grid maximum) |
| medium | 90 s | 4 — the user's own setting, unchanged |
| high | 180 s | 3 |
| xhigh | 360 s | 1 |

So a `medium` run of 4 icons now sends 4 images in one request with a 360 s
budget and a 64 000-token ceiling, instead of 4 images in 90 s with 32 000.

## Truncation is its own failure

`src/lib/svgrequest.ts` gains `readFinishReason`, and `finish_reason: "length"`
becomes a new `Failure` kind, `truncated`, with the message
*"the answer was cut off at the token ceiling — raise the output tokens or
lower the reasoning effort"*. It is not retryable (the provider already spent
the tokens). A cut-off batch now fails as one batch with that reason instead of
four `malformed` per-item errors, and the sidecar records the same sentence.

## Where the numbers are wired

* `src/svg/runner.ts` — plans batches with the derived images-per-request, and
  sends each batch with the derived timeout and token ceiling. The runner stays
  the only writer and the only caller of the transport.
* `src/svg/actions.ts` — the confirm dialog counts requests with the same
  derived number, so *"Requests: 1 × 4 max"* is the number that will be sent.
* `src/svg/SvgControls.tsx` — the surviving limits line states the derived
  values for the effort that is currently selected, so nothing about the budget
  is silent.

## Rejected alternatives

* **Only raise the fixed timeout.** The truncation stays: a longer wait does not
  buy tokens. Both causes have to be fixed.
* **Always one image per request at `high`.** Correct but slow, and it makes the
  batch machinery dead code for the tier most people will pick.
* **Silently shrink the batch when the effort rises.** The request count would
  disagree with the dialog the user confirmed. The derived size is shown instead.
* **Retry a truncated answer.** The tokens were spent; a resend doubles the cost
  for the same cut-off point.

## Tests

* `tests/svg_budget.test.ts` — the weights, all three derivations, the clamps
  (never below the user's own timeout, never above the gateway ceiling), and the
  `high`-effort batch size.
* `tests/svg_send.test.ts` — a `finish_reason: "length"` response fails as
  `truncated` with the actionable message and is not retried; a `stop` finish
  reason still succeeds.
* `tests/svg_cost_io.test.ts` — the real runner, driven against a fake
  transport, sends the derived ceiling and the derived timeout, and a truncated
  batch fails every item with the truncation reason.
