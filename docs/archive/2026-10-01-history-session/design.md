# Session restore, reset-to-pending and one global undo timeline — design (2026-10-01)

Three features, one architecture: a **shared app-state store above the tabs**,
a **single global history timeline** (RULE 12), and a **session snapshot** that
makes a restart return to the last valid session instead of a blank app.
TDD throughout; RULE 16/18 budget on every new file.

## 1. Reference research — `marnikus/Process-Images-in-Areana`

The URL in the task (`/tree/arena`) returns **404**; the repository exists, its
default branch is `main`, and `gh api` lists ~40 `arena/<id>-…` branches but no
plain `arena`. Researched on `main`. **`license: null`** — the repo carries no
licence, so copying code is not permitted; only the *contracts* are reused here,
re-implemented in TypeScript against this app's rules.

Modules studied and what each owns:

| Reference module | Contract observed | Reused here as |
|---|---|---|
| `app/persistence/undo_store.py` | `{history: [], index: -1}`; `MAX_HISTORY = 100`; `push` truncates the redo branch, skips a consecutive duplicate, drops the oldest and shifts the index on overflow; `_clamp()` validates history/index on every load; atomic `save_json_atomic` | `lib/history.ts` + `lib/historystore.ts` |
| `app/core/undo_service.py` | one global timeline, `undo`/`redo` move a cursor, `canUndo = idx >= 0`, `canRedo = idx < len-1`, `kind_projection` gives a panel-local *view* of the same timeline, `VALID_KINDS` is a closed vocabulary | `lib/history.ts` (`canUndo`/`canRedo`, kind = `entry.type`) |
| `app/ui/services/undo_entries.py` | per-kind `remember` (apply a new edit) / `apply` (restore during undo) twins; emits `{history, index, canUndo, canRedo, count}` | `state/HistoryProvider.tsx` applier registry |
| `app/persistence/json_store.py` | one atomic writer (temp + replace) for every JSON file | already have it: `selection/reviewstore.ts` tmp-verify-overwrite |
| `app/ui/panels/layout_state.py` | state save must never gate the UI update; failures are reported, not swallowed (RULE 2/24) | session save is fire-and-forget + honest failure |

**Deliberate deviations** (documented, not accidental):

1. The reference entry is `{kind, value}` — a *snapshot of one slice*. Undo at
   index 0 needs a special "frontier" marker because there is no earlier value
   to restore. This app's entries carry **`before` + `after`** (task §7 requires
   both), so undo always applies `entries[index].before` and the frontier case
   needs no special marker. Simpler and deterministic.
2. The reference `value` is untyped `Any`. Here every entry is typed and
   **re-validated on read** (RULE 13): bad version, bad shape or a non-array
   history yields an empty timeline, never a crash.
3. The reference is a Qt bridge with signals; this app is React. The timeline
   is a pure reducer plus a context provider — no bridge, no signals.

## 2. Why a store above the tabs is mandatory

