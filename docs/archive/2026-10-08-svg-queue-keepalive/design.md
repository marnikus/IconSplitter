# Generate SVG — a run that survives the tab, a queue you can jump, a list that stays put (2026-10-08)

Status: DESIGN ONLY — no production code yet. Four user findings, one design.

## 1. The findings, and what the code does today

| # | The user's words | What the code does today (measured) |
|---|---|---|
| F1 | add new status "next attempt", grey | `RowStatus` is `not-generated / generating / generated / failed / unknown`. SoR I-53: "a waiting batch is never a row status" — a row that waits in the queue looks exactly like one that does not. |
| F2 | generating is interrupted by clicking another tab; the queue must continue; a small popup on top says how many done / how many left (and the log) | `Workbench` renders `{tab === "generateSvg" && <SvgPanel/>}`. The WHOLE hook (`useSvgGen`: rows, queue ref, abort ref, progress, root handle) lives in the panel, so a tab click **unmounts it**. The fetch keeps running as a ghost in the detached closure (files still land on disk) but its events go to an unmounted reducer, the waiting queue is orphaned, and re-opening the tab boots a fresh hook with `abort.current === null` — the user can start a second run in parallel. Nothing is visible from another tab. |
| F3 | Regenerate must not cancel the run in flight; it adds this image at the TOP of the queue as a new job; the whole queue keeps running | The row's Regenerate opens the same confirm as bulk and `confirmRun` → `enqueue` **appends**. It never cancels — but it also never jumps the queue, so the retry of a bad result waits behind every batch confirmed before it. |
| F4 | when a new SVG lands the page "shutters" and moves; it should stay at the top of the list, by the header APPROVED SOURCES / SVG OUTPUT | Two causes. (a) The default sort is `date` (newest generated first): every `item-saved` moves that row to the top of the list. (b) The batch strip (contact sheet + a growing per-request outcome list) and the queue section are inserted ABOVE the list when a run starts and grow with it, so the header and the rows move down. |

Interpretation of F2 (A1): "it should be interrupting" is read as *it IS interrupted and must not be* — the sentence that follows ("the queue continue run") only makes sense that way.

## 2. Decisions

