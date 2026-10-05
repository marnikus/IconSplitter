# Design — full prompt preview in the SVG confirmation + the global log dock (2026-10-05)

Two features, one change set: (1) the Generate SVG confirmation must show the
**exact** final API prompt, and (2) the app gets a **global log** docked at the
bottom, on every tab, with copy/clear/cap and honest auto-scroll.

Written before the code (RULE 16.6 step 2). Rule numbers refer to
`docs/current/AGENT_RULES.md`.

## 1. Research — the flows this touches

| Flow | Owner today | What the design must reuse |
|---|---|---|
| Prompt text sent with a request | `src/svg/runbatch.ts::sendBatch` composes `singlePrompt`/`batchPrompt` and calls `lib/svgrequest.buildChatRequest` | one builder, or the preview can drift from the payload |
| The plan the user confirms | `src/svg/actions.ts::requestGenerate` → `planBatches` + `validateBatchPlan`; `SvgConfirm` rebuilds the same split | the splitter is already single-owned (`lib/svgbatch`) |
| Confirmation UI | `src/svg/SvgConfirm.tsx` (facts, pages, composite per page, ordered `position — name` list) | facts + pagination stay; the prompt/wire preview is added per page |
| Run stages / results | `RunEvent` union in `src/svg/runtypes.ts`, mapped to rows by `src/svg/runstate.ts` | the log maps the **same** event stream — no second source of truth |
| Retries | `runbatch.ts::sendBatch` loops attempts; **no event today** | a new `request-retry` event (the log must name retries) |
| Cross-tab state | `src/state/appstore.ts` (module store + `useSyncExternalStore`), written by `HistoryProvider`/panels | the log store copies that proven shape (React-free, testable, RULE 12) |
| Storage | `safestorage.readKey/writeKey`, validated payloads (`lib/history.parseTimeline`, `lib/reviewprefs`) | validate-on-read, defaults on corruption (RULE 13) |
| Secrets | `lib/svgsecret` (`maskKey`, `containsSecret`, `redact`, `KEY_SHAPE`) + `tests/secret_hygiene.test.ts` | every logged string goes through `redact`; the hygiene test is extended |
| Docked chrome | `ui/Workbench.tsx` shell, `selection/hotkeys.isTextField`, fixed overlays in `index.css` | the dock lives in the shell, is not a workflow surface |

RULE 20 reminder: images never leave the browser; the log is a *local* record,
so it must never carry image bytes, data URLs, prompts or keys.

## 2. Part 1 — the preview must equal the payload

**Root cause of drift risk:** the prompt is composed in the async runner; the
dialog only shows facts. Two composers would be a RULE 10 violation.

**Owner:** new `src/lib/svgpayload.ts` (pure):

```ts
buildPayload({ model, userPrompt, manifest, image, caps, params })
  -> { prompt, request }            // one item => singlePrompt, else batchPrompt
payloadLines(request)               // the wire preview, derived FROM the request
```

* `buildPayload` is the **only** place a request is composed;
  `runbatch.sendBatch` and `SvgConfirm` both call it with identical inputs, so
  equality is by construction, not by imitation.
* `payloadLines` walks `Object.entries(request)`, so any field added to the wire
  shape appears in the preview automatically (anti-drift test asserts it).
* The preview shows, per page (one page = one request):
  * batch/grid summary (already in the page header),
  * the ordered `position — name → <file>.svg` list,
  * `svg-confirm-prompt`: the final prompt text **verbatim** (`<pre>`, no
    truncation, no highlighting additions),
  * `svg-confirm-payload`: one line per wire field — model, both content parts
    (text length, image length — never the image bytes), and every optional
    sampling field actually present on the request.
* The image part line only appears once the real composite is built; the prompt
  itself never depends on the image, which the tests state explicitly.
* Single-image requests are the honest edge case: the payload uses
  `singlePrompt` (prompt + icon name, no manifest) and the preview shows that
  text, not the batch text.

