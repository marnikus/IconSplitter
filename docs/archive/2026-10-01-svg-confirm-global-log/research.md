# SVG confirmation + global log — research (2026-10-01)

Part of `docs/archive/2026-10-01-svg-confirm-global-log/design.md`. A read-only investigation: no source was
changed. Every claim names the file it was read from; numbers were measured in this sandbox on commit
`9c27981` after `npm ci`.

## 1. Measured baseline

| lane | result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 57 files / 517 tests, all green (27 s) |
| coverage (stmts / branch / funcs / lines) | 96.85 / 92.68 / 96.22 / 97.47 — the lane is `src/lib/**` only (`vitest.config.ts`) |
| `node tools/quality.mjs --allow-legacy` | per-file numbers in §7 |
| hooks | only `commit-msg` is installed here; `pre-push` is not (`tools/install_hooks.sh` installs it) |
| `knip` | cannot run in this sandbox (recorded in `QUALITY_RECHECK.md`) |

## 2. The send path today (Generate SVG)

1. `SvgBulkBar` button → `requestGenerate(ids)` (`svg/actions.ts:208`) → `guard` (no ids / no root / no key →
   toast) → dialog state `{ kind: "confirm", ids, batches: Math.ceil(n / perRequest), perRequest }`.
2. `ConfirmDialog` (`svg/SvgDialogs.tsx:44`) renders facts, a static note, its own `planBatches` manifest
   and, on demand, a composite of `picked.slice(0, imagesPerRequest)`. It never shows the prompt or the body.
3. **Generate now** → `confirmRun` (`actions.ts:237`) re-reads `ctx.m.config/caps/params/prompt` and
   `ctx.rows` at click time (`actions.ts:250`) and calls `runGeneration` (`svg/runner.ts:62`).
4. The runner re-plans (`planBatches`), then per batch: `tryComposite` (151) → `sendBatch` (163) which builds
   the text — `items.length === 1 ? singlePrompt : batchPrompt` — and `buildChatRequest`, then loops
   `attempt 0..retries` (170) calling `sendChatRequest`; a retryable failure waits `retryAfterMs ?? backoff`.
5. The wire request (`lib/svgrequest.ts` `sendChatRequest`): `POST chatUrl(baseUrl)`, headers
   `Content-Type: application/json` and `Authorization` (from `authHeader(key)`), body
   `JSON.stringify(request)` = `{ model, messages:[{role:"user", content:[text, image_url]}] }` plus
   `temperature` / `max_tokens` | `max_completion_tokens` / `reasoning_effort` only when the model accepts them.

## 3. Preview ↔ payload drift risks (why a single builder is needed)

| # | Finding | Evidence |
|---|---|---|
| R1 | The popup never shows the prompt or the body | `SvgDialogs.tsx:44–72` |
| R2 | Text is built at send time inside the runner; a run's last batch of one image uses a *different* template | `runner.ts:163–169` |
| R3 | The order/naming instruction is a private constant nobody can see; only the stored rules are editable | `lib/svgprompt.ts:12`, `SvgControls.tsx:115` |
| R4 | The plan is computed three times (dialog `planBatches`, runner `planBatches`, `Math.ceil` in the dialog state) | `SvgDialogs.tsx:46`, `runner.ts:63`, `actions.ts:213` |
| R5 | Click re-reads state instead of using what was rendered; `useModelSync` can swap caps/params while the dialog is open (a catalog refresh landing). Today both read the same committed state, so this is a structural risk, not a reproduced bug | `actions.ts:250`, `ctx.ts:121` |
| R6 | The dialog's sampling line comes from `paramsLabel`, not from the request object — two descriptions of one request | `SvgDialogs.tsx:56`, `lib/modelcaps.ts` |
| R7 | The previewed composite uses `picked.slice(0, n)`, the runner uses `plan.items` — equal today only by ordering coincidence | `SvgDialogs.tsx:112` |
| R8 | `buildComposite` reads current file bytes and never compares `size:mtime` with the scan fingerprint | `svg/composite.ts:32–40` |

## 4. Event and state flows a log can hook (inventory)

| Source | Mechanism today | Lifetime | Log tap (design) |
|---|---|---|---|
| Tab switch | `openTab` → `setAppState({tab})` (`ui/Workbench.tsx`); not undoable (§12.5) | store, module scope | `installTabLog` in `state/statelog` subscribes to `appstore` |
| Undoable edits, all tabs | `HistoryProvider` `record` (line 83) and `useApply` (95); entry carries `type, label, origin, ids` | provider above panels | one call each |
| Sheets | `App.tsx` `say` (43), `busy` | component state | `ui/useToast` extraction carries the tap |
| Batch | `useBatch` `say` (57) plus direct `toast:` writes (122, 134, 215, 272); `processItems` has `onProgress` / `shouldStop` | component state | `logStatus` at each; `process` start/done explicit |
| Selection (both tabs) | `useSelection` `say` (57) plus direct writes (229, 235) | component state | same |
| SVG status | `svg/ctx.ts` `useSay` (49), 4 200 ms | reducer of the mounted panel | `logStatus` inside `useSay` |
| SVG run | `RunEvent` (`runner.ts:24`): `batch-start, item-start, item-saved, item-failed, request-failed, batch-done, cancelled` → `onRunEvent` | per run | `svg/runlog.ts` beside `onRunEvent` |
| SVG gaps | no run-start/run-done event; **retries emit nothing**; `sendBatch` drops `requestId`/`status` that `sendChatRequest` returns, and `saveOne` stores `requestId: null` | — | three new `RunEvent` kinds; `send.ts` keeps `requestId` |
| API key | `svg/keystore.ts` (IndexedDB, memory fallback), `keyactions.ts` toasts | module | `watchSecret` / `forgetSecret` |

