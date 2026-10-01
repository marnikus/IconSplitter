# Module plan — isolated modules, budgets, rule check (2026-10-01)

Part of `docs/archive/2026-10-01-svg-confirm-global-log/design.md`. Line budgets are **targets**, counted as the
quality gate counts (`split("\n").length`); the gate, not this table, is the authority. Gate numbers for existing
files were measured on `9c27981` (see `docs/archive/2026-10-01-svg-confirm-global-log/research.md` §7).

## 1. Layers and the one-way rule

```
UI           src/log/Log*.tsx · src/svg/confirm/*.tsx
 ↓ state/IO  src/log/{use*,logstore,logstorage,logger,secrets,boot}.ts · src/svg/{send,runlog,actions}.ts · src/state/statelog.ts
 ↓ pure      src/lib/{svgprompt,svgpayload,log*}.ts            (lib imports lib only — RULE 1/3)
features ──► src/log/logger.ts and src/log/secrets.ts only      (never the store, never the UI)
shell    ──► state/boot.ts calls log/boot; ui/Workbench.tsx mounts LogDock — nothing else in the app does
```

A static test (`tests/log_boundaries.test.ts`, same style as `secret_hygiene.test.ts`) fails when: a
`src/lib/log*.ts` file imports outside `src/lib`; a `src/log/**` file imports anything but `../lib/*`,
`../state/safestorage`, `react` or a sibling; any file under `src/log/**` or `src/lib/log*.ts` mentions
`authHeader`, `keystore` or `apiKey`; `runner.ts` / `send.ts` import `../log/*` (the runner stays log-free, D8) or
call `buildChatRequest` / `batchPrompt` / `singlePrompt` (C-1).

## 2. New modules

| File | Owns (one responsibility) | Budget | Tests |
|---|---|---:|---|
| `lib/svgprompt.ts` (extend) | `composePrompt`, `joinBlocks`; `batchPrompt`/`singlePrompt` become wrappers | ≤ 110 | `svg_payload` |
| `lib/svgpayload.ts` | `prepareRun`, `withImage`, `elideImage`, `assertSendable`, `describeRequest`, fingerprint | ≤ 190 | `svg_payload` |
| `lib/logentry.ts` | types, vocab, `LOG_DATA_KEYS`, `isEntry`, `parseLog`, `serializeLog` | ≤ 220 | `log_entry` |
| `lib/logredact.ts` | `sanitizeInput`, the scrub-pattern table, caps | ≤ 160 | `log_redact` |
| `lib/logbuffer.ts` | `admit` (fold → flood → ring), `trimTo` | ≤ 130 | `log_buffer` |
| `lib/logformat.ts` | `formatEntry`, `formatAll`, `detailText`, labels | ≤ 110 | `log_format` |
| `lib/logscroll.ts` | follow machine (`atBottom`, `onUserScroll`, `onIntentUp`, `onAppend`, `onRestore`) | ≤ 70 | `log_scroll` |
| `lib/logprefs.ts` | `parseLogPrefs`, `serializeLogPrefs`, `MAX_CHOICES` | ≤ 70 | `log_entry` |
| `log/logstore.ts` | module-scope state, subscribe/snapshot, clear, max, minimised, Copy text | ≤ 150 | `log_store` |
| `log/logstorage.ts` | the two keys: load, debounced save, flush on error / `pagehide` | ≤ 120 | `log_store` |
| `log/logger.ts` | `log`, `logger`, `logStatus`, `newId`, clock, never-throw wrapper | ≤ 110 | `log_store` |
| `log/secrets.ts` | in-memory secret registry | ≤ 30 | `log_store`, `log_taps` |
| `log/boot.ts` | `bootLog`: hydrate, session id, `pagehide` hook | ≤ 80 | `log_store` |
| `log/useLog.ts`, `log/useStickyScroll.ts` | store binding; scroll container glue | ≤ 50 / ≤ 110 | `log_ui` |
| `log/LogDock.tsx`, `LogToolbar.tsx`, `LogList.tsx` | shell · actions · rows | ≤ 110 / 110 / 130 | `log_ui` |
| `log/log.css` | dock styles (outside the TS gates) | ≤ 160 | manual |
| `state/statelog.ts` | history/undo/redo taps and the tab tap — *what the app shell says* | ≤ 80 | `log_taps` |
| `svg/runlog.ts` | `RunEvent` → `LogInput` table; confirm/run-level entries | ≤ 170 | `svg_runlog` |
| `svg/send.ts` | one request with retries; new events; keeps `requestId`; redacts with the key | ≤ 130 | `svg_retry` (P0), `svg_send` |
| `svg/confirm/SvgConfirm.tsx` | dialog shell, actions, empty-rules guard | ≤ 110 | `svg_confirm` |
| `svg/confirm/ConfirmFacts.tsx`, `ConfirmPrompt.tsx` | facts + manifest overview · pager, blocks, rules editor, JSON | ≤ 90 / 150 | `svg_confirm` |
| `svg/confirm/ConfirmComposite.tsx`, `useConfirmRun.ts` | contact-sheet preview · derive `prepared`, pager state | ≤ 80 / 70 | `svg_confirm` |
| `batch/usePresetActions.ts` | moved verbatim from `useBatch` | ≤ 60 | `batch_presets` (new, written first — nothing covers the hook today) |
| `ui/useToast.ts` | the sheets toast (state + timer) and its status tap | ≤ 40 | `sheets_toast` |