New files: `src/lib/svgpayload.ts`, `src/svg/SvgPromptPreview.tsx`.
Edited: `src/svg/runbatch.ts` (use the builder), `src/svg/SvgConfirm.tsx`.
Tests: `tests/svg_payload.test.ts`, extended `tests/svg_confirm.test.tsx`,
extended `tests/svg_runner.test.ts` (the sent text is the previewed text).

## 3. Part 2/3 — the global log

### 3.1 Ownership and layering

```
lib/log.ts        pure: schema, sanitising/redaction, ring buffer, format, parse
log/scroll.ts     pure: isAtBottom / metrics (auto-scroll rule)
log/logstore.ts   module-scope store (like state/appstore): entries, cap,
                  minimized, subscribe, debounced persist, flush
log/useLog.ts     React binding (useSyncExternalStore)
log/useAutoScroll.ts  the follow/pause behaviour
log/LogDock.tsx / LogHead.tsx / LogList.tsx / LogRow.tsx   the docked UI (chrome layer)
svg/runlog.ts     the SVG feature's log vocabulary: RunEvent -> LogSpec[]
```

`src/log/*` knows nothing about SVG; `src/svg/runlog.ts` knows the run events.
Direction stays UI/mode → generic infra → `src/lib`.

### 3.2 Event schema (one entry)

```ts
interface LogEntry {
  id: string;        // "l<time base36>-<seq>" — never a row index
  at: string;        // ISO-8601 UTC
  level: "debug" | "info" | "warn" | "error";
  feature: string;   // app | history | svg | log
  action: string;    // open-tab | push | request-start | request-retry | …
  ids: Record<string, string | number>;   // stable ids only (batch/source/entry)
  detail: string | null;                  // one redacted, truncated line
  data: Record<string, string | number | boolean | null>;  // counts, tokens, cost
  v: number;         // LOG_VERSION — a foreign payload is ignored, not trusted
}
```

What is recorded (requirement 3), and where it comes from:

| Kind | Source | Level |
|---|---|---|
| tab switch | `Workbench.openTab` | info |
| state changes incl. decisions/filters/selection | `HistoryProvider` push/pushGesture/undo/redo | debug/info |
| folder picked, scan result, key saved/cleared, prompt reset, model/sampling edits, confirm opened, generate confirmed, cancel requested, review decision | `src/svg/actions.ts`, `keyactions.ts`, `scan.ts` | info/warn |
| generation stages, API requests and results, tokens and cost | `RunEvent` → `src/svg/runlog.ts` | info |
| retries | new `request-retry` event | warn |
| provider request id | carried on `batch-done` → `request-done` (`requestId`, also saved into the sidecar) | debug |
| errors | `item-failed`, `request-failed`, failed `batch-done`, history apply failure | error |
| log's own actions | clear / cap change / copy / minimize | info/debug |

Never logged: the API key (only `maskKey` output), Authorization headers,
image bytes, composite data URLs, prompts (only lengths), full payloads.

### 3.3 Redaction and retention

* `sanitizeText`: `redact()` (key shapes → mask), `data:…` URLs → `[data-url]`,
  whitespace collapsed to one line, truncated to 400 chars.
* `sanitizeData`/`sanitizeIds`: scalars only, ≤12 keys, ≤200 chars per value,
  keys matching `(api_key|key|secret|password|authorization|auth|bearer|
  credential|token|data_url)` dropped. `tokens`/`tokenCount` stay (they are
  numbers, not secrets).
* `clampLogMax(raw)`: nonsense/absence → 200; otherwise clamped to [50, 1000]
  and snapped to the nearest offered size (50/100/200/500/1000). One value
  governs **both** display and storage (RULE 10 — the cap trims immediately).
* Persistence: `localStorage["iconSplitter.log.v1"]` = `{v, max, minimized,
  entries}`; entries beyond the cap are dropped oldest-first; parse validates
  field by field (RULE 13) and re-sanitises (defence against an older build).