The only existing user-action timeline is `HistoryProvider` (≤ 100 undoable entries). Switching tabs, picking
a folder, batch runs, exports and clipboard actions are deliberately *not* in it (`SYSTEM_OF_RECORD.md` §12.5)
— so today nothing records them. The log fills exactly that gap and reads the timeline, never the reverse.

## 5. Why the store must sit above the tabs

`Shell` mounts exactly one panel (`Workbench.tsx:51–55`) and each tab model is a panel-local `useReducer`
(`svg/statemodel.ts`). A run started on Generate SVG keeps going after a tab switch (the closure holds `ctx`; `abort` is
called only from `cancelRun`, `actions.ts:218`, never on unmount), but its `dispatch` and `say` now target an
unmounted reducer: the final summary toast and the row updates go nowhere. Batch behaves alike (`processItems`
keeps looping; `useBatch` has no abort on unmount). This is by construction — no test exercises a mid-run tab
switch today. A log in component state would lose precisely the stages the user most wants after switching away.

## 6. Status surfaces are not records

Four independent toast implementations auto-clear in 3.2–4.2 s: `App.tsx` (3 200 ms), `useBatch` (4 000),
`useSelection` (4 000) and `svg/ctx.ts` `useSay` (4 200); `selection/copypath.ts` only calls a `say` it is
handed. Six more writes bypass `say` (batch 122/134/215/272, selection 229/235). Occurrences of `say(`: App 11,
svg/actions 9, useBatch 5, svg/scan 4, keyactions 4, reviewact 3, codeactions 3, useSelection 3, copypath 2,
ctx 1, BatchPanel 1. Hooking `say` alone would miss the direct writes — the design logs at both.

## 7. Limits the design must respect (gate lines = `split("\n").length`, wall = 300)

| File | Gate lines | Headroom | Note |
|---|---:|---:|---|
| `src/svg/runner.ts` | 298 | 2 | extract `sendBatch` before anything else |
| `src/batch/useBatch.ts` | 300 | 0 | not in the baseline: one more line fails the gate — extract presets first |
| `src/selection/useSelection.ts` | 289 | 11 | taps fit (≈ +4) |
| `src/svg/actions.ts` | 272 | 28 | fits; `confirmRun` is 23 LOC / CC 6 — split run lifecycle before adding log lines |
| `src/svg/SvgDialogs.tsx` | 269 | 31 | the confirm dialog moves out |
| `src/lib/svgrequest.ts` | 246 | 54 | `classifyHttp` sits at CC 10 — not touched |
| `src/state/HistoryProvider.tsx` | 138 | 162 | `onKey` is CC 10; taps go in `record`/`run` (CC 1) |
| `src/App.tsx` | 581 (baseline 607) | legacy | RULE 16.5: no growth; shrink via the `useToast` extraction |

Also: `tools/quality.mjs` fails any *non-baselined* file over 300 lines, so over-wall files cannot hide.
`writeKey` swallows quota errors with an empty catch (`state/safestorage.ts`), so a log writer cannot learn
that a write failed without a small signature change. Layers today: `.svg-backdrop` z-index 20,
`.svg-toast` / `.svg-busy` 30 (bottom 54 px), `HistoryPanel` 40, Tailwind toasts and busy overlays 50
(`bottom-6`). Panels use `min-height: 100vh`, not fixed heights, so a fixed dock plus a bottom spacer fits.

## 8. Patterns reused (nothing is invented where a pattern exists)

* Store above the tabs: `state/appstore.ts` + `useAppState` (`useSyncExternalStore`).
* Versioned payload with per-entry guard and cap: `lib/history.ts` (`HISTORY_VERSION`, `isEntry`, `MAX_HISTORY`).
* Thin IO over pure parse/serialize: `state/historystore.ts`, `selectionv2/prefsstore.ts`.
* Secret handling: `lib/svgsecret.ts` (`redact`, `KEY_SHAPE`); `tests/secret_hygiene.test.ts`.
* Hashing: `lib/pairing.ts` `fnv1a32`; usage/cost wording: `lib/svgusage.ts` (`costLabel`, `fmtTokens`).
* Test harness: `FakeDir`/`FakeFile`, `vi.stubGlobal("fetch")`, canvas shims (`tests/svg_cost_io.test.ts`),
  `mountHistory`, the real `Workbench` (`tests/workbench_ui.test.tsx`).

## 9. Adjacent findings (recorded, not fixed here)

* `UI_SELECTORS.md` said `svg-generate-selected` "arms first (`Confirm generate`)"; the code opens the
  confirm dialog directly (`SvgBulkBar.tsx:80`, `SvgPanel.tsx:75`, `tests/svg_ui.test.tsx:238`). Corrected in
  the same change as this design.
* The sidecar stores the raw rules, not the composed text, and `requestId` is always `null`.
* `useSay` timers are never cleared, so an older toast's timer can clear a newer toast early.
* Test coverage the extractions would lean on is thinner than it looks: both `runGeneration` tests use
  `retries: 0` (the retry loop is untested); the dialog is opened in one test, for its sampling text, while the test
  titled "confirms before sending and never sends twice" (`svg_ui.test.tsx:209`) checks only the no-key guard; no test
  imports `useBatch`, `BatchPanel` or exercises `App`'s toast. `test-plan.md` §2 writes characterisation tests first.
