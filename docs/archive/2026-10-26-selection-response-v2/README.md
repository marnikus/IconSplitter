# Selection response v2 — architecture review and redesign plan

**Status:** plan only. No production code has been changed for this document.
**Date:** 2026-10-26
**Branch / base:** `arena/0216b05e-iconsplitter`, HEAD `c30ec49`.
**Scope:** the four checkable lists — Batch folders, Selection V2, Generate SVG,
SVG to upload. Sheets has no checkable image list and is out of scope.
**Target:** make a row click, an Up/Down move and a single checkbox toggle feel
immediate at 1,000+ rows, and at least **80% faster** than today on the same
before/after workload. The checkbox path is researched separately below because
it has an additional cost chain.

This document records the *before* state. It deliberately contains no
implementation changes. Step 0 of the plan recreates the measurement harness in
the repository with deterministic budget tests; the probes quoted here were
temporary and are not committed.

---

## 1. Problem

Reported behaviour:

- Clicking a row, or moving the active row with Up/Down, freezes for a noticeable
  time once a list grows past roughly 100 items.
- The freeze is felt in **all tabs**, not only the tab being operated.
- Checking a checkbox is also slow, especially after several rows are checked.
- Behaviour is expected to stay smooth at 1,000+ items.

The previous large-list work (`docs/archive/2026-10-26-selection-response/`)
did make the isolated list components much faster. Its production measurements
show 3.3–5.5 ms commits for a 1,000-row select-all, yet the reported interaction
still freezes. The conclusion is not that those measurements were false — they
were **scoped to the wrong workload**. They measured a list component with a
local `useState` selection and no store, history, persistence or other mounted
tabs. The remaining latency lives in exactly those layers.

---

## 2. What was measured

Temporary probes imported the real history, filter, sort, selection and list
components. They were deleted after the run. Environment:

- Node `22.22.3`, Vitest `5.0.3`, happy-dom for component renders.
- Real `src/lib/history.ts`, `src/lib/reviewfilter.ts`, `src/lib/reviewsort.ts`,
  `src/lib/reviewselect.ts`, `src/lib/reviewbulk.ts`, real `ReviewList`.
- 100 / 1,000 / 5,000 rows, representative long Windows paths.
- Medians and p90 after filling the 100-entry history timeline; one warm-up.
- **Not measured here:** browser paint, localStorage `setItem`, CPU throttling.
  These probes identify deterministic causes and relative size; Step 0 must
  reproduce the end-to-end input-to-paint result in Chromium.

### 2.1 History record + timeline serialization (real code, no localStorage)

One gesture records one history entry, then the current provider serializes the
**whole timeline** for persistence. A 1,000-row checked selection is copied into
the entry more than once (see RC3).

| Scenario | Rows | Timeline after 100 entries | Median per gesture | p90 |
|---|---:|---:|---:|---:|
| Batch arrow (full checked arrays) | 100 | 1.56 MB | 1.68 ms | 2.18 ms |
| Batch arrow | 1,000 | 15.42 MB | 17.83 ms | 24.55 ms |
| Batch arrow | 5,000 | 77.82 MB | 139.04 ms | 224.59 ms |
| Checkbox toggle (`push`, full checked arrays) | 100 | 1.54 MB | 1.42 ms | 2.14 ms |
| Checkbox toggle | 1,000 | 15.40 MB | 18.58 ms | 24.94 ms |
| Checkbox toggle | 5,000 | 77.80 MB | 142.72 ms | 223.08 ms |
| V2 arrow after a checked history (`view` entry) | 100 | 0.63 MB | 1.37 ms | 1.88 ms |
| V2 arrow after a checked history | 1,000 | 6.18 MB | 15.84 ms | 21.21 ms |
| V2 arrow after a checked history | 5,000 | 31.14 MB | 127.46 ms | 152.29 ms |

This is only `push` + `serializeTimeline`. `HistoryProvider` additionally calls
`saveHistory` synchronously, which builds a second copy of the same string and
writes it to localStorage on every gesture. At 15–78 MB, the second copy and the
storage write are not optional costs: most browsers will also reject the write
at their localStorage quota, after the string has already been built.

### 2.2 What one entry costs today

A 1,000-row V2 checkbox gesture stores the new selection three times: the entry's
`ids`, `before.ids` and `after.ids`:

| Rows | One full V2 checked entry | Index delta of the same gesture |
|---:|---:|---:|
| 100 | 22.8 KB | ~0.5 KB (verbose JSON; compact can be smaller) |
| 1,000 | 230.7 KB | ~0.5 KB |
| 5,000 | 1.17 MB | ~0.5 KB |

Dozens of such entries fill the 100-entry timeline. This is the main
reason a checkbox is slow: the cost is not the checkbox DOM, it is recording a
whole selection snapshot and synchronously persisting the whole timeline.

### 2.3 List component alone (happy-dom, stable rows)

Real `ReviewList`, 1,000 rows, stable row objects, all rows checked:

| Rows | Same-props rerender | Active row move | One checkbox toggle |
|---:|---:|---:|---:|
| 100 | 1.17 ms | 1.36 ms | 1.52 ms |
| 500 | 4.07 ms | 2.75 ms | 4.35 ms |
| 1,000 | 8.57 ms | 5.55 ms | 8.68 ms |

