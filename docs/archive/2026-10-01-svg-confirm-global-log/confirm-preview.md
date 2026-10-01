# Confirmation preview — the request you read is the request that is sent (2026-10-01)

Feature 1 of `docs/archive/2026-10-01-svg-confirm-global-log/design.md`. Evidence for every "today" claim:
`docs/archive/2026-10-01-svg-confirm-global-log/research.md` §2–3.

## 1. What the popup must show — the four parts the request already has

| # | Requirement bullet | Text segment (batch template, today's wording) | Today | Editable |
|---|---|---|---|---|
| 1 | batch / grid summary | `Here is a batch of icons arranged in numbered grid order:` | head of `batchPrompt` | no (template) |
| 2 | ordered position + filename list | `1 — fog_AI` … one line per image, batch-local positions | `manifestLines` | no (derived from the plan) |
| 3 | output-order / naming instructions | `Create one SVG icon for every position. Return the SVGs in the same numeric order, starting from 1. Use the exact same name in the SVG <title>.` | private `ORDER_LINE`, invisible | **no** — the response parser maps by position and `<title>` (A-1) |
| 4 | complete editable SVG generation rules | the stored prompt, `.trim()`med | tab textarea `svg-prompt` | **yes** |

A batch of **one** image (e.g. the last request of a run) uses the *single* template: rules, blank line,
`Icon name (use it as the SVG <title>): <name>`. The popup shows whichever template applies to the request on
screen — never the batch one by default. Beside the text the facts (not part of the text) show grid
`cols×rows`, empty cells, model, sampling, endpoint and attempts/timeout.

## 2. Contract

```ts
// src/lib/svgprompt.ts — extended; batchPrompt/singlePrompt keep their signatures and output
type BlockId = "summary" | "positions" | "protocol" | "rules" | "naming";
interface PromptBlock { id: BlockId; text: string; editable: boolean }
interface PromptParts { kind: "batch" | "single"; blocks: PromptBlock[]; text: string }
composePrompt(rules: string, items: readonly ManifestItem[]): PromptParts   // text === joinBlocks(blocks)

// src/lib/svgpayload.ts — new, pure (no IO, no clock, no DOM)
interface PrepareArgs { sources: readonly BatchSource[]; config: SvgConfig; caps: ModelCaps;
                        params: SamplingParams; rules: string }
interface PreparedBatch { plan: BatchPlan; parts: PromptParts; request: ChatRequest; fingerprint: string }
interface PreparedRun { v: 1; endpoint: string; model: string; rules: string;
                        batches: PreparedBatch[]; fingerprint: string }
prepareRun(a: PrepareArgs): PreparedRun
withImage(r: ChatRequest, dataUrl: string): ChatRequest   // replaces ONLY the image url; throws if there is not exactly one slot
elideImage(r: ChatRequest): ChatRequest                   // image url -> IMAGE_SLOT, for display and hashing
assertSendable(r: ChatRequest): void                      // throws unless every image url is a data:image/ URL
fingerprintOf(r: ChatRequest): string                     // 8 hex digits + "." + JSON length (base 36), image elided — also used by send.ts
describeRequest(r: ChatRequest, caps: ModelCaps): string  // "no temperature · 32 000 max tokens · effort high": values from the object, `caps` only decides the "offered but not chosen" wording
```

`joinBlocks` is the only place separators live (`\n` between summary and positions, `\n\n` elsewhere), so the
text can never be concatenated a second way. `fingerprint` = `fnv1a32(JSON.stringify(elideImage(request)))`
as 8 hex digits, a dot, then the JSON length in base 36; a run's fingerprint hashes its batch fingerprints.
`IMAGE_SLOT` is `image-slot:contact-sheet` — deliberately not a data URL, so a leak is detectable. One
`wireHeaders(key)` helper in `lib/svgrequest.ts` serves `sendChatRequest` *and* the dialog's header list, so
there is no second list of headers to drift. `describeRequest` keeps `paramsLabel`'s wording — the existing `svg-confirm-sampling` assertions are its golden.

## 3. Invariants

| id | Statement | Enforced by |
|---|---|---|
| C-0 | **Byte-compatible.** For the same inputs `composePrompt(...).text` equals today's `batchPrompt` / `singlePrompt` output. The feature changes where text is built, not what it says. | golden strings pinned in `svg_payload.test.ts` *before* the refactor |
| C-1 | **One builder.** Only `prepareRun` creates a request body; `runner.ts` / `send.ts` contain no `buildChatRequest`, `batchPrompt` or `singlePrompt` call. | static test over `src/svg/*.ts` |
| C-2 | **Same object.** `confirmGenerate(prepared)` passes the *rendered* object to the runner; nothing is re-read at click time (`RunArgs` has no `caps/params/prompt`). | type + `svg_confirm` "edit, then send" test |
| C-3 | **Wire = preview.** The posted body equals `JSON.stringify(withImage(prepared.batches[i].request, dataUrl))`; the displayed JSON differs from it in the image URL only. Every attempt of one request posts the same string. `send.ts` recomputes the fingerprint of the exact object it is about to post (image elided) and refuses on a mismatch, so the `fp` logged at `request.sent` is *measured*, not echoed. | `svg_confirm` + `svg_send` body-equality tests |
| C-4 | **Fail closed.** An unfilled image slot, an unbuildable composite, or a source whose `size:mtime` ≠ its plan fingerprint sends nothing for that batch; the reason is named (`request-failed`, kind `payload`) and later batches still run (RULE 5/7). | `svg_send`, `svg_cost_io` |
| C-5 | **Empty is not broken.** `rules.trim() === ""` disables *Generate now* and says why (RULE 4). | `svg_confirm` |
| C-6 | **One decision, one value.** The popup editor and the tab textarea write the same stored prompt through `setPrompt`; both mirror it in the same render (RULE 10, RULE 24). | `svg_confirm` two-way sync test |
| C-7 | **Evidence.** The dialog shows the run fingerprint; the log carries it at accept and at every send (`log-contract.md`). | `log_taps`, `svg_runlog` |

