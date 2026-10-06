# Design — long SVG generations must survive, not be truncated

Date: 2026-10-05 · Status: implemented · Mode: Generate SVG (tab 5)

Prompt under work (verbatim intent):

* Medium/High reasoning **must not** reduce image count, token budget or task
  scope. Keep the batch **as big as the user defined** — one image per request
  was the wrong fix.
* Generation may take **as long as required**; stop only on a confirmed
  provider failure or an explicit user cancel.
* Remove the premature client/request timeout. Research Requesty, proxy, HTTP
  and streaming timeout limits.
* Keep the connection alive with streaming/heartbeat, or poll status when
  supported. Distinguish *slow processing*, *disconnected client*, *provider
  timeout* and *failed request*.
* Preserve the request id; recover after reconnect/restart **without**
  submitting a duplicate.
* Show elapsed time and a Cancel control.
* Verify: long medium/high requests, large outputs, reconnect, restart,
  cancellation and delayed successful completion.

**This reverses D2 of `2026-10-01-svg-batches-limits-preview`.** That change
capped a request at 2 icons (medium) / 1 icon (high) and raised a *total*
timeout. This prompt says both were the wrong lever: the batch stays exactly as
configured, and the wait is not a cap on the work.

## 1. What is actually wrong today

| # | Defect | Where | Consequence |
|---|---|---|---|
| L1 | the request is aborted after a **total** `timeoutMs` | `src/lib/svgrequest.ts` (AbortController timer) + `src/lib/effortlimits.effectiveTimeoutMs` | a request that is still generating at 90 s (or at a tier floor) is killed even though the provider is healthy and working |
| L2 | the batch was shrunk to "fit" inside that timeout | `src/lib/effortlimits.effectivePerRequest` (medium 2, high 1) | fewer icons per request, more requests, more cost and more waiting — and still no guarantee, because a single icon can think for minutes |
| L3 | nothing streams, so no byte moves while the model thinks | `buildChatRequest` (no `stream`), `sendChatRequest` (awaits the whole body) | every intermediary sees an idle socket: nginx `proxy_read_timeout` (60 s default), AWS ALB (60 s idle) and Cloudflare (100 s free / 600 s enterprise idle) close it. The client then reports a transport error for a request the provider is still running |
| L4 | a dead half-open socket is indistinguishable from a slow one | no idle watchdog anywhere | either the UI hangs forever (TCP half-open, laptop sleep) or it is aborted blind |
| L5 | the request id is read but never kept | `readRequestId` result is dropped; sidecar `requestId` stays `null` | after a stall/restart there is no way to ask the provider what happened, and no way to prove a duplicate was not sent |
| L6 | no elapsed time | `SvgBatchStrip`, `SvgBulkBar` | a long run looks frozen; the user cannot tell "working" from "dead" |

## 2. Research (2026-10-05)