At 1,000 rows the list alone is not a freeze, but it is not free either: every
panel render maps all rows and recreates all row elements. At 100 rows every
JavaScript layer measured here is only a few milliseconds, which does **not**
account for a 100-row freeze on its own. Two things follow: the real 100-row
symptom must be reproduced in a browser with real fixtures (row images, preview
trees, active-row detail, CPU throttling), and the synthetic probes below are
evidence for the *1,000+ row* mechanism, not a complete explanation of every
reported freeze. Step 0 of the plan exists precisely to close that gap.

### 2.4 Store and history broadcast

A tiny probe mounted ordinary `useAppState()` consumers plus two `useHistory()`
consumers, then issued unrelated store patches and one history push:

| Action | Whole-store consumers rerendered | History consumers rerendered |
|---|---|---|
| `patchV2({checked})` | **all 4** (Shell, V2, SVG, Upload probes) | 0 |
| `patchUpload({checked})` | **all 4** | 0 |
| one history `push` | 0 | **both** |

This is the structural cause of “it freezes in every tab”. Every mounted panel
subscribes to the whole store, and every panel's hook subscribes to the whole
history API just to call `push`. A selection change in one tab renders the list
parents of the other three hidden tabs as well.

### 2.5 Derived work per panel render

- SVG `decidableCount` is `affected.filter(id => rows.find(...))` — O(affected ×
  rows) on **every** render: 0.23 ms at 100, **6.46 ms at 1,000**, **130.89 ms
  at 5,000** in the probe.
- The same panel runs several additional full scans per render (`countsOf` 4×,
  `ListHead` 2×, banners, status footer).
- Upload's pinned bulk bar runs `idsNeedingMetadata`, `idsWithMetadata`,
  `idsAwaitingAcceptance`, `downloadPlanOf` and `resettableIds` on every render.
- Batch's list header runs 3 full filters per render; `ScanTable` also rebuilds
  the checked list and calls `rowStale` once per row; `useBatchView`'s memo is
  invalidated because `useBatchSelection` returns a fresh `sel` object each
  render.
- V2 runs `bulkScope` and `checkState` on every render, including arrow moves.
- Linear filter + sort is not the problem: 0.31 ms at 100 and 4.97 ms at 5,000.
  `bulkScope` is 0.21 ms at 100, 0.42 ms at 1,000 and 3.09 ms at 5,000;
  `checkState` is 0.04 ms at 100 and 0.83 ms at 5,000. The problem is doing many
  scans, one quadratic scan, and doing them several times per gesture.

---

## 3. Root causes

### RC1 — One global snapshot, whole-state subscriptions

`src/state/appstore.ts` replaces the whole `AppState` object on every patch.
`src/state/useAppState.ts` returns that whole object. These production call
sites subscribe to it even when they need one slice:

- `src/ui/Workbench.tsx:38` — Shell only reads `tab`, but rerenders on every patch.
- `src/selectionv2/useSelectionV2.ts:64`
- `src/batch/useBatchSelection.ts:205`
- `src/svg/ctx.ts:32`
- `src/upload/useUpload.ts:53`
- `src/ui/useSheetsEdit.ts:20`

`Workbench` keeps Batch, Generate SVG and SVG to upload mounted while hidden
(`src/ui/Workbench.tsx:83-101`). Therefore a checkbox in V2 rerenders all three
hidden list panels, their headers, bulk bars, status bars and list element maps.
The active tab pays for its own work; the user also pays for three other tabs.

### RC2 — History is a broadcast and a synchronous write

`src/state/HistoryProvider.tsx:60-65` builds one context value containing both
actions and timeline state. `useTimeline` returns a fresh store object each
render, so `api` is a new object on every timeline change. Every panel calls
`useHistory()` only to push, but rerenders on every entry, including entries
created in another tab.

`src/state/HistoryProvider.tsx:84-86` calls `saveHistory(next)` inside the commit
path. `src/state/historystore.ts:14-16` then serializes and writes the entire
timeline synchronously. This happens on every gesture, including a coalesced
arrow burst. `src/lib/history.ts:66-80` also JSON-stringifies the previous and
new entry for duplicate detection when `pushCoalesced` falls back to
`pushEntry`.

Consequence: one gesture can make every whole-store subscriber eligible to
render (RC1), then make every history consumer eligible to render again, and
then block the main thread serializing/writing megabytes of timeline.

### RC3 — History stores whole selection arrays per gesture

Every checkable path stores absolute `checked` arrays in the entry, and most
paths do it twice (`before` and `after`). What each gesture records:

| Tab | Plain row click / Up-Down | Checkbox | Header / Select visible / Deselect all |
|---|---|---|---|
| V2 | click: `checked` entry with **both full arrays** even though only active/anchor changed, `src/selectionv2/useSelectionV2.ts:109-121`; Up/Down: coalesced `view` entry with filter/sort/zoom/selectedId, tiny payload (`src/selection/useSelection.ts:134-138`) but still a full timeline write | `checked` entry, both full arrays | `checked` entry, both full arrays |
| Batch | click and Up/Down: `batchChecked` with both full arrays, `src/batch/useBatchSelection.ts:66-82`; `useMoveActive` (line 150) uses `push`, and `ids: [nxt]` differs per key, so nothing coalesces | both full arrays | both full arrays |
| SVG | `svgChecked` with both full arrays; arrow `setActive` uses `hist.push`, never `pushGesture` (`src/svg/actions.ts:244-252`) | both full arrays | both full arrays |
| Upload | `uploadChecked` with both full arrays; arrow `setActive` uses `hist.push` (`src/upload/uiactions.ts:24-32`, `82-86`) | both full arrays | both full arrays |