* Writes are debounced 150 ms; `flushLog()` runs on pagehide/unmount so a
  restart keeps what the panel showed.

### 3.4 Scroll behaviour

`isAtBottom({scrollTop, scrollHeight, clientHeight}, slack=24)` is the single
rule. The list attaches a scroll listener; while the user is at the bottom the
panel pins to the tail (new entries scroll into view); scrolling up sets
"paused" and the tail no longer follows; returning to the bottom resumes.
The header names the state (`log-autoscroll`) so pause/resume is visible
(RULE 24), and the panel never yanks the view while the user is reading.

### 3.5 UI handles (added to UI_SELECTORS.md)

`log-dock`, `log-head`, `log-count`, `log-max`, `log-minimize`,
`log-copy`, `log-clear`, `log-note`, `log-autoscroll`, `log-body`,
`log-list`, `log-entry`, `log-empty`.

Plus, on the confirmation: `svg-confirm-prompt`, `svg-confirm-payload`; the
manifest rows keep `svg-batch-items` and gain `→ <file>.svg` (the ordered
position + filename list).

## 4. Tests (TDD, RULE 8 — each fails if the feature is deleted)

| File | Proves |
|---|---|
| `tests/svg_payload.test.ts` | one builder: single vs batch text, verbatim user prompt, only model-accepted fields, `payloadLines` covers every wire field, no image bytes in the lines |
| `tests/svg_confirm.test.tsx` (extended) | the page's `svg-confirm-prompt` equals `buildPayload(...).prompt` for 1- and n-image pages, payload lines match the request object, filenames listed |
| `tests/svg_runner.test.ts` (extended) | the text actually sent is `buildPayload(...).prompt`; a retryable failure emits `request-retry` before resending; a success carries the provider request id on its own `batch-done` outcome |
| `tests/log_lib.test.ts` | entry construction, ring buffer, clamping, redaction/scrub/truncation, format, corrupt-payload rejection |
| `tests/log_scroll.test.ts` | `isAtBottom` boundary (slack, exact bottom, short content) |
| `tests/log_store.test.ts` | append + notify, cap trimming, persistence + restart, clear leaves one honest entry, secrets never reach storage, minimize persists |
| `tests/svg_runlog.test.ts` | every `RunEvent` maps to an entry with ids/tokens/cost; composite data URL and key-shaped text never appear |
| `tests/log_ui.test.tsx` | dock present on every tab, minimize/restore, copy-all text, clear, cap control, auto-scroll pause/resume, redacted row text, `role="log"` |
| `tests/secret_hygiene.test.ts` (extended) | a key logged through the real store never appears in storage or in the copy text |

## 5. RULE 16/18 budget (checked before the change was called done)

* No new function >30 lines, >4 params, CC >10, nesting >4.
* New files aimed at RULE 18 ideals (150–300 lines): `lib/log.ts` ≈ 200,
  `log/*` ≤ 120 each, `svgpayload.ts` ≈ 70, `SvgPromptPreview.tsx` ≈ 70.
* Legacy hotspots (`src/App.tsx`, `lib/detect.ts`, `lib/render.ts`) are not
  touched at all.
* Coverage: every new lib function has a deleting-it-fails test; no uncovered
  new function without an override.

## 6. Verification checklist (what "done" means)

1. `npm test` green, including the preview-equals-payload assertions.
2. Log works on all five tabs (same dock instance), persists within the cap,
   pauses/resumes auto-scroll, redacts keys (storage + DOM + copy).
3. `npx tsc --noEmit`, `npm run lint`, `node tools/quality.mjs --changed
   --allow-legacy`, `npm run coverage`, `npm run build` all pass.
4. `SYSTEM_OF_RECORD.md`, `UI_SELECTORS.md`, `docs/README.md` updated in the
   same change (RULE 17).
