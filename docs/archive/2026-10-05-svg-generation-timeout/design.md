# SVG generation timeout — investigation and design (2026-10-05)

## Decision in one paragraph

The reported tier/count cutoff is credible, but the current app cannot prove whether a
particular failure was an app deadline, a Requesty/provider timeout, output truncation,
a malformed answer, or a response that never reached its terminal marker. The current
request is **non-streaming**, has no phase timings, loses the provider request ID, and
its summary drops request-failure details. Its tier heuristic also still plans four
images at medium and three at high, despite the reported successful limits of two and
one. Fix observability and completion handling first, use the reported limits as a
conservative per-request cap, and retry only an explicit, terminal rate-limit response.
A live provider cause remains unconfirmed until the new safe diagnostics capture a real
run; this checkout has no authenticated live request to measure.

> The investigation and evidence below describe the **pre-implementation baseline** as
> inspected on 2026-10-05. See “Implementation status” for the code and verification now
> in this branch; no authenticated generation request has been made here.

## Pre-implementation baseline: traced request path

1. `src/svg/actions.ts` (`requestGenerate`) calculates the batch count using
   `requestBudgetFor`; `confirmRun` passes the selected sources into the runner.
2. `src/svg/runner.ts` builds a square contact sheet, then `sendBatch` builds one
   OpenAI-compatible chat request per planned batch. The batch loop is sequential; it
   does not fan out the images as concurrent HTTP requests.
3. `src/lib/svgrequest.ts` posts to `/v1/chat/completions`. `buildChatRequest` does not
   set `stream`, so the current path is non-streaming. `sendChatRequest` starts an
   AbortController timer, awaits `fetch`, then awaits `response.text()` before parsing
   JSON. Thus the timer covers both response headers and body consumption, but the app
   cannot observe time-to-first-token or progress while waiting for the whole JSON body.
4. The whole response is parsed only after `response.text()` finishes. `finish_reason:
   "length"` is distinguished as `truncated`; no content/invalid JSON is `malformed`.
   A successful parsed response's `requestId` is then dropped by `SendOk` in the runner,
   and `saveOne` writes `requestId: null` to the sidecar.
5. `saveMatches` extracts and maps SVG blocks; `saveSvgVersion` validates and writes an
   SVG, then the runner writes the sidecar. None of those phases are timed.
6. `runstate.summaryLine` omits `RunSummary.failed` and every entry in `problems`.
   `onRunEvent` ignores `request-failed`; the row may show a failure, but the finished
   toast can say only `0 saved · 0 invalid · 0 missing`. A timeout therefore has no
   clear batch-level explanation. Transport/timeout failures are not persisted as
   attempt records, so an unknown outcome can disappear after reload.

## What the evidence does and does not prove

### Confirmed in the pre-change checkout

- The current request budget is not consistent with the observation. With default
  settings it permits low=4, medium=4 and high=3 images per request. Four medium images
  get a 360 s client deadline; three high images get 540 s. The 600 s ceiling is applied
  by the app's heuristic, not established by a measured provider response.
- The effort-to-time/token multipliers are estimates, not measured latency or output
  capacity. `max_completion_tokens` is one ceiling for reasoning plus visible answer.
  Medium/high can consume materially different amounts of that shared ceiling.
- `classifyTransport` marks a lost network response retryable, and `classifyHttp` marks
  most 5xx responses retryable. `runGeneration` automatically resends these requests
  up to `retries` times. A lost connection or provider timeout can happen after the
  provider accepted the request, so these retries can duplicate cost. A caller abort or
  client timer also cannot prove that the remote provider stopped.
- Rate/concurrency limits are not the leading explanation for a single batch: the
  runner sends batches sequentially. Other tabs/account activity can still reach the
  in-flight limit.

### Confirmed from current Requesty documentation (checked 2026-10-05)

- Requesty supports Server-Sent Event streaming for its major providers and documents
  `stream: true`; for usage/cost on a stream, it documents
  `stream_options: { include_usage: true }`, with a final usage chunk before
  `data: [DONE]`. Its streaming guide explicitly recommends streaming to reduce
  timeouts: <https://docs.requesty.ai/features/streaming>.
- Its error reference distinguishes upstream 429 rate limits, provider/router 502/503/
  504 failures, and 499 client-closed/interrupted streams; it says responses carry an
  `x-request-id` for support. The 503 description is an upstream timeout, and a stream
  error may arrive after streaming starts:
  <https://docs.requesty.ai/features/error-codes>.
- Requesty describes limits as **in-flight concurrency**, not a per-minute request
  quota; 429 can also mean an organization/user concurrent-request limit:
  <https://docs.requesty.ai/features/api-limits> and
  <https://docs.requesty.ai/features/in-flight-rate-limits>.
- The public pages checked do **not** substantiate this code's assertion that every
  proxied completion has a hard 600 s limit. Keep an app deadline as a safety guard, but
  label it as the app's deadline—not a verified Requesty limit. The public error docs
  do not provide enough information to infer an account's in-flight allowance.