Three consequences follow directly from the code:

1. A plain click that changes **only active/anchor** (RULE 25: checks stay
   unchanged) still stores the whole checked selection in both `before` and
   `after` (three copies once serialized).
2. An arrow key in Batch/SVG/Upload does the same, once per key press. A held
   arrow key therefore creates a full 1,000-row entry every repeat.
3. A single checkbox toggle at 1,000 rows stores three copies of the selection
   (~230 KB; 2.2), and the current provider then serializes the entire timeline
   around it (2.1) and writes it synchronously.

Batch is the worst initial case because a completed scan checks every eligible
row (`src/batch/batchOps.ts:30-41`). After a scan, every arrow key starts from a
full checked set. In V2, a Select visible/select-all gesture creates a large
entry, and every later arrow serializes a timeline containing that entry even
though the arrow entry itself is small (2.1, “V2 arrow after a checked history”).

**Batch id nuance:** Batch stores `relPath` ids and compares them
case-insensitively in scans and the mirror sync (`src/lib/batchselect.ts:14-16`,
`useBatchSelection.ts:36-48`), while `toggleChecked`/`sameRowSelection` compare
case-sensitively. Delta entries must keep the exact stored casing for undo and
use the same case-insensitive key only where the current code does.

### RC4 — Many full scans and a quadratic scan per panel render

Because RC1/RC2 cause more renders, this work is multiplied:

- `src/svg/SvgPanel.tsx:150-152` — O(selected × rows) `decidableCount`.
- `src/svg/SvgPanel.tsx:139-147` — 4 full scans for counts on every render.
- `src/svg/SvgList.tsx:38-41` — 2 full scans for the list head.
- `src/svg/SvgPanel.tsx:102` — `idsWithGeneratedSvg` rebuilds a Set on every render.
- `src/upload/UploadPanel.tsx:93-97` — 5 full scans / Set builds for the bulk bar.
- `src/upload/UploadList.tsx:37-39` and banners — more scans.
- `src/batch/ScanTable.tsx:41-44` — 3 filters per list render; `:230` rebuilds the
  checked array from rows; `:238` calls `rowStale` per row.
- `src/batch/useBatchView.ts:55-61` — `sel` is new on every render, so `makeView`
  and all derived props are new on every render.
- `src/selectionv2/useSelectionV2.ts:67-73` — scope and header on every render.
- `src/selection/StatusFooter.tsx` — `counters(s.pairs)` on every footer render.

At 1,000 rows the SVG quadratic scan alone is ~6.5 ms per render; at 5,000 it is
~131 ms. Doing that in a hidden tab on someone else's selection is pure waste.

### RC5 — More than one store notification per gesture

V2's `editSelection` calls `patchV2(...)` and then `patchView(...)` as separate
store writes, and a plain click writes `v2` even when the checked array is
unchanged. The same gesture then pushes history and logs. React may batch some
of these inside one event handler, but each external-store notification still
makes every whole-store subscriber eligible to render; outside an event handler
they are separate commits. A single atomic selection patch (checked + active +
anchor) removes redundant notifications and the unnecessary `v2` update.

### RC6 — Row presentation still recreates the list on every render

Rows are memoized, but the list parent recreates all row elements on every
render (`ReviewList`, `SvgList`, `UploadList`, `ScanTable`). `active` is a row
prop, so an arrow move recreates all 1,000 elements; a checkbox toggle also
recreates all elements even though row content does not rerender. The checked
projection in `src/ui/checkedrows.ts:25-28` walks every registered binding on
every checked-array identity change. `useCheckedRow` registers again on every
row render (effect without deps). The list-alone numbers (2.3) show this is not
the main 100-row cause, but it is the remaining 1,000-row floor and is easy to
remove without virtualization.

### RC7 — Secondary per-gesture work

- Every history push writes a log entry; `LogDock`/`LogList` rerender up to 200
  rows (`src/log/LogList.tsx`, `src/log/LogRow.tsx`).
- `useSessionAutosave` serializes the session after every settle; it is debounced
  but still runs on the main thread after each gesture burst.
- `useSelection` recreates its `ctx` object every render, so callbacks and the
  decision-applier effect are rebound unnecessarily.
- V2's hotkey effect depends on the whole API object and re-registers a window
  listener on every render.

### RC8 — The previous benchmark bypassed all of the above

`tools/perf/selection-response.tsx:28-49`:

- keeps `checked` in a local `useState`;
- mounts a list component directly, not `Workbench`;
- never mounts `HistoryProvider`, `useAppState`, `useSessionAutosave` or the
  other three hidden panels;
- only measures Select all / Deselect all, never a row click, Up/Down or a single
  checkbox;
- uses no real history payload or persistence.

Its result (3–5 ms list commit at 1,000 rows) is believable for what it measured
and is retained as a useful regression. It simply cannot see RC1–RC3, which are
end-to-end interaction costs. The new benchmark described in Step 0 must include
the full shell and the real action path.

---

## 4. Target design