| Finding | Source | Consequence for this app |
|---|---|---|
| Requesty `/v1/chat/completions` accepts `stream: true` (SSE `data:` lines) and returns usage/cost only when the caller also sends `stream_options: {"include_usage": true}`; the non-streaming response carries usage by default | docs.requesty.ai — Overview, Streaming, Create Chat Completion | we must stream **and** ask for the usage chunk, or per-version cost becomes unknown for every long run |
| Proxy read timeouts reset on **every read**: nginx `proxy_read_timeout` (60 s default), `proxy_send_timeout`, ALB 60 s idle, Cloudflare 100 s (free) / 600 s (enterprise) — a stream that keeps emitting is never cut regardless of total duration | nginx/Ollama/SSE production guides; channel.tel SSE architecture | a continuous stream is the only client-side fix that works at every layer; a total-duration timer cannot be chosen correctly from the browser |
| SSE comment lines (`: keepalive`) are part of the spec and **must be ignored** by a parser; servers send them every 10–30 s precisely to defeat the idle limits above | WHATWG SSE spec summary + keepalive PRs/issues | our parser must treat `:` lines as liveness, not as content, and count them as activity for the watchdog |
| A silently dead TCP connection fires **no** error event; only an idle watchdog detects it. Production clients abort and reconnect after N seconds of no events | claude-code issue #33949 root-cause analysis | we need an **idle** (stall) timeout — never a total one — and a stall must be reported as *outcome unknown*, not as a failure worth retrying blind |
| `x-request-id` / `Idempotency-Key` are the documented way to talk to support about a specific call and to make retries safe; a gateway may or may not echo the header | API contract issues (ReliaAstra #66) | keep whatever id comes back (header first, then SSE `id:`) in the sidecar + a small in-flight journal, so a stall/restart is explainable and never silently duplicated |

## 3. Decisions

**D1 — the batch is the user's.** `lib/effortlimits` no longer caps icons. The
effective per-request size is `clampImagesPerRequest(config.imagesPerRequest)`
and nothing else; the effort tier changes only the *wait*, never the work. The
confirmation shows "8 images → 2 requests × 4" at **every** tier.

**D2 — stream everything.** `buildChatRequest` sends `stream: true` plus
`stream_options: {include_usage: true}`. `lib/svgstream.ts` (new) parses the
SSE frames: `data: {...}` deltas are concatenated, `: keepalive` comments are
ignored, `[DONE]` ends the stream, an `error` payload or a non-2xx status is a
confirmed provider failure. A response that is not `text/event-stream` (a
provider that ignores `stream`) is read as one JSON body — same result shape.

**D3 — no total timeout; an idle watchdog only.** The configured value
(`svg-timeout`, 5–900 s, default 120 s) is interpreted as the **stall window**:
the longest silence tolerated *between* bytes. Every read — delta, keepalive or
`[DONE]` — resets it, so a request may run for hours as long as it is alive.
Tier floors stay (low 120 s, medium 300 s, high/xhigh 600 s) as *minimum stall
windows*: a stalled connection behind a 60 s proxy must be detected by the
proxy before we can see it, and a big window never truncates a live request.
The label says so ("stall 300s (medium floor) — no total limit").

**D4 — four distinct outcomes, never one word.** `classifyTransport` gains
`stalled`, and the runner reports:
* *slow but alive* — still running, elapsed time visible, Cancel available;
* *stalled* — no byte for the stall window: connection presumed dead, outcome
  **unknown**, the request id is kept and shown, **nothing is resent**;
* *provider failure* — HTTP status, an SSE `error` payload, or a malformed
  answer: a confirmed failure, reported per request with its status;
* *cancelled* — the user pressed Cancel: partial results are kept, unsent
  work stops.
A provider-side timeout now arrives as an HTTP error or an SSE error event and
is reported as such — not invented by our own clock.

**D5 — request ids are kept.** `readRequestId` also looks at the SSE `id:`
field, and the id is written where it matters: the version's sidecar
(`requestId`) and the in-flight journal. Errors name it, so a support question
is answerable ("request 4f3a… ran 12 min, outcome unknown").

**D6 — a journal makes restart recovery honest.** `src/svg/journal.ts` (new)
stores the in-flight requests in localStorage (`iconSplitter.svg.inflight.v1`,
validated on read, cleared on completion). Written when a request starts,
updated when its id arrives, removed when it finishes or fails. On the next
boot the rows whose ids appear there come back as **interrupted / outcome
unknown** with their elapsed time and request id, and the panel offers an
explicit "Retry these" action. Nothing is resubmitted automatically — a
duplicate submission is a duplicate charge (RULE 4/23).

**D7 — elapsed time and Cancel are part of the run UI.** `RunProgress` carries
`startedAt`; the strip shows a ticking `elapsed m:ss` (and the run's per-request
lines keep their own elapsed), next to the existing Cancel. Cancelling aborts
the current stream, keeps everything already saved, and reports the unknown
outcome of the request that was cut — never a retry.

**D8 — docs move in the same change.** SYSTEM_OF_RECORD §2/§5/§7/§8/§11,
UI_SELECTORS §P, a new dated QUALITY_RECHECK entry, docs/README.

## 4. Module plan

| File | Change | Responsibility after |
|---|---|---|
| `src/lib/svgstream.ts` | new (~120 lines) | the SSE frame parser: deltas, keepalive comments, usage chunk, error payload, `[DONE]`; a pure accumulator fed by any byte chunks |
| `src/lib/svgrequest.ts` | edit | `stream: true` + `stream_options`, `sendChatStreaming` (reader loop + idle watchdog), request id from header **or** stream, `stalled` classification |
| `src/lib/effortlimits.ts` | rewrite (smaller) | stall floors only; no icon cap; honest labels and hints |
| `src/lib/svgconfig.ts` | edit | default stall window 120 s, documented range kept (5–900 s), label wording |
| `src/svg/journal.ts` | new (~90 lines) | the in-flight journal: begin/attach/end/load/clear, validated reads |
| `src/svg/runbatch.ts` | edit | stream the request, keep the id, journal the request, elapsed timings, no auto-retry on a stall |
| `src/svg/runner.ts`, `runtypes.ts` | edit | the user's batch size, stall-aware failure text, `startedAt` |
| `src/svg/runstate.ts` | edit | journal-driven recovery state, per-request elapsed |
| `src/svg/SvgBatchStrip.tsx`, `SvgBulkBar.tsx` | edit | ticking elapsed + Cancel (already there) |
| `src/svg/SvgConfirm.tsx`, `SvgControls.tsx`, `SvgPanel.tsx` | edit | batch = configured at every tier; the wait is described as a stall window |
| `src/svg/actions.ts`, `useSvgGen.ts` | edit | read the journal on boot, expose the interrupted rows + explicit retry |

## 5. TDD order (each test fails before the change)

1. `tests/svg_stream.test.ts` (new) — the parser: chunk boundaries inside a
   frame, `data:` deltas joined, `: keepalive` ignored, `[DONE]`, usage chunk,
   error payload, an unparseable frame reported instead of swallowed.
2. `tests/svg_stream_read.test.ts` (new) — the reader over a real
   `ReadableStream`: idle watchdog fires on silence and reports `stalled`;
   a keepalive resets it; the user's signal aborts; a non-SSE body falls back
   to JSON; the request id is taken from the header or the stream.
3. `tests/svg_effort.test.ts` (rewrite) — no icon cap at any tier; the wait is
   a stall window with tier floors; the labels/hints say "no total limit" and
   "outcome unknown — nothing was resent".
4. `tests/svg_journal.test.ts` (new) — write/read/corrupt/clear, ids attached
   late, a finished request removed.
5. `tests/svg_runner.test.ts` (rewrite the transport) — 8 images at 4 are two
   requests **at medium and high**; a request that streams for many minutes
   (fake timers) completes and saves; a silent stream stalls once, reports
   unknown and is never resent; Cancel mid-stream keeps what was saved;
   the journal is written and cleared.
6. `tests/svg_confirm.test.tsx` (edit) — the request count follows the user's
   size at every tier.
7. `tests/svg_ui.test.tsx` (edit) — elapsed time ticks while running, Cancel is
   present, a stalled request is labelled outcome-unknown with its id, and the
   panel says the batch is the configured one at medium/high.

## 6. Rule budget (RULE 16/18/19)

* new files ≤ 200 lines (hard fail 300); every new function ≤ 20 lines
  (hard fail 30), ≤ 3 params (hard fail 4), CC ≤ 10, nesting ≤ 4.
* the reader loop is the only nesting-heavy spot: it is split into
  `readOnce` / `feed` / `finish`, each flat.
* no `partN` helpers; `StreamState`/`SseEvent` are domain types.
* `src/lib` coverage stays ≥ 80 % (the parser + reader are fully covered by
  tests 1–2).

## 7. Rejected alternatives

* **Keep the total timeout, only raise it** — the correct value cannot be
  chosen from the browser: a large output legitimately takes longer than any
  constant, and a proxy may cut us anyway. Only liveness (bytes moving) is a
  decidable signal.
* **Retry automatically after a stall** — the provider may still be generating
  and may still bill the answer: a resend is a possible duplicate charge
  (RULE 4/23). A stall is reported as unknown; only the user retries.
* **Background/poll a provider job id** — Requesty's chat endpoint does not
  document a job-status resource, so polling would be invented behaviour.
  `stream_options.include_usage` + `[DONE]` is the supported completion signal.
* **Keep the 1/2-icon cap and simply wait longer** — the prompt rejects it:
  the tier must not shrink the work (D1).
* **Drop the watchdog entirely** — a silently dead socket would hang the run
  forever (the documented half-open failure); the stall window is what turns
  "no bytes for N seconds" into an honest, non-destructive report.
