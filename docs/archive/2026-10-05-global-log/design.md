# Design — the global activity log (ported) and the dock that must not block the UI

Date: 2026-10-05 · Status: implemented · Source of the feature:
`arena/01a10c14-iconsplitter@aaedf2e` ("verbatim prompt preview + global activity
log"), ported onto `arena/01a0f966-iconsplitter`.

Prompt under work (verbatim intent):

* add the **log feature** from `arena/01a10c14-iconsplitter` to the current
  branch;
* that branch "has some bugs blocking UI selecting checkboxes" — add it
  carefully and **resolve those problems**;
* resolve, verify, push; TDD; `../docs/current/` rules, RULE 16 + RULE 18 at
  the end.

## 1. The bug, reproduced in a real browser (not inferred)

The dock in `aaedf2e` is `position: fixed; inset-inline: 0; bottom: 0; z-30` with
a 36 px head plus a 200 px body, and a 236 px spacer as the last child of the
shell. Every tab's list is an *inner* scroller whose height is derived from
`100vh` (`.v2 { min-height: calc(100vh - 3rem) }`, `.svg-*` the same), so the
dock paints **over** the bottom band of that list and takes the clicks.

Probe: chrome-headless-shell (`@sparticuz/chromium`, no download) + Playwright,
1440×900, the app served by Vite, `window.showDirectoryPicker` replaced by an
in-memory File System Access fake (14 approved pairs, a real decision file).
Measured against `arena/01a10c14-iconsplitter`:

| Tab | Checkboxes painted in the visible region but intercepted | The dock element that took the click | A human click at such a checkbox |
|---|---|---|---|
| Selection V2 | **2** (`v2-check-pair_f7fe5bd3` at y 713, `v2-check-pair_f6fe5a40` at y 819) | `time` / `log-body` | `false → false` — **not selected** |
| Generate SVG | **2** (`svg-check-pair_7c016a36` at y 701, `svg-check-pair_7b0168a3` at y 807) | `li[log-entry]` / `log-body` | `false → false` — **not selected** |

So "checkboxes cannot be selected" is not a guess: the log dock is what receives
the click. The dock owns the bottom 236 px of the *viewport* at every scroll
position (`.v2`/`.svg` are floored at the viewport: `min-height: calc(100vh -
3rem)`, so their rows run into that band and past it), and the 236 px spacer
after them only adds document height. Reaching a row that is painted under the
dock needs a *window* scroll — the checkbox the user is looking at does nothing
when clicked, which is exactly the report. The same overlay also buried the
app's own fixed feedback (`.svg-toast` at `bottom: 54px`, `.svg-busy`, and the
three Tailwind toasts at `fixed bottom-6`), because the dock paints after them.

## 2. The fix (D-log-1…D-log-3)

**D-log-1 — the dock is a row of the app, not an overlay.** `Workbench` renders
one shell column: the nav, then `<main class="app-main">` holding whichever tab
is active, then `<LogDock />`. CSS:

```css
.app-shell { height: 100vh; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
.app-main  { flex: 1 1 auto; min-height: 0; overflow: auto; }
```

The tab panels stop deriving their height from `100vh` and take the row the
shell gives them:

```css
.v2-shell, .svg-shell { height: 100%; }        /* the band */
.v2, .svg             { min-height: 100%; }    /* floored at it, free to grow */
```

`height: 100%` on the shells makes the band *definite*, so a panel can floor
itself at it; `min-height` (not `height`) on the panels is what makes the scheme
safe: a panel whose chrome alone is taller than the band **grows**, and
`.app-main` — which ends where the dock begins — scrolls instead. The first
attempt used `height: 100%` on the panels too, and the browser probe caught what
that costs: at 1440×900 the Generate SVG tab's control block is 562 px, so its
list row collapsed to a **0 px** scroller and the SVG rows became invisible
(`.svg-rows h=0`, `scrollH=1484`). With `min-height` the same tab reports
`.svg-rows h=1484`, `.app-main` scrolls 2170 px, and the last row's checkbox
selects. Nothing can be painted under the dock at any scroll position, because
the dock's band is no longer part of the scrollable region. (Invariant I-27.)

**D-log-2 — the floating status keeps floating above it.** The dock publishes
its own height once, as `--app-dock-h` on `:root` (`src/log/dockheight.ts`), and
the fixed toasts position themselves from it
(`bottom: calc(var(--app-dock-h, 0px) + 54px)`, `.toast-above-dock` for the
Tailwind ones at 24 px). One writer, one value (RULE 10) — minimize/restore
moves the toasts with the dock instead of hiding them behind it.