- The Requesty model page for the built-in `openai/gpt-6.1-sol` reports 128,000 max
  output tokens (reasoning and answer share the completion ceiling):
  <https://www.requesty.ai/models/openai/gpt-6.1-sol>. The live `/models` catalog is
  still the preferred per-model capability source; a family fallback is not evidence
  of that model's actual limit.

### Not yet confirmed (requires the next authenticated run)

The exact cause of the reported timeout could not be decided from the pre-change UI/error
records. A local AbortController timeout, an HTTP 503/504, `finish_reason: "length"`,
a 200 with malformed/missing content, or a stream missing its terminal marker have
different remedies. No authenticated Requesty generation run was made in this repository
session, so no real API-start/first-token/completion measurements can be claimed yet.

## Solution design

### A. Request and completion protocol

- Request SSE with `stream: true` and `stream_options.include_usage: true`.
- Decode SSE incrementally, handling UTF-8/chunk boundaries, CRLF, multiple `data:`
  lines, usage-only final chunks, `finish_reason`, and `[DONE]`.
- Treat `[DONE]` or a clean EOF with a non-null final `finish_reason` as terminal.
  EOF without either is `incomplete`/outcome-unknown; never extract/save a partial SVG
  and never automatically resend it. A terminal `finish_reason: "length"` remains the
  distinct `truncated` case.
- Continue to support a complete JSON response if a compatible endpoint ignores
  `stream: true`; it is complete only after the full body has parsed successfully.
- Record Requesty's `x-request-id` on success and on terminal HTTP errors. When a
  response is incomplete, use a local trace ID in logs and store no invented request ID.

### B. Conservative observed batch limits and timeout policy

- Cap one request at **4 / 2 / 1 / 1** images for low / medium / high / extra-high,
  respectively, then also apply the configured image count and app timeout ceiling.
  This encodes the reported safe limits; it does not claim a provider token or concurrency
  quota. A selection larger than the per-request cap becomes multiple sequential batches.
- Keep the app deadline explicit and report its duration. On deadline, classify the
  result as `timeout` with outcome `unknown`; do not retry. Do not present the prior
  600 s number as a verified gateway limit.
- Keep the completion-token ceiling clamped to the selected model's known output maximum.
  A `length` finish reason is a token-capacity failure, not a timeout. Do not infer a
  model's exact max from a generic family default when catalog data is available.

### C. Safe retry policy

| Result | Automatic resend? | Reason |
|---|---|---|
| HTTP 429 with a terminal response | Yes, after `Retry-After`/backoff and only within configured retry count | The request was explicitly rejected/rate-limited before a completion was returned. |
| timeout, abort, network disconnect, EOF without terminal marker | **No** | The remote outcome/charge is uncertain. |
| HTTP 5xx/provider timeout or an SSE error after partial output | **No** | Do not turn an uncertain/possibly charged attempt into a duplicate request. Check Requesty logs by request ID before a manual retry. |
| `finish_reason: length`, malformed response, invalid SVG | **No** | Truncation is confirmed; an unusable 2xx response may have been charged; invalid SVG requires a changed prompt/output. None is safe to resend blindly. |

For explicit uncertain outcomes, save a per-source `interrupted` sidecar attempt with a
redacted explanation, request ID if one exists, and `completedAt: null`. The next
confirmation warns that the previous attempt may have been charged and asks the user to
check Requesty before manually generating again. The previous valid SVG is untouched.

### D. Measurements and reporting

Use monotonic `performance.now()` for durations and an ISO wall-clock timestamp for API
start. Emit separate allowlisted records: one per HTTP attempt, one per response-to-SVG
parse, and one per source save/failure. The request record contains:

- local trace/batch ID, attempt number, model, effort, image count, token ceiling,
  app timeout;
- API start time, first response event (when available), first visible text token,
  terminal completion time, response parse time;
- HTTP status, retry-after milliseconds, finish reason, failure category, terminal/unknown
  state, token usage when the provider reports it, a redacted provider error, and
  Requesty request ID when received.

The SVG-parse record captures block matching time/counts. Each per-source save record
captures total validation/write/sidecar-save time and sidecar IO time separately.

Never log or persist the API key, Authorization header, prompt, image/data URL, SVG body,
full source path/name, or raw response body. Put structured diagnostics in the browser
console behind a fixed `[IconSplitter SVG]` prefix. The toast must include failed count
and a useful first error; rows keep their redacted per-source reason. Timeout wording
must say that the result is unconfirmed and was not retried.

### E. TDD acceptance tests

1. Red: current budget plan sends 4 medium / 3 high. Green: it plans 4/2/1/1 and a
   3-icon medium selection becomes 2+1; a 2-icon high selection becomes 1+1.
2. Red: streaming request body has no `stream` or usage option. Green: sends both.
3. Red: no parser tests for fragmented SSE or a lost `[DONE]`. Green: test split UTF-8
   chunks, CRLF, usage chunk, finish reason, `[DONE]`, malformed data, early EOF, and
   timeout after a first token; incomplete output is never returned as success.