* **D1 — Keep the Generate SVG panel mounted once opened; hide it, never unmount it.** `Workbench` gets a `KeepAlive` slot for the SVG tab: first activation mounts it, later tab switches toggle `hidden`. The hook, the rows, the queue ref, the abort ref and the scroll position survive a tab switch; nothing changes in `runcontrol`. Hotkeys take an `active` flag so a hidden panel never answers keys. On RE-activation the panel rescans when nothing is in flight (today it rescans on every mount; a scan during a run would wipe `generating` rows, so it waits for the run to end and rescans then — `reloadSidecars` already refreshes the finished sources).
* **D2 — One floating run popup, on every tab (stays until dismissed — Q3).** `SvgRunPopup` (fixed, under the tab bar, `data-testid="svg-run-popup"`) is rendered by the keep-alive slot, not by the panel, so it is visible while the user works elsewhere. One line: `Generating · 7 done · 13 left · request 2 of 5 · 01:23` + `Open` (switches to the tab) + `Cancel`. It appears when a run starts or a batch is queued, and after the last run ends it stays with its final line (`Done · 20 done · 0 left · 2 failed`) until dismissed or a new run starts — a user on another tab must not miss the end. Counts come from ONE pure function (`runTotals`, §3), the same numbers the bulk bar shows.
* **D3 — "Next attempt" is a derived row flag, not a stored status.** `SvgRow.queued` = this source id is in a waiting queue item. The Generation badge shows **Next attempt** in grey when `queued && !running`; the stored `status` (`failed`, `generated`, …) is untouched, so dropping the queued batch simply shows the old truth again — nothing to restore. The list head gains `N next attempt` beside `N generating`. Filters are unchanged (a queued row still filters by its real generation status). SoR I-53's "never a row status" sentence is rewritten: the queue is still a scheduling fact and still changes nothing on disk; the row now SAYS it is scheduled.
* **D4 — A row's Regenerate goes to the FRONT of the queue as its own job, without a dialog while a run is in flight.** `enqueueFront(queue, item)` joins `enqueue` in `runqueue.ts`. `requestGenerate(ids, placement)`: the row button → `front`; the bulk bar, the `G` hotkey and the recovery banner → `back` (confirm dialog, append — unchanged). A `front` request while something is in flight skips the confirm (the user's answer, Q1): it is enqueued first at once and the toast says `fog_AI.png — next attempt, first in the queue (1 request)`; the cost gate is the queue line + the row's grey badge, both visible before it starts. When nothing is in flight a `front` request behaves exactly as today (confirm, then start). The run in flight is never touched; the front job starts the moment the current request's run ends — the drain loop already takes `queue[0]`. **De-duplication (Q2):** `dropIdFrom(queue, id)` removes that source from every later waiting batch (a batch left empty is dropped), so an image is never generated twice by one queue; the toast adds `· removed from 1 waiting batch`.
* **D5 — The list order is pinned while the user looks at it.** `pinOrder(previous, sorted)` (pure, `lib/svglist.ts`): rows keep the order they had; ids that are new to the list take their sorted position among the newcomers at the end. The pin is refreshed ONLY on a sort change, a filter change, a scan commit and a tab re-activation — never on `item-saved`/`item-failed`. Date sort therefore still puts the newest first when you come back or re-sort, but a landing SVG never reorders the list under the cursor.
* **D6 — Nothing grows above the list during a run.** The run record (batch strip with the contact sheet and the per-request outcomes, and the queue section with its Drop buttons) moves BELOW the list, as one `RunRecord` block. The bulk bar's one-line progress and the popup are the live view; the strip remains the record of what was sent and what it cost (unchanged content, new place). The header and the first rows therefore stay where they are from the first request to the last.
* **D7 — The log says done/left too.** `run-start` gains `images` (the run's image total) and `batch-done` gains `done`/`images`; `runlog` writes `request 2 of 5 done — 7 of 20 image(s) done` and `batch-queued` already names what waits. The popup logs nothing of its own (one event stream, RULE 24).

## 3. Owner files

| File | Change |
|---|---|
| `src/ui/Workbench.tsx` | keep-alive slot for `generateSvg` (`hidden` toggle, mounted once); renders `SvgRunPopup` |
| `src/svg/SvgPanel.tsx` | `active` prop → hotkeys + rescan-on-activate effect; `Body` order: bulk bar, list, `RunRecord` |
| `src/svg/RunRecord.tsx` (new, ~40) | strip + queue section below the list |
| `src/svg/SvgRunPopup.tsx` (new, ~70) | D2, reads `runTotals` |
| `src/svg/runtotals.ts` (new, ~40) | `runTotals(progress, queue): { done, left, failed, images, request, requests }` |
| `src/svg/runqueue.ts` | `enqueueFront`, `dropIdFrom`, `queuedIds(queue): Set<string>` |
| `src/svg/runcontrol.ts` | `enqueueBatch(ctx, ids, placement)` (front + dedupe + log); `regenerateNow(ctx, id)` = the no-dialog path while busy |
| `src/svg/types.ts` | `Dialog.confirm.placement`, `SvgRow.queued`, `RunProgress.images/done` |
| `src/svg/runtypes.ts`, `src/svg/runner.ts`, `src/svg/runlog.ts`, `src/svg/runstate.ts` | D7 counts |
| `src/svg/rowmodel.ts` / `src/svg/ctx.ts` | `withQueued(rows, queue)` in `useDerived` |
| `src/svg/statemodel.ts` | `order: string[]` pin + the four refresh points (D5) |
| `src/lib/svglist.ts` | `pinOrder` |
| `src/svg/actions.ts` | `requestGenerate(ids, placement = "back")` |
| `src/svg/SvgRow.tsx`, `SvgList.tsx`, `SvgConfirm.tsx`, `SvgBulkBar.tsx` | badge, head count, dialog wording |
| `src/index.css` | `.svg-badge.queued` (grey), `.svg-run-popup` |
| docs | SoR (I-53 rewrite, new I-57 keep-alive, I-58 pinned order), UI_SELECTORS, QUALITY_RECHECK entry, README row |

Budget (RULE 16/18): every new function ≤ 20 lines, ≤ 4 params; `actions.ts` (283) and `SvgPanel.tsx` (264) are already at the ceiling — the new pieces go to new files, nothing is added to those two beyond one parameter and one prop.

## 4. Implementation steps (TDD — each step red first, then green, then `npm run verify:fast`)

| # | Red (test) | Green (code) | Finding |
|---|---|---|---|
| 1 | `svg_queue.test.ts`: `enqueueFront` puts the item first and displaces nothing; `dropIdFrom` removes the id from later batches and drops an emptied batch; `queuedIds`; `runTotals` table (mid-request, between requests, with waiting batches, after the end) | `runqueue.ts`, `runtotals.ts` | F3, F2 |
| 2 | `svg_runner.test.ts` + `svg_runlog.test.ts`: `run-start.images`, `batch-done.done/images`; log line "7 of 20 image(s) done" | `runtypes.ts`, `runner.ts`, `runlog.ts`, `runstate.ts` | F2 (log) |
| 3 | `svg_lib.test.ts`: `pinOrder` keeps previous positions, places newcomers, drops gone ids; `svg_ui.test.tsx`: an `item-saved` under date sort does NOT move the row; a sort change does | `svglist.ts`, `statemodel.ts`, `ctx.ts` | F4a |
| 4 | `svg_queue_ui.test.tsx`: a waiting row's badge reads "Next attempt" with class `queued`; dropping the batch restores the previous badge; head shows `N next attempt`; row Regenerate while running → NO dialog, queue line #1 is that source, toast names it, the run in flight is untouched; the same source waiting in a later batch is removed from it; row Regenerate while idle → confirm as today; bulk confirm still appends | `types.ts`, `rowmodel.ts`, `SvgRow.tsx`, `SvgList.tsx`, `actions.ts`, `runcontrol.ts`, CSS | F1, F3 |
| 5 | `svg_ui.test.tsx`: `svg-batch` and `svg-queue` render AFTER `svg-rows` in document order; the header's offset does not change between run start and the first `item-saved` | `RunRecord.tsx`, `SvgPanel.tsx` | F4b |
| 6 | `workbench_ui.test.tsx`: start a run (fake transport), click another tab → panel is `hidden`, not gone; the run's `item-saved` still updates the row; the popup is visible on the other tab with done/left; `Open` returns; back on the tab the run is still `running` and no second run can start; Cancel from the popup cancels; hidden panel ignores `G`; re-activation rescans only when idle | `Workbench.tsx`, `SvgPanel.tsx` (`active`), `SvgRunPopup.tsx`, `SvgHotkeys.ts` | F2 |
| 7 | existing tests that assert the panel is ABSENT on other tabs → assert `hidden`; `svg_strip.test.tsx` placement | — | — |
| 8 | `npm run verify`; RULE 16/18 recheck (`node tools/quality.mjs --changed`); SoR / UI_SELECTORS / QUALITY_RECHECK / README; commit `feat(svg): …` with `Verified:` | — | — |

## 5. Decisions taken with the user (2026-10-08)

* **A1 — F2 interpretation confirmed:** the run and the queue must survive a tab switch (D1/D2).
* **Q1 — Regenerate while running skips the confirm dialog** and goes straight to the front of the queue (folded into D4). While idle it confirms as today.
* **Q2 — De-duplicate:** a regenerated source is removed from every later waiting batch (`dropIdFrom`, folded into D4).
* **Q3 — The popup keeps its final line until dismissed** (D2).
