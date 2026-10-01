# Session restore + reset-to-pending + one global Undo/Redo — design

Written 2026-10-01 (RULE 17: dated archive, never edited to "catch up").
Status: implemented in the same change. Current behaviour afterwards lives in
`docs/current/SYSTEM_OF_RECORD.md`; this file keeps the reasoning.

## 1. Problem

1. The app forgets everything on restart: the active tab, review filters,
   sorting, checked rows, active row, zoom, export settings and list position
   are all React state. A restart lands on an unexplained blank Sheets tab.
2. An approved/declined pair can only be flipped to the other decision — there
   is no way back to pending, individually or in bulk.
3. Nothing is revertible: a mis-clicked bulk approve of 200 pairs is permanent.
   RULE 12 anticipated this ("if undo is ever added: ONE global timeline").

## 2. Reference implementation research

Source: `https://github.com/marnikus/Process-Images-in-Areana` (only `main`
exists; the `arena` branch named in the request is not in the repository).

| Concern | Reference module | Contract |
|---|---|---|
| Timeline persistence | `app/persistence/undo_store.py` | `config/undo.json` = `{history: [{kind, value}], index}`; `MAX_HISTORY = 100`; loaded, then **clamped** (`index ≥ -1`, `index < len`); corrupt/unreadable file → `DEFAULTS` (empty, `index = -1`); atomic save (temp + replace, RULE 13/23); `save()` returns `False` instead of raising |
| Timeline semantics | `app/core/undo_service.py` | `undo()` / `redo()` move `index` only; `index = -1` means "nothing applied yet"; push **truncates the redo branch** (`hist[:idx+1]`); duplicate consecutive identical entries are suppressed; entry kinds are validated per kind |
| Session store | `app/persistence/config_manager.py` (`SessionStore`) | one JSON document of UI state with a `DEFAULTS` object; `load()` re-reads and falls back to defaults; `set(**kwargs)` merges + saves atomically; unknown/retired keys heal on validate |
| Restore entry point | `app/services/workspace/providers/undo.py`, `recover.py` | restoring the timeline goes through the *same* clamp the live writer uses; the timeline is restored whole (cherry-picking forks it); recovery backups before writes |
| Rule text | `docs/current/AGENT_RULES.md` RULE 12 | one chronological timeline across every editable surface; entries `{kind, value, seq}`; 100-entry cap; truncate-on-branch; automatic engine side-effects are **not** recorded |

### License / compatibility

The reference repository ships **no LICENSE file**, so no code was copied. Only
the *contracts* above were re-derived and re-implemented in TypeScript for the
browser (localStorage instead of files, immutable updates instead of
`deepcopy`). Everything adapted is listed in §3/§4 and covered by our own tests.

### Differences that force a redesign

| Reference | Icon Splitter | Why |
|---|---|---|
| `value` is a whole-domain snapshot per kind | per-entry `before`/`after` of only the affected stable ids | the app owns lists of hundreds of pairs; whole-app snapshots per click would grow unbounded (requested: "avoid full-app snapshots") |
| kinds are coarse (`grid`, `queue`, …) | kinds are `review`, `review-checks`, `review-view`, `settings`, `batch-select` | each kind needs a *typed* applier with target validation |
| one Python process, one writer | browser tabs unmount; V1/V2 are two views of one review | state must live outside the component tree or hidden tables keep stale copies |
| entries have no targets | every entry lists the stable ids it touched | stale entries must be droppable when a rescan deletes a pair |
| no ephemeral entries | entries may be `ephemeral` (owner exists only while its panel is mounted) | batch row selection is not persisted state; such entries never reach storage |

## 3. Owned state (single source of truth, RULE 10/24)

| Value | Owner (one writer) | Persisted in |
|---|---|---|
| review decisions (approve/decline) | `review-decisions.json` via `selectionreview`/store | file (atomic tmp-verify-overwrite) |
| pairs, records, filters, sort, checks, active row, watcher, V2 prefs, collapsed/zoom/sync | `src/selection/selectionstore.ts` (module store, not React state) | session `review` slice (mirror) |
| active tab, sheets export options (padding/size/transparent) | `src/session/sessionstore.ts` | `iconSplitter.session.v1` |
| undo/redo timeline | `src/history/historybus.ts` | `iconSplitter.history.v1` |
| batch rows + their checkboxes | `useBatch` (unchanged) | not persisted (rescan rebuilds them) |

React components read these stores through `useSyncExternalStore`; no component
keeps a private copy, so a hidden tab cannot go stale and an undo applies
through the same canonical mutation the click used (RULE 24, request §9).

## 4. History model (adapted from the reference, typed)

```
HistoryDoc  { v, entries: HistoryEntry[], cursor }      cursor = last APPLIED entry, -1 = none
HistoryEntry{ id, kind, label, tab, at, targets[], before, after, v, ephemeral? }
```

* `push` truncates everything after `cursor` (redo branch cleared), appends,
  caps at `HISTORY_CAP = 100` dropping the oldest, and **coalesces** a
  same-kind/same-target/same-field entry that arrives within
  `COALESCE_MS = 700` (one slider drag = one entry, matching the reference's
  duplicate suppression, extended to drags).
* `undo` = apply `entry.before` at the newest *applicable* entry at or before
  the cursor; `redo` = apply `entry.after` at `cursor + 1`.