```
 app store (separate slices)
   ├─ useAppSlice("v2" | "batch" | "svg" | "upload" | "view" | "tab")
   └─ one atomic selection patch per gesture
                 │
                 ├─ active tab panel
                 └─ hidden panels: no render/no scans on another tab's gesture

 selection action
   ├─ compact, ordered delta entry ──► in-memory timeline (exact undo)
   └─ deferred, bounded persistence ──► localStorage (flush on pagehide)

 history actions context (stable) ──► all panels
 history view context (entries)   ──► HistoryBar / HistoryPanel only

 list
   ├─ memoized row element array (rows + presentation only)
   ├─ checked projection registry (DOM properties/classes)
   └─ active projection registry (class, tabIndex, aria-current, scroll)

 panel
   └─ one memoized summary per rows/checked/visible snapshot
        (visible, header, counts, affected/decidable, banner/status counts,
         bulk-action eligibility, upload download plan)
```

### Decisions

**D1 — Slice selectors, not whole-state subscriptions.**
Add a small selector hook over `useSyncExternalStore`; migrate Shell, V2, Batch,
SVG, Upload and Sheets to the slice they actually read. `setAppState` already
clones only the top level and replaces only the patched slice, so returning a
whole slice reference from the selector is stable under unrelated patches and
needs no extra equality helper or dependency. Keep `useAppState()` for tests and
rare multi-slice consumers. The store remains the single source of truth; no
per-panel copies.

**D2 — Split history actions from history view.**
A stable actions context (`push`, `pushGesture`, `undo`, `redo`) is consumed by
panels. A separate view context (`entries`, `index`, labels, error) is consumed
only by the history bar/panel. Pushing an entry must not rerender a panel that
only pushes. Keep the existing combined `useHistory()` for tests or migrate the
probes to the view hook; no production panel should consume the combined value.

**D3 — Compact, ordered selection deltas.**
Record only what changed, and preserve pick order. A selection delta is an
ordered list of index-aware operations: removals by id and original index, and
insertions by id and destination index. Forward apply removes then inserts;
inverse apply removes the inserted ids then reinserts the removed ids at their
original indices. This restores the exact array order, which matters because
selection order is the request order (RULE 10). A plain click/an arrow that keeps
the checks unchanged stores only active/anchor. A checkbox toggle stores one
insert/remove. A select-visible/range stores only the ids it actually added or
removed.

Keep the existing entry type names (`checked`, `batchChecked`, `svgChecked`,
`uploadChecked`, `view`) with a discriminated payload so old absolute entries
remain readable. A delta needs a base, so the timeline also persists **one
selection projection per slice** at its current cursor (four id arrays, not one
per entry). Undo/redo applies the entry's ops to that projection, patches the
store with the result, then stores the new projection; it never reads the
session file to reconstruct a selection. This reproduces today's absolute-undo
semantics: when the cursor sits on an entry, the projection equals that entry's
recorded `after`, so the inverse lands exactly on its recorded `before`.

On load the v2 projection is the **undo base for the persisted cursor**, not a
replacement for the visible selection: the session still restores what is on
screen exactly as today, and the first undo/redo patches the store from the
projection. Non-history selection writes (scan check-all, target pruning, session
restore) do not rewrite the projection, because they are not undoable today
either; the next recorded gesture takes the live selection as its base. A v1
timeline has no projection and keeps today's absolute-entry behavior; the
storage key stays `iconSplitter.history.v1` so old payloads still load, while the
written payload becomes version 2.

Rejected alternatives:

- Naive `{added, removed}` sets: they lose selection order on undo/redo.
- Keeping full arrays but “only for bulk”: still writes hundreds of KB per
  select-all and keeps the persistence path large.
- Storing row indices instead of stable ids: breaks under sort/filter/prune.
- Rebuilding each entry's base from the session file: the session write is
  debounced, so a crash can leave it behind the timeline; undo would be wrong.
- Storing a base snapshot per entry: one full array instead of three is a 3×
  reduction, not the measured 460×/2,334×.

Apply must validate shape, indices and ids (RULE 13); for SVG/Upload, compute the
resulting absolute selection and keep the existing known-target validation
before patching. Malformed or inconsistent entries are refused without moving
the cursor, and the projection is left untouched.

**D4 — Deferred, bounded persistence.**
Persist the latest timeline after a short debounce/idle window, not inside the
gesture. Flush on `pagehide`, provider unmount and tests. In-memory undo remains
exact and immediate. With deltas the 100-entry timeline is tens of KB, so
localStorage remains appropriate; IndexedDB is not needed in this iteration.
Never drop the timeline silently; if storage refuses, keep working in memory and
report it per RULE 13.

**D5 — Project both checked and active state; memoize row element arrays.**
Extend the existing `ui/checkedrows.ts` registry with an active-row projection
(class, `tabIndex`, `aria-current`, `scrollIntoView`). Rows no longer receive
`active` or the checked array as props. Lists memoize their row element array by
`rows + presentation + register`, so a checkbox or arrow change does not
recreate all 1,000 elements. All rows and controls stay mounted; no
virtualization. Preserve current focus/tab order semantics and the existing
scroll behavior.

**D6 — One derived summary per tab, indexed by row id.**
Build an `id → row` map once per rows snapshot (and once per visible list where
needed). Compute counts, header state, affected/decidable counts, banner/status
counts and bulk eligibility in one pass per snapshot, memoized on the actual
input references. Replace all `rows.find` inside a filter with the map or a
precomputed Set. Cache the summary on `(rows, checked, filter, sort)` identities,
not on every render.