27 new source files; directories: `src/log/` 10 files + css, `src/svg/confirm/` 5. The `lib/log*` group is 6 files
beside the existing `svg*` / `review*` groups. Decomposition (names are domain concepts, never `partN`):
`sanitizeInput` composes `scrubText`, `scrubData`, `scrubIds`, `capText`; `admit` composes `foldInto`,
`underFlood`, `ringTo`; `prepareRun` maps `prepareBatch`; the scrub patterns are a **table** (data, RULE 19 step 2).

## 3. Existing files that change (gate lines now → planned)

| File | Now | Change | Planned |
|---|---:|---|---:|
| `svg/runner.ts` | 298 | `sendBatch`, `SendOk/SendBad`, `delay`, `backoff` → `send.ts`; iterate `prepared.batches`; no prompt building | ≈ 265 |
| `svg/SvgDialogs.tsx` | 269 | confirm dialog, `Facts`, `Manifest`, `CompositePreview`, `Fact` → `confirm/` (move first, change after) | ≈ 170 |
| `svg/actions.ts` | 272 | `requestGenerate` stores ids only; `confirmGenerate(prepared)`; `beginRun` / `finishRun` split out of `confirmRun` (23 LOC) before log lines are added | ≤ 295 |
| `svg/types.ts` · `svg/SvgPanel.tsx` | 52 · 182 | `Dialog.confirm` → `{ kind, ids }` · pass `prompt` and `onPrompt` to the dialogs | 50 · ≈ 184 |
| `svg/composite.ts` | 56 | narrower param type; `size:mtime` guard | ≈ 62 |
| `lib/svgrequest.ts` | 246 | `wireHeaders(key)` shared with the dialog; `classifyHttp` (CC 10) untouched | ≈ 255 |
| `batch/useBatch.ts` | **300** | presets (−27) out first; then ≈ +4 taps | ≈ 280 |
| `selection/useSelection.ts` | 289 | `logStatus` at `say` and the two direct writes | ≤ 296 |
| `svg/ctx.ts` · `keystore.ts` · `keyactions.ts` · `scan.ts` | 169 · 56 · 38 · 83 | 2–4 lines each (status, model change, secret registry, scan result) | each +≤ 4 |
| `state/HistoryProvider.tsx` | 138 | one call in `record`, one in `run` (CC 1 functions; `onKey` at CC 10 untouched) | ≈ 142 |
| `state/boot.ts` · `state/safestorage.ts` | 10 · 22 | `bootLog()` + `installTabLog()` · `writeKey` returns boolean | 14 · 25 |
| `ui/Workbench.tsx` | 77 | `<LogDock />` beside `Shell`; Shell root `padding-bottom` class | ≈ 80 |
| `App.tsx` (legacy) | 581 | `toast` state + `toastTimer` + `say` (7 lines) → `useToast("sheets")` (2 lines): **net −5**, after a characterisation test | ≈ 576 |
| `selection/Surfaces.tsx`, `batch/BatchPanel.tsx`, `index.css` | — | toast/busy `bottom` offsets, in place | ±0 |
| `vitest.config.ts` | — | coverage `include` += `src/log/**` (the log's wiring is not otherwise in the lane) | +1 |

## 4. RULE 16 — code-quality gates

| Clause | Plan | Measured by |
|---|---|---|
| 16.1 function ≤ 20 (fail > 30), params ≤ 3 (fail > 4), hooks ≤ 10 (fail > 15) | every function above is a small pure step; `admit` takes `(buf, entry, ctx)` with `ctx = {now, max}` — two facts, not an options bag; `prepareRun(args: PrepareArgs)` groups one domain input; no component has more than ~6 hooks | `node tools/quality.mjs --changed --allow-legacy` |
| 16.2 CC ≤ 10, nesting ≤ 4 | lookup tables for the vocabulary and scrub patterns; guard clauses; no new branch in `classifyHttp` or `onKey` (both at CC 10) | gate + eslint |
| 16.3 `src/lib` lines ≥ 80 %, no decrease (baseline 97.47 %); every new function has a test that fails if it is deleted or a boolean is inverted; batch loops prove per-item isolation | new pure code lives in the lane; `src/log/**` joins it; the run loop gets a "refused batch does not stop the next" test (RULE 5/7) | `vitest --coverage`, review |
| 16.4 smells | reuses `redact`, `fnv1a32`, `costLabel`, `fmtTokens`, the parse/serialize pattern; jscpd stays at 11 clones; no dead exports | jscpd, tsc, lint |
| 16.5 legacy | `App.tsx` net −5; `useBatch.ts` freed before use; no baseline entry grows | gate ratchet |
| 16.6 workflow | design here → tests first → measure → current docs in the same change | `test-plan.md` |

## 5. RULE 18 — ideal sizes, and RULE 19

| Element | Ideal | Plan |
|---|---|---|
| Function / component | 4–20 lines | all planned ≤ 20; the heaviest are `describeRequest`, `useStickyScroll`'s effect and `LogList` render (≈ 20–25, one concept each) |
| File | 150–300 | all budgets ≤ 220. Files under 150 (`logscroll`, `logprefs`, `secrets`, `logformat`…) each own one rule; merging them would mix responsibilities — a preference, not a fail line |
| Module directory | 5–15 files (7–10 sweet) | `src/log/` 10 · `src/svg/confirm/` 5; `src/svg/` already holds 35 files (ideal 15) — the new confirm UI goes in a sub-directory so it does not grow |
| Context file | 60–200 lines | this folder: 8 files, 86–162 lines (`wc -l`) and 8–13 KB each — the largest existing design is `history-session`, 179 lines / 11 KB; `test-cases.md` was split off `test-plan.md` for this reason, and a reader needs the hub plus one or two files |
| RULE 19 order | nesting → CC → cognitive → size | nothing starts over the line; the four extractions are *by concept* (one request with retries · the confirmation dialog · presets · the transient status) and are equivalence-gated |

## 6. Dependencies and bundle

No new runtime or dev dependency (single-file offline build, RULE 20; D14). Bundle budget: ≤ +40 kB raw /
+12 kB gzip over the measured `dist/index.html` 601.97 kB / 176.88 kB — re-measured in P8.