**D-log-3 — the feature itself is ported unchanged in substance.** Pure core
(`lib/log.ts`: schema, sanitising/redaction, clamp, ring buffer, format,
validate-on-read), one store (`log/logstore.ts`, debounced persistence, cap,
minimize, flush), the React bridge, the follow-the-tail rule (24 px slack) and
the dock's four controls (cap, Copy all, Clear, minimize). Emitters: tab
switches, history push/undo/apply-failure, the scan, key save/clear (mask only),
SVG actions and the whole `RunEvent` stream through `withRunLog`.

**Not ported (deliberately).** The same commit also carried the verbatim prompt
preview (`lib/svgpayload`, `SvgPromptPreview`) and the reasoning-tier caps
(`lib/effortlimits.effectivePerRequest`, medium = 2 / high = 1). The first is a
different feature; the second is a *reversal* this branch already rejected
(2026-10-05, long-generation: the tier must never shrink the user's batch size).
What the log needs from those files — `effectiveStallMs`, the stall wording — it
takes from the branch's own `lib/effortlimits`.

## 3. What the log records (and what it may never record)

| Kind | Emitter | Level |
|---|---|---|
| tab switch | `Workbench.openTab` | info |
| undoable state change / undo / redo / failed apply | `state/HistoryProvider` | debug · info · error |
| folder picked, scan result, scan warning, scan failure | `svg/actions`, `svg/scan` | info · warn · error |
| key saved / cleared — the **mask** only | `svg/keystore` | info |
| prompt reset, config/sampling changes, review decision, confirm opened, generate confirmed, cancel requested | `svg/actions` | info · warn |
| run stages, requests, retries, item results, tokens, cost | `svg/runbatch` → `RunEvent` → `svg/runlog` | info · warn · error |
| the log's own actions (clear, cap, minimize, copy) | `log/logstore`, `log/LogHead` | info · debug |

Never: an API key (only `maskKey`), an Authorization header, image bytes, a
composite data URL, a full payload. `sanitizeText`/`sanitizeData` are the only
doors in, on write **and** on read, so a tampered stored payload cannot smuggle
one either. Retention: `localStorage["iconSplitter.log.v1"]`, cap 50/100/200/
500/1000 (default 200) governing display and storage, debounced 150 ms and
flushed on pagehide.

Two additions to this branch's own event vocabulary, both so the log can be
honest rather than approximate:

* `RunEvent` gains `request-retry` (`attempt`, `retries`, `failure`, `status`,
  `delayMs`). `runbatch` already retried a *confirmed* failure with backoff; the
  event makes that visible to the log (and to any future strip line) instead of
  logging the retry as a plain failure.
* `BatchOutcome` gains `requestId` (provider id, already kept in the sidecar and
  the in-flight journal) so a finished request's log line can name it.

## 4. Module plan (RULE 18: ideal 150–300 lines, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/lib/log.ts` | **new**: schema, sanitising, clamp, ring buffer, format, payload | ~210 |
| `src/log/logstore.ts` | **new**: the one store + debounced persistence | ~119 |
| `src/log/scroll.ts` / `useAutoScroll.ts` / `useLog.ts` | **new**: follow rule, React binding | 16 / 43 / 10 |
| `src/log/LogDock.tsx` / `LogHead.tsx` / `LogList.tsx` / `LogRow.tsx` | **new**: the docked panel and its controls | 44 / 76 / 29 / 22 |
| `src/log/dockheight.ts` | **new**: the `--app-dock-h` contract (the fix) | ~20 |
| `src/svg/runlog.ts` | **new**: `RunEvent` → `LogSpec`, `withRunLog` | ~130 |
| `src/svg/runplan.ts` | **new**: `planOf` / `perRequestOf` / `guard` moved out of `actions.ts`, so the emitters fit that file's RULE 18 budget | ~32 |
| `src/ui/Workbench.tsx` | shell column: nav → `main` → dock; tab-switch log | +8 |
| `src/index.css` | `.app-shell`, `.app-main`, toast lifts, dock stacking | +25 |
| `src/svg/{actions,scan,keystore}.ts`, `state/HistoryProvider.tsx` | the emitters | small |
| `src/svg/runtypes.ts`, `runbatch.ts`, `lib/svgbatch.ts` | retry event + request id on the outcome | small |

RULE 16 note: `actions.ts` is a *changed* file, so the gate's 300-line ceiling
applies to it. The log calls put `useModelActions` at 31 lines, so
`refreshModelsNow` moved back out (the shape the source branch uses) and the three
pure run-plan helpers moved to `runplan.ts`; `actions.ts` ends at 282 lines with
every function inside 30. `runbatch.ts` ends at 298 — inside the ceiling, which is
why its retry note is a helper and not four lines inside `sendBatch`.

## 5. TDD order (red before green, per cycle)

1. `tests/log_lib.test.ts` — entry shape, redaction, clamping, ring buffer,
   format, corrupt/foreign payload (module absent → red).
2. `tests/log_scroll.test.ts`, `tests/log_store.test.ts` — the tail rule, the
   debounce, the cap, the restart, clear-leaves-one.
3. `tests/log_layout.test.tsx` (**new**) — *the bug's gate*: the dock is a
   sibling **after** the scrolling region, it is not `fixed`, the shell is a
   viewport column, the panels are sized from it, and the toasts are lifted by
   `--app-dock-h`. Written against the unported shell first, so it is a real
   red, not a description of what was just typed.
4. `tests/log_ui.test.tsx` — one dock on every tab, minimize/restore across a
   restart, Copy all == the visible rows, Clear, the cap, follow/pause/resume.
5. `tests/svg_runlog.test.ts` + `tests/log_wiring.test.tsx` — every `RunEvent`
   maps to one entry (no composite bytes), and the real emitters (history, scan,
   key, run sink) reach the store with ids and without secrets.
6. `tests/secret_hygiene.test.ts` — a key written through the real store never
   appears in storage, in a row, or in the copied text.

## 6. Verification

* `npm run verify` (all six lanes) on the committed tree — RULE 16.
* RULE 18 re-check over every touched file (`wc -l` + per-function lengths).
* The browser probe again, on **this** branch, after the fix: the same script
  (`probe-fix.mjs`), same fake FS (14 approved pairs), same viewport — it
  reports `covered=0` on both tabs and a human click that really selects
  (`false → true`). The probe lives outside the repository (it needs a headless
  Chromium the project does not ship); its measurements are recorded here.

| Probe result | `aaedf2e` (buggy) | this branch (fixed) |
|---|---|---|
| Selection V2: intercepted checkboxes | 2 | **0** |
| Selection V2: human click at the list's end | `false → true` (only after a full *window* scroll) | `false → true` |
| Generate SVG: intercepted checkboxes | 2 | **0** |
| Generate SVG: human click at the list's end | `false → true` (only after a full *window* scroll) | `false → true` |
| List geometry, Selection V2 | `.v2-rows` 343…1827, the window scrolls (1272 px) | `.v2-rows` inside `.app-main` (606 px band, 1867 px scroll) |
| List geometry, Generate SVG | `.svg-rows` 649…2133, window scroll | `.svg-rows` 661…2145 inside `.app-main` |
| Dock | `y 663…900` fixed over both | `y 663…900` as the shell's last row |
| Intercepted at the default position | `lib[log-entry]`, `div[log-body]`, `time` | – |

## 7. Rejected alternatives

* **Keep the dock `fixed` and grow the spacer.** The list is an inner scroller
  sized from `100vh`; a spacer cannot resize it. The covered band stays covered
  (measured above).
* **`position: sticky; bottom: 0` on the dock.** Sticky still paints over the
  content it is offset into — the same interception, only harder to reason about.
* **One dock per panel.** A log that dies on a tab switch is not a global log
  (and the feature's whole point is one timeline).
* **A second event source for the log** (logging inside `runbatch` directly).
  The strip and the log would then be able to disagree; `withRunLog` wraps the
  one sink the UI already uses.
* **Port the tier caps / the prompt preview with the log.** A different feature
  and a documented reversal; out of scope for "add the log feature".
* **Hide the dock by default to dodge the blocking.** That treats the symptom:
  a reserved band is the actual fix, and the dock stays open on every tab.

## 8. Invariants

* **I-23** one log instance for the whole app (docked by `Workbench`); features
  write through `log()` only, never to its storage.
* **I-24** an entry never carries a key, header, image byte, data URL or full
  payload; sanitising happens on write and on read.
* **I-25** the stored log is validated and clamped on read (foreign version or
  corrupt JSON → empty, never guessed), keeps at most the configured cap and is
  flushed on pagehide; `clearLog()` leaves exactly one honest entry.
* **I-26** the dock follows new entries only while it is at the bottom (24 px
  slack) and says which state it is in.
* **I-27 (the fix)** the dock occupies a layout row of the app shell; no
  interactive element is ever painted under it, and the app's floating toasts
  are lifted above its current height.