**D7 — Stable action/API identities.**
Memoize the objects returned by `useSelectionV2`, `useBatchSelection`/
`useBatchView`, and the hook-created context bags where they change identity
every render. Hotkey effects depend on stable action functions, not the whole
API. `useSelection`'s context refs are hoisted/memoized so effects do not rebind
on every render.

**D8 — Batch's processing mirror is conditional.**
Batch mirrors `checked` into `row.selected`. Today a checkbox can therefore clone
rows, invalidate `visibleRows`, re-sort/filter, and rerender the list a third
time. First keep the mirror and measure; if it is still the Batch checkbox floor,
decouple the mirror from the rendered rows (selection remains in the app store;
the split/preview paths derive their rows from the checked set at run time) with
the existing batch-processing and preview tests as the equivalence gate.

**D9 — Keep logs and autosave off the gesture path.**
Memoize log rows and avoid rerendering all 200 entries for one appended line;
subscribe autosave to the slices it persists and write on idle/debounce. These
are secondary but are always mounted, so they must not add per-gesture work.

---

## 5. Steps

Each step is independently shippable and measured. Steps 1–7 are ordered by
impact and risk, with Step 0 and Step 8 bracketing them; do not start the next
before the current step is green and measured on the same harness.

### Step 0 — Recreate the evidence harness and add red budgets

**Deliverables**

- `tools/perf/shell-response.tsx` (dev-only, outside the production entry) that
  mounts:
  - the real `HistoryProvider` and a shell-like tree with the active list plus
    the three hidden list parents, all driven by the app store (not local
    `useState`);
  - the real list components and the real bulk-bar/status counts for each tab;
  - the real selection action path (replicate the inline builders now; Step 3
    extracts them so harness and production share one builder).
- A Chromium runner following the existing external-browser pattern, plus a
  production build config for before/after.
- Instrumentation marks: input → store patch → React commit → history record →
  serialization → localStorage → next paint. Record p50/p95, long tasks, timeline
  bytes and render counts.
- Workload matrix: 100 / 1,000 / 5,000 rows × four tabs × {arrow up, arrow down,
  plain row click, single checkbox toggle, select-all, deselect-all}.
- Deterministic budget tests for CI (not timing alarms):
  - unrelated store patch does not render the other three panel probes;
  - a history push does not render action-only consumers;
  - a 1,000-row arrow/click/toggle does not record a full checked array;
  - SVG decidable count performs O(N) row reads, not O(N²) (getter counters, as
    in `tests/selection_response.test.tsx`);
  - Upload/Batch summary scans are bounded;
  - one non-bulk gesture writes no more than the byte budget.

**Exit:** baseline recorded for every cell; each new budget test fails for the
expected current reason; methodology and raw numbers written to this folder.

### Step 1 — Store scopes and atomic selection patches

- Add selector hooks (`useAppSlice`/primitive selectors) and a `patchSelection`
  helper that updates a tab's checked + active + anchor in one store write.
- Migrate `Workbench` (tab only), V2, Batch, SVG, Upload and Sheets.
- Make V2's plain click/checkbox apply one atomic patch; never rewrite `v2` when
  only the active row changed.
- Tests: a V2 patch changes only V2 consumers; an upload patch changes only
  upload; a tab change renders Shell/Panels only; all values remain identical;
  StrictMode does not loop.

**Exit:** hidden panels do zero render work on another tab's selection; one
store notification per gesture; existing selection tests green.
**Expected movement:** removes 3 hidden list parents + their derived scans from
every gesture; largest single win at 100–1,000 rows.

### Step 2 — Split history actions from history view; stop no-op entries

- Add stable actions context and separate view context; migrate all panels to
  actions; keep `HistoryBar`/`HistoryPanel` on the view.
- Suppress an entry when the checks are unchanged and only active/anchor moved;
  emit an active-only entry instead of a full checked record.
- Convert SVG/Upload active moves to `pushGesture` with a stable gesture key so
  an arrow burst is one entry; Batch arrow likewise once its payload is compact.
- Tests: push does not render action-only consumers; History bar still updates
  immediately; one gesture = one entry; undo across tabs; no-op gestures add no
  entry; burst = one entry.

**Exit:** no history-driven rerender of panels; existing history/undo suites
green.
**Expected movement:** removes the second broadcast from every gesture.

### Step 3 — Compact ordered delta history and deferred persistence

- Add a pure selection-delta module (`lib/selectiondelta` or extend
  `lib/reviewselect`): build, apply, invert, validate; exhaustive unit tests for
  order, hidden checks, ranges, toggles, deselect-all, duplicates, pruning and
  malformed payloads.
- Use it in all four tabs. Keep absolute payloads readable (legacy v1); write a
  compact payload; keep entry `ids` as the changed ids where possible.
- Update `apply.ts` to apply both payload shapes. For SVG/Upload build the
  resulting selection and retain `selectionTargetsKnown`; a refused apply leaves
  the cursor unchanged.
- Replace `shape()`'s full JSON comparison with a cheap signature or compare the
  compact payload.
- Defer `saveHistory`; flush on pagehide/unmount; validation on read unchanged.
- Tests: mixed old/new timelines; undo/redo order exact; cross-tab undo; hidden
  checks; prune; session restore; undo after a scan still lands on the entry's
  recorded `before`; reload mid-history then undo/redo; the projection never
  becomes a second selection writer; one write per burst; pagehide flush;
  localStorage failure tolerated; bytes budget.