## 4. Dialog anatomy

```
┌ Confirm SVG generation ─────────────────────────────────────────────────────────── [Close] ┐
│ 9 images · 3 requests · up to 3 attempts, 90 s timeout                                     │
│ POST https://router.requesty.ai/v1/chat/completions · openai/gpt-6.1-sol                   │
│ no temperature · 32 000 max tokens · effort default                                        │
│ Request ‹ 2 of 3 ›    grid 2×2 · 4 images · fingerprint 3fa9c1d2.1b4   [Copy exact prompt] │
│                                                                                            │
│ ┌ Batch summary + ordered positions ────────────────────────────── read-only ┐             │
│ │ Here is a batch of icons arranged in numbered grid order:                  │             │
│ │ 1 — fog_AI   2 — court_AI   3 — harbor_AI   4 — dune_AI                    │             │
│ ├ Output order & naming ─────────────────────── required by the app · locked ┤             │
│ │ Create one SVG icon for every position. Return the SVGs in the same …      │             │
│ ├ Generation rules ──────────────────────────────────────────────── editable ┤             │
│ │ [ textarea — the stored prompt ]                                           │             │
│ └────────────────────────────────────────────────────────────────────────────┘             │
│ ▸ Request JSON (headers + body, image elided)        ▸ Contact sheet · [Build]             │
│ ▸ All requests (ordered positions per request)                                             │
│                                               [Cancel]    [Generate now · 3 requests]      │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

Blocks are plain `<pre>` / `<textarea>` nodes; labels sit *outside* the text nodes, so the blocks' `textContent`
joined with the single separators equals the request text (tested). Existing handles are kept
(`svg-confirm`, `-generate`, `-cancel`, `-close`, `-count`, `-requests`, `-model`, `-sampling`, `svg-manifest`,
`svg-composite*`). New: `svg-confirm-endpoint`, `svg-confirm-pager` (`-prev`, `-next`, `-index`),
`svg-prompt-block-<id>`, `svg-confirm-rules` (textarea), `svg-confirm-rules-note` (shown only when trimming
changes the text: "leading/trailing spaces are removed when sent"), `svg-confirm-json`, `svg-confirm-copy`
(+ `-copy-status`, `role="status"`), `svg-confirm-fingerprint`, `svg-confirm-empty-rules`.

## 5. Flow, before and after

* **Before:** `requestGenerate` stores `{ids, batches, perRequest}` → the dialog derives its own manifest →
  `confirmRun` re-reads state → the runner re-plans and rebuilds the text per batch.
* **After:** `requestGenerate(ids)` (guard unchanged) → `useConfirmRun` derives
  `prepared = useMemo(prepareRun(...))` from current state (RULE 24) → *Generate now* →
  `confirmGenerate(prepared)` → `runGeneration({ prepared, … })` → per batch: build composite → verify
  fingerprints → `withImage` → `assertSendable` → send. The dialog state shrinks to `{ kind: "confirm", ids }`.
* A catalog refresh or any state change while the dialog is open re-derives `prepared`; the user watches the
  text and the fingerprint change, and the click sends what is on screen. The pager clamps if the selection
  shrinks. Editing the rules re-derives on every keystroke (O(requests × text) — about 1 MB hashed for 50 requests).

## 6. Runner contract (what changes in `runner.ts` / `send.ts`)

`RunArgs` drops `caps`, `params`, `prompt` and gains `prepared`; it keeps `config` (timeout, retries, base URL),
`apiKey`, `root`, `sources`, `sidecars`, `signal`, `onEvent`. `runGeneration` iterates `prepared.batches` instead
of re-planning; a plan item whose source is no longer in `sources` fails that batch (`payload`, "selection
changed after confirmation — nothing was sent"). The sidecar's `prompt` field keeps recording the **rules**
(`prepared.rules`) — unchanged data. `buildComposite` accepts `Pick<SvgSource, "relPath" | "fingerprint">`, so the
dialog preview and the runner use the same plan items, and compares `${file.size}:${file.lastModified}` with the
plan fingerprint (`readDirTree` derives the scan fingerprint from the same two fields). New events
(`request-sent`, `request-retry`, `request-ok`) are specified in `log-contract.md` §4; `SendOk` keeps
`requestId` and `status`.

## 7. Honest states

| Situation | Behaviour |
|---|---|
| Rules empty | red note, *Generate now* disabled; not a silent send of nothing |
| No key / no root / nothing selected | unchanged guard toast; the dialog never opens |
| Source file changed since the scan | that batch is refused: "changed since it was scanned — rescan, then review again" |
| Composite cannot be built | "no request was sent" (existing wording); the other batches continue |
| Copy blocked by the browser | inline status "Clipboard is blocked — select the text and copy it" (RULE 9) |
| Double click on *Generate now* | one run (existing `running` guard, kept) |

## 8. Not changed

The text the provider receives (C-0) · sidecar schema · the tab's `svg-prompt` textarea and its reset ·
cost/usage code · handle ids that already exist · the guard order in `requestGenerate`.