* Before applying, entries whose targets no longer exist are **compacted**
  (request §8) — the cursor is recomputed by counting only applied entries that
  survived, so compaction can never corrupt it. An apply that reports failure
  leaves the cursor untouched (request §4).
* Kind → applier registry (`HistoryApplier{ canApply, apply }`); a kind with no
  registered applier is treated as obsolete and compacted.

### Undoable vs not (request §5)

| Undoable (one entry per user command) | Not undoable (no history entry) |
|---|---|
| approve / decline / reset-to-pending, one pair or a whole bulk scope | writing/overwriting files on disk (exports, ZIP downloads, batch outputs) |
| checkbox selection: one row, select-visible, deselect-all, header | completing a network/browser job (scan, rescan, watcher tick, process run) |
| review view state: filters, date/month/range, search, status/pairing, sort, layout, zoom, auto-next, watcher, collapsed, sync | clipboard copies and "open in Explorer" (an external side effect that already happened) |
| sheets export settings (padding, size, transparent) | preset save/delete (writes to localStorage + IndexedDB handles; deterministic to redo by hand) |
| batch row selection (ephemeral, while the Batch panel is mounted) | active-row navigation and scroll position (recorded in the session, not as history) |

The UI never claims an irreversible action was undone: the Undo button label
always names the entry it will reverse, and non-recorded actions simply do not
appear in the timeline (§5 boundary).

## 5. Session model

```
AppSession { v, savedAt, tab, sheets {padding,size,transparent}, review {...}, scroll {key:px} }
```

* `parseSession` validates every field and falls back per field (RULE 13); a
  corrupt payload costs one ignored load, never a blank app.
* Restore reads the payload **once, synchronously, before the first render**
  (store initialisers), so no delayed asynchronous restore can overwrite a
  newer user change (request §1). `restoreReview` additionally refuses to write
  into a store that is no longer pristine.
* Stale ids: restored `checked`/`selectedId` are pruned against the first scan
  that produces pairs; a restored root that cannot be reopened (permission
  revoked, folder gone) keeps its filters but warns honestly and shows the
  pick-root state (RULE 4).
* Storage writes are single `localStorage.setItem` calls of a fully serialised
  payload, debounced for high-frequency values (scroll, slider drags) — the
  same atomic "one complete document, never a partial one" property the
  existing preset/decision-file flows already have (RULE 23).

## 6. Reset to pending

`src/lib/reviewreset.ts` owns the rule: a pair can be reset when it has a
stored decision (`reviewedAt !== null`) — reset is always the *safe* direction,
so unlike approve/decline it is allowed for incomplete pairs. Reset clears the
decision **and** the record from `review-decisions.json` (I-13: a pair with no
stored decision is pending), preserving the pair, its sides and all file
metadata. One item, checked items, and the whole visible list are the three
scopes; each is one transition, one write, one summary toast, one history entry.

## 7. Module map added by this change

| File | Owns |
|---|---|
| `src/lib/history.ts` | timeline document, push/coalesce/cap, cursor moves, compaction, validation, labels, shortcut mapping |
| `src/lib/session.ts` | `AppSession` schema, per-field validation, stale-id sanitising, scroll memo keys |
| `src/lib/reviewreset.ts` | reset scope + labels + summary line |
| `src/lib/reviewsnapshot.ts` | decision snapshots (`{id, decision, reviewedAt}`) + apply onto pairs |
| `src/store/store.ts` | tiny observable store + `useStore` (single-owner state outside React) |
| `src/history/historystore.ts` | `iconSplitter.history.v1` IO |
| `src/history/historybus.ts` | timeline singleton, applier registry, undo/redo outcomes |
| `src/history/HistoryBar.tsx` | app-level Undo/Redo controls, labels, compact list |
| `src/history/undohotkeys.ts` | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y wiring |
| `src/session/sessionstore.ts` | `iconSplitter.session.v1` IO + module store |
| `src/session/selectionmirror.ts` | writes/reads the `review` slice of the session |
| `src/session/scrollmemo.ts` | debounced list-scroll memo (no React re-render) |
| `src/session/useExportOpts.ts` | sheets export options with persistence + history |
| `src/selection/selectionstore.ts` | the review store + canonical mutations |
| `src/selection/selectionhistory.ts` | review entry builders + appliers |

## 8. TDD order followed

Red → green per module: `history` → `session` → `reviewreset`/`reviewsnapshot`
→ store/mirror/scroll memo → history bus (bulk = one entry, redo branch, stale
targets, cap, corrupt payload) → UI (reset buttons, Undo/Redo controls, disabled
states, shortcuts) → cross-tab (V1 ↔ V2) → restart. Negative tests kept: corrupt
history does not block startup; a failed apply leaves the cursor; a bulk action
never produces N entries; a non-undoable action produces none.

## 9. Known boundaries (documented, not hidden)

* Loaded sheet images cannot be persisted (browser file objects) — the session
  restores settings and view state, never the loaded pixels (RULE 20 keeps the
  images local in the first place).
* Batch row checkboxes are ephemeral history: they are dropped when the history
  is written to storage, so a restart can never replay a check against a row
  set that no longer exists.
* Directory handles restore through the existing IndexedDB flow; the browser
  may require a fresh permission gesture, which is reported honestly.