**Exit:** non-bulk gesture payload ≤ 2 KB; 100-entry timeline plus the current
projections ≤ 512 KB at 1,000 rows and ≤ 2 MB at 5,000 rows; no synchronous
multi-MB persistence per gesture.
**Expected movement:** removes ~230 B per checked row per gesture from each
entry (≈230 KB at 1,000 rows); checkbox serialization drops by >99% in the probe.

### Step 4 — Row element memoization and active projection

- Extend the list projection registry with active state; remove `active` from
  row memo props.
- Memoize the row element array in V2, Batch, SVG and Upload lists; ensure
  filtering/sorting/data changes still invalidate it.
- Add a same-ids guard so a new array with identical contents does not project.
- Register rows with a dependency-stable effect; keep the active-row scroll.
- Apply V2 first, then the other three; keep all rows mounted.
- Tests: 1,000-row arrow changes only old/new DOM; checkbox changes only changed
  bindings; all row content functions are not called; `aria-current`,
  `tabIndex`, scroll, filter/remount and restoration still pass; no virtualization.

**Exit:** selection/arrow changes create zero new row elements; list parent
element work is O(1) for active/checked changes; 1,000-row list floor removed
from the selection path.

### Step 5 — Derived summaries and stable APIs

- Introduce per-tab summary functions returning primitives and the visible rows;
  memoize by `(rows, checked, filter, sort)` and share across header, bulk bar,
  banners, footer and list head.
- Replace SVG's quadratic decidable count with a precomputed generated set/map.
- Replace Upload's 5 scans with one pass over the checked ids using the row map.
- Make Batch header one pass; memoize `sel`/`v` and the stable action bag.
- Memoize V2's scope/header and stable API; hoist `useSelection` refs; make hotkey
  effects depend on stable actions.
- Tests: getter-count budgets (≤ cN, no N²); summaries match old values across
  filters/sorts/statuses; no stale counts after data changes.

**Exit:** one summary pass per panel render; hidden/active panel render does not
repeat full scans; O(N) budgets green.

### Step 6 — Batch mirror (conditional)

Only if Step 5 measurements show Batch's checkbox still costs a row clone +
sort/filter per toggle:

- Decouple `row.selected` from rendered rows; keep selection in the app store
  and derive the processing/preview selection at run time.
- Or keep the mirror but split data/selection revisions so a selection-only
  change does not re-sort the visible list.
- Tests: split-approved selection, preview-selected, batch counters, mirror
  pruning and restart behavior unchanged.

**Exit:** Batch checkbox p95 target met; no behavioral change to split/preview.

### Step 7 — Log, autosave and hotkey polish

- Memoize log rows and avoid rerendering all entries on append.
- Subscribe session autosave to relevant slices; write on idle/debounce.
- Remove per-render window-listener re-registration.
- Tests: log render budget, autosave write count, listener count unchanged.

### Step 8 — Final measurement, docs, verification

- Rerun the identical harness before/after at all sizes and both prod/dev modes;
  report medians and p95 per tab/scenario, long tasks, timeline bytes, render
  counts; include unsuccessful iterations rather than hiding them.
- Iterate on the remaining measured floor until the 80% target is met for
  click/arrow/toggle at 1,000 and 5,000, or report honestly which cell cannot
  meet it and why.
- Update `docs/current/sor/selection-performance.md` (measurement scope, new
  contracts), the task router if a page moves, and append the measured ledger
  entry as required by RULE 17.
- Run focused suites, `npx tsc --noEmit`, `npm run lint`,
  `npm run quality:changed`, `npm run verify:fast`, `npm run verify`.
- Commit scoped changes and push this branch only.

---

## 6. Acceptance criteria

**Behaviour (must not change)**

- Every RULE 25 gesture in all four tabs, including modifier keys, Q/E, header
  tri-state, hidden checks surviving filters/sorts, active vs checked separation
  and one undo entry per changed gesture.
- Undo/redo restores exact checked ids **in order**, active row and anchor,
  including mixed old/new history, cross-tab undo, pruning and a refused apply.
- All rows/controls remain mounted; no hidden rows, no virtualization, no
  DOM-only selection truth.
- No extra file reads, SVG parses, preview builds, provider calls or disk writes
  on selection; confirmation/eligibility gates unchanged.
- Accessibility: row `aria-current`, `tabIndex`, checkbox state and scroll
  behavior unchanged; keyboard focus rules unchanged.

**Performance (measured on the same harness/runtime)**

- ≥ 80% reduction in p50 **and** p95 input-to-committed-DOM for arrow, plain row
  click and single checkbox toggle at 1,000 and 5,000 rows, per affected tab.
- ≥ 80% reduction for select-all/deselect-all where the baseline is above the
  frame floor; at 100 rows, report absolute values and allow “no regression”
  instead of claiming a percentage floor.
- Single checkbox toggle at 1,000 rows targets one frame (p95 ≤ 16 ms) in the
  production build; arrow/click target ≤ 16 ms as well. At 5,000, the measured
  floor is reported honestly; select-all remains inherently one DOM write per
  row.
- Work budgets: hidden panel renders 0; active list parent render ≤ 1 per
  gesture; row content renders 0; non-bulk history entry ≤ 2 KB; 100-entry
  timeline plus the current projections ≤ 512 KB at 1,000 rows and ≤ 2 MB at
  5,000 rows; no O(N²) scan in a render.