4. Red: network/503 failures trigger retries and `x-request-id` is dropped. Green: only
   explicit terminal 429 is retryable, timeout/network/5xx/incomplete are not, and
   terminal request IDs are preserved.
5. Red: request and save timings are absent. Green: deterministic fake-clock/stream
   tests assert API-start/first-token/completion/parse/save metrics and that logs exclude
   secret/prompt/image/SVG/source fields.
6. Red: timeout summary omits `failed` and `problems`. Green: a timeout summary names
   the failure category, says outcome unknown/not retried, and contains no success-looking
   empty counts.
7. Red: uncertain failures disappear after reload. Green: the real runner writes an
   interrupted record with `completedAt: null`, preserves prior SVG versions, and
   performs one fetch only.

## Scope and limits

This fixes the application-side request planning, streaming/completion accounting,
unsafe retries, diagnostics, and error reporting. It cannot guarantee provider capacity
or identify an account-specific limit without a real Requesty response. After the change,
one user run at each tier should be diagnosed from its structured record rather than
from a guessed timeout multiplier.

## Implementation status and verification (2026-10-05)

Implemented in this branch. Every acceptance test above is now green against the real
code path — no re-implementation in the test:

| # | Acceptance test | Test that proves it |
|---|---|---|
| 1 | effort-capped batches | `svg_budget.test.ts` — "uses the observed safe per-request size at each effort…", "never plans an empty or above-tier batch"; `svg_cost_io.test.ts` — "splits medium effort into the observed two-image requests", "uses one image per high-effort request…" |
| 2 | streaming + usage requested | `svg_send.test.ts` — "posts the documented payload…": body has `stream: true`, `stream_options: {include_usage: true}`, and `x-request-id` survives as `out.requestId` |
| 3 | SSE completion accounting | `svg_send.test.ts` — "collects fragmented SSE through terminal completion and captures first-token timing", "treats clean EOF without finish_reason or DONE as an unconfirmed incomplete stream", "preserves usage and classifies a terminal streaming length finish as truncation", "classifies a terminal SSE provider error as uncertain and non-retryable" |
| 4 | only confirmed outcomes retry | `svg_send.test.ts` — "classifies rate limit with retry-after, model, provider and malformed answers", "treats a timeout as uncertain (never auto-retried)", "treats a lost network response as uncertain and never retryable"; `svg_cost_io.test.ts` — "retries a confirmed terminal 429 only after that response…", "keeps a confirmed 429 as the result when the user aborts during its retry delay", "persists one uncertain upstream timeout to every item without retrying" |
| 5 | timings + safe logs | `svg_send.test.ts` timing assertions (first event / first token / completion / parse / total, `transport` json vs sse); `svg_diagnostics.test.ts` — both allowlist tests; `svg_cost_io.test.ts` — save and SVG-parse durations recorded |
| 6 | honest failure summary | `svg_io.test.ts` — "summarises a run in one line with the real usage" (`outcome unknown`, `not retried`, the real first error) |
| 7 | uncertain results persist | `svg_cost_io.test.ts` — "records a lost terminal event as interrupted, preserves the old SVG, and does not resend" (one fetch, `completedAt: null`, prior version intact) |

One correction to the design above, found while implementing: a **2xx response with no
usable content** is not a safe confirmed failure. It may have been charged, so
`malformedFailure` in `src/lib/svgrequest.ts` records `kind: "malformed"` with
`outcome: "unknown"` and the row is stored as `interrupted`, like a lost terminal event.
Only confirmed retryable failures (`429` with the terminal response in hand) are resent;
`src/svg/runner.ts` gates resends on `failure.retryable && failure.outcome === "confirmed"`.

Verification run in this workspace (no authenticated Requesty call, so no live timings):

```text
npm run verify   # tools/pre_push_check.sh, all six lanes
  1/6 npx tsc --noEmit                        → clean
  2/6 npx eslint src tests tools              → 0 errors, 8 pre-existing warnings (App.tsx, lib/detect.ts)
  3/6 node tools/quality.mjs --changed        → GATE PASSED
  4/6 npx vitest run                          → 60 files / 551 tests passed
  5/6 npx vitest run --coverage               → src/lib 96.4% stmts; svgdiagnostics.ts 100%
  6/6 npm run build                           → dist/index.html 615.70 kB
```

`tools/quality.mjs --changed` crashed in this checkout because the branch has a single
commit, so neither `git merge-base origin/main HEAD` nor `HEAD~1` resolved. It now falls
back to git's empty tree (every tracked file gated) instead of throwing; the same fallback
is documented in `docs/current/CODE_VERIFICATION.md`.

Still open: the live per-tier records (real API-start → first-token → completion times and
the provider's own request IDs) can only be captured by one authenticated run per effort
tier. The structured records needed to read them are in place.