`src/ui/Workbench.tsx` renders one panel at a time
(`{mode === "sheets" && <App />}`), so **switching tabs unmounts the panel and
destroys its `useState`**. Task §9 ("hidden/inactive tabs must not keep stale
copies", "undo from another tab must produce the same result") is therefore
impossible while undoable values live inside panels. So:

`src/state/appstore.ts` — a framework-agnostic store (subscribe/get/set) created
at module scope, holding exactly the undoable + restorable slices. Panels become
views over it via `useSyncExternalStore`; `set` replaces only the touched key, so
slice identity (and therefore React memoisation) stays stable.

| Slice | Owner of the value | Persistence |
|---|---|---|
| `tab` | appstore | session file |
| `sheets {padding,size,transparent}` | appstore | session file |
| `batch {presetName, ignore}` | appstore | session file (preset bodies stay in `presets.v1`) |
| `selection {filter,sort,activeId,search,collapsed,zoom,sync,autoNext}` | appstore | session file |
| `selectionV2 {filter,sort,checked,scrollY}` | appstore | session file |
| `prefs {mode,thumbHeight}` | appstore in memory | **`prefsstore` stays the single writer** — the session file deliberately does not duplicate it, so one value never has two owners |
| review decisions | `review-decisions.json` (disk is the cross-tab truth) | existing atomic writer |
| root folder handles | IndexedDB | existing `batch/store.ts` |

## 3. Global timeline — `src/lib/history.ts`

```
HistoryEntry { id, type, label, at, origin, ids[], before, after, v }
Timeline     { entries: HistoryEntry[], index: number }   // index = newest applied, -1 = frontier
MAX_HISTORY 100 · HISTORY_VERSION 1
```

* `pushEntry` — truncates everything after `index` (**a new action clears the
  redo branch**), skips a consecutive duplicate, appends, then caps: drop the
  oldest and shift `index`, so the cursor keeps pointing at the same entry.
* `pushCoalesced` — a slider drag is one gesture, not 40 actions: while the tip
  has the same `type` + `ids` and is younger than the window, its `after` is
  replaced and the original `before` is kept. One entry per gesture.
* `undoStep` / `redoStep` — pure cursor moves returning the entry to apply;
  `null` when unavailable, so the caller can never move the cursor on failure
  ("failed apply must not corrupt the history cursor").
* `parseTimeline` — version + shape validation, index clamped into
  `[-1, len-1]`, corrupt → empty timeline.

## 4. Applying entries — `state/HistoryProvider.tsx`

One provider above the tabs owns the timeline and an **applier registry**
(`type → (entry, direction) => void`). Built-in appliers cover every
store-owned slice; the Selection panel registers the `decisions` applier while
mounted. If it is *not* mounted, `selection/offline.ts` applies the decision map
straight to `review-decisions.json` through the stored root handle, so an undo
from the Sheets tab is real, not cosmetic — and the panel reads the same file on
its next mount. Undo/redo therefore always goes through the same canonical
mutation path as the original action (RULE 24, task §9).

Restore never pushes history: session load writes the store through a
`silent` path, and a `dirty` guard drops a late async restore rather than
clobbering a change the user already made.

## 5. Undoable vs not (task §5) — documented boundary

| Action | Undoable | Why |
|---|---|---|
| approve / decline / **reset to pending** (single + bulk) | yes | app state + our own JSON file |
| checkbox selection, select-visible, deselect-all | yes | app state; one bulk command = one entry |
| filters, sort, date mode/range | yes | app state |
| view prefs (layout, zoom), sheet padding/size/transparent, batch preset + ignore list | yes | app state |
| batch **processing** (writes files), ZIP/download/clipboard export | **no** | irreversible external side effects (RULE 14/23) — the timeline never claims to reverse them |
| picking a folder | **no** | a restored handle needs an async permission re-grant that can be denied; showing a folder we cannot read would be dishonest |
| tab switching | **no** | navigation, not an edit (still restored on restart) |

The History bar says what it will undo (`Undo: Approve 14 selected pairs`) and,
when a target has vanished, reports `Nothing to undo — those pairs are gone`
instead of silently doing nothing.

## 6. Reset to pending

`withReset(state, ids, nowIso)` in `selection/state.ts`: reviewed pairs go back
to `pending` with `reviewedAt = null`, which removes their record from the JSON
(I-13 — a pending pair has no stored decision). Pair identity, paths and file
metadata are untouched. Already-pending or unknown ids are `skipped` and named
in the single summary line. One bulk reset = one transition, one write, one
toast, one history entry.

## 7. Session snapshot — `src/lib/session.ts`

`{ v, savedAt, tab, sheets, batch, selection, selectionV2 }`, validated field by
field on read: unknown tab → `sheets`, non-finite numbers → defaults, non-array
lists → `[]`, corrupt payload → `DEFAULT_SESSION`. `pruneSession` drops an
`activeId` / `checked` ids that no longer exist after a rescan, so a stale
selection can never crash a render or select a row that is not there. Missing
folders keep the existing policy: the root handle is restored from IndexedDB and
a missing/unreadable file surfaces as `AI result missing` / `Original missing`
rather than disappearing (RULE 4).

## 8. Negative tests (must exist before the code)

timeline: redo branch cleared, consecutive duplicate skipped, cap shifts the
cursor, undo/redo at both ends, coalescing window, corrupt/old-version payload,
index out of range · session: every field corrupt, stale ids pruned, unknown
tab, restart round-trip · reset: one item, bulk as one entry, already-pending
skipped, record removed from JSON · undo/redo: checkbox, single decision, bulk
decision, bulk reset, cross-tab (panel unmounted), deleted target, failed apply
leaves the cursor untouched · UI: disabled buttons, labels, Ctrl+Z /
Ctrl+Shift+Z / Ctrl+Y, ignored while typing · non-undoable: batch processing and
exports push nothing.

## As built (2026-10-01)

Differences from the plan above, all deliberate:

1. **`stepBack` / `stepForward`** instead of `undoStep` / `redoStep` — the
   quality gate's anti-gaming rule rejects any name ending in `Step`/`Part`/
   `Chunk`. Same contract: a pure cursor move that returns the entry to apply.
2. **`pruneIds(ids, known)`** replaced the planned `pruneSession(state, known)`.
   `applyScan` already re-resolves `selectedId`, and V2's own prune hook was
   removed, so only the checked-id list needed pruning; one small function now
   has exactly one caller instead of a state-shaped wrapper with none.
3. **Decisions entries carry records, not a decision map**: `before`/`after` are
   `{ recs: ReviewRecord[] }` for exactly the touched pairs. That is what lets
   the offline path rebuild a record (source/AI paths included) without a scan,
   and it expresses "back to pending" as an absent record (I-13).
4. **`origin` is the live tab id** (`getAppState().tab`), so V1 and V2 entries
   are distinguishable even though both run through `useSelection`.
5. **Prefs are written by `usePrefsAutosave` above the tabs**, not by the V2
   panel, so an undo applied while the panel is unmounted is persisted too.
6. Sheets export settings moved into `lib/exportopts.ts` (sizes, defaults,
   validator) shared by `App.tsx` and the session parser — one owner, so a
   restored `size` is always one the `<select>` can show.