- Persistence: one deferred write per burst per store, flush on pagehide/unmount;
  reload restores; corrupt payload ignored safely.

**Gates**

- Deterministic budget tests green, no weakened timing alarms or coverage
  thresholds.
- All focused selection/history/preview suites green; fast and full verification
  passed; docs routed and ledger appended.

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Delta undo restores the wrong selection order or loses ids | High — violates RULE 10/12 | Index-aware ops; one persisted projection as the undo base; exhaustive pure tests (toggle/range/select-all/deselect, duplicates, hidden checks, prune, mixed legacy); real panel undo integration tests; dual reader; keep the cursor unchanged on refusal |
| Undo base drifts from the screen after reload/scan | High — wrong restore | The projection is captured per cursor and never rewritten by non-history writes; tests for undo after a scan, reload mid-history and session/projection disagreement |
| Selector hooks loop or tear | High — blank app | Return slice objects/primitives, never new objects per call; StrictMode tests; one selector per slice; no selector that allocates |
| Active projection breaks a11y/focus/scroll | Medium | Preserve `aria-current`, `tabIndex`, scroll; DOM-level tests at 1,000 rows; screen-reader attributes asserted |
| Row memoization goes stale | Medium | Keep `useRowPresentation` function bridging and full data comparison; tests for source/status/settings/zoom/background/version invalidation |
| Deferred persistence loses the last action | Medium | In-memory timeline remains authoritative; flush on pagehide and unmount; test burst + reload; log storage refusal |
| Batch mirror decoupling changes split/preview semantics | Medium | Conditional step; run/preview equivalence tests first; keep mirror if not needed |
| 5,000-row select-all still misses a frame | Medium | Report honestly; one-pass projection; windowing would be a separate contract change, not smuggled into this plan |
| Benchmark noise/machine differences | Medium | Same browser/build/workload, warm-up, medians + p95, CPU throttle, raw JSON retained; no cross-machine claim |

---

## 8. Open questions

1. **History schema:** recommend `HISTORY_VERSION = 2` with a v1 absolute reader
   and v2 delta writer, so a rollback degrades safely. Confirm that discarding
   unknown future payloads (current behavior) is acceptable.
2. **History key:** keep `iconSplitter.history.v1` with a version-2 payload, or
   rename the key and drop old timelines on upgrade? The plan recommends keeping
   it so old history still loads.
3. **Bulk fallback:** is there any gesture where an absolute snapshot is still
   preferable (e.g., diff larger than the current selection)? Recommend always
   delta and measure.
4. **Batch mirror:** decouple now or only if Step 5 shows it is the remaining
   checkbox cost? Recommend measure first.
5. **Target environment:** production build on current Chrome/Edge with 4× CPU
   throttling; is p95 ≤ 16 ms at 1,000 rows the agreed gate? What hardware floor
   should be documented?
6. **V2/Batch stale targets:** should delta apply also validate against remembered
   list targets (currently only SVG/Upload do), or keep existing behavior?
7. **5,000-row select-all:** if one-pass DOM projection remains above the frame
   budget, is a later windowing decision acceptable, or is “all rows mounted”
   absolute for this iteration? This plan assumes absolute.

---

## 9. Non-goals

- No virtualization, hidden rows, unmounted controls or deferred fake selection.
- No DOM-only selection state; React/store arrays remain the truth.
- No change to RULE 25 gestures, eligibility, confirmation or bulk scopes.
- No new dependencies, provider/network calls or artwork changes.
- No change to the session JSON shape or its persisted checked ids; only the
  history payload may gain a versioned delta form (D3).
- No weakening of undo/redo, RULE 12/13, history validation or coverage gates.
- No claim that a list-component benchmark alone represents end-to-end response.

---

## 10. Code reference map

| Concern | Owner |
|---|---|
| Whole store / patches | `src/state/appstore.ts`, `src/state/useAppState.ts` |
| Shell and mounted panels | `src/ui/Workbench.tsx:38`, `:83-101` |
| Whole-state subscribers | `src/svg/ctx.ts:32`, `src/upload/useUpload.ts:53`, `src/batch/useBatchSelection.ts:205`, `src/selectionv2/useSelectionV2.ts:64`, `src/ui/useSheetsEdit.ts:20` |
| History broadcast | `src/state/HistoryProvider.tsx:60-65`, `src/state/historystore.ts:14-16` |
| History payload / dedupe | `src/lib/history.ts:66-80`; V2 `useSelectionV2.ts:109-121`; Batch `useBatchSelection.ts:66-82`, `:150-162`; SVG `actions.ts:244-252`; Upload `uiactions.ts:24-32`, `:82-86` |
| Quadratic SVG count | `src/svg/SvgPanel.tsx:139-152`; `src/svg/SvgList.tsx:38-41` |
| Upload bulk scans | `src/upload/UploadPanel.tsx:93-97` |
| Batch list scans / unstable view | `src/batch/ScanTable.tsx:41-44`, `:230`, `:238`; `src/batch/useBatchView.ts:55-61` |
| Checked projection | `src/ui/checkedrows.ts:14-41` |
| Prior list benchmark | `tools/perf/selection-response.tsx:28-49`; results `docs/archive/2026-10-26-selection-response/results.md` |
| Current performance contract | `docs/current/sor/selection-performance.md` |

---

## 11. Measurement reproduction (research notes)

The temporary probes used the real modules and are reproducible with the
repository toolchain after `npm run setup`:

- History probe: build entries exactly as the four selection paths do; run
  `push`/`pushGesture` followed by `serializeTimeline` for 110 gestures; discard
  the first 20 samples; report median/p90 and final serialized length.
- Entry-size probe: serialize one V2-shaped entry with `ids`, `before.ids` and
  `after.ids` at 100/1,000/5,000 rows.
- List probe: mount the real `ReviewList` with stable rows and compare same-props,
  active-change and checked-change rerenders at 100/500/1,000 rows.
- Rerender probe: mount four `useAppState()` consumers, a `useHistory()` consumer
  and a history pusher; count renders after each patch.
- Derived probe: use the real `applyFilters`/`sortPairs`/`bulkScope`/`checkState`
  and the SVG `decidableCount` pattern with all rows checked.

The probes measured JavaScript work only. They do **not** include browser paint,
style recalc, localStorage write latency, quota handling or CPU throttling; those
must be measured in Step 0. The deterministic payload sizes (15.4 MB timeline at
1,000 rows) and rerender counts (4/4 consumers on an unrelated patch) are the
durable findings independent of machine speed.

**Earlier benchmark context:** the prior production run reported 1,000-row
select-all commits of 5.50 / 3.30 / 3.75 / 3.75 ms (Batch / V2 / SVG / Upload).
Those numbers remain valid for the isolated list projection. They are not the
end-to-end interaction measured here.

---

## 12. Definition of done

A user with 1,000+ rows can:

1. press Up/Down repeatedly and see the active row move without a visible stall;
2. click a row and see it become active immediately;
3. tick or untick a checkbox and see the checkbox, row highlight and bulk counts
   update in the same frame;
4. switch to any other tab without inheriting a re-render backlog from the
   selection gesture;
5. undo/redo the gesture and get back the exact checked ids in their original
   order, active row and anchor.

The same is demonstrated with measurements on the recorded harness, and the
current docs/rules are honest about the remaining 5,000-row DOM floor.

---

## 13. Implementation status (2026-10-26, second pass)

Implemented in `src/` in the order below; the sections above stay as the design
record.

| Step | Status | Where |
|---|---|---|
| D1 slice selectors | done | `state/useAppState.ts` `useAppSlice`, consumed by Workbench, V2, Batch, SVG, Upload, Sheets |
| D2 history actions/view split | done | `state/HistoryProvider.tsx` `useHistoryActions` / `useHistoryView` (combined `useHistory` kept for tests) |
| D3 compact ordered deltas | done | `lib/selectiondelta.ts` (runs of removed/added ids with positions, inverse apply, id-based fallback, capped `ids` label), used by all four tabs; `state/apply.ts` still reads absolute v1 payloads |
| D4 deferred persistence | done | `state/historystore.ts` `scheduleSaveHistory` / `flushHistory` / read-through `loadHistory`; flushed on `pagehide`, provider unmount and any read; a refusing storage keeps working in memory |
| D5 checked + active projection | done | `ui/checkedrows.ts` owns checked, active class, `aria-current`, roving `tabIndex` and scroll; all four lists memoize the row element array |
| D6 one summary per tab | done | `svg/panelcounts.ts` (one pass, replaces the O(affected × rows) scan), Batch header trio, `useBulkSummary`, memoized `bulkScope`/`checkState` |
| D7 stable identities | done | `useSelection` (actions hook), `useSelectionV2`, `useBatch`, `useBatchView`, `useBatchSelection`, `svg/ctx` (derived + bridge + context), `upload/useUpload` + `useUploadActions`, `SvgHotkeys` reads through a ref |
| D8 conditional Batch mirror | partly | the `row.selected` mirror is KEPT (it feeds split/preview paths and is the equivalence gate), but the visible list is keyed by the fields the filter/sort read, so a checkbox no longer re-filters or re-sorts the folder |
| D9 logs/autosave off the path | done | `log/LogRow` memo, autosave unchanged (debounced, slice-scoped) |

Measured on this machine (Node 22, vitest, 100-gesture timeline of single-row
toggles; serialization is the part that sat inside the click):

| Rows | Old payload | Old serialize | New payload | New serialize | New per-gesture diff |
|---|---|---|---|---|---|
| 100 | 10.7 KB | 3.21 ms | 0.3 KB | 0.31 ms | 0.02 ms |
| 1,000 | 95.1 KB | 31.58 ms | 0.5 KB | 0.35 ms | 0.14 ms |
| 5,000 | 470.1 KB | 165.87 ms | 0.5 KB | 0.39 ms | 0.94 ms |

A 100-gesture timeline at 5,000 rows drops from 46.5 MB to 42.3 KB; a select-all
payload at 5,000 rows is built in 0.61 ms.

Not measured: the input-to-committed-DOM figures in §2/§6 need a headless
Chromium. This sandbox has none, so the browser before/after comparison is still
open; `tools/perf/selection-response.tsx` now records real history entries per
gesture (and exports `historyBytes`) so that re-run measures the new path.
Budget tests in `tests/selection_perf_budgets.test.tsx`, `tests/selectiondelta.test.ts`
and `tests/history_persist.test.tsx` guard the same properties deterministically.
