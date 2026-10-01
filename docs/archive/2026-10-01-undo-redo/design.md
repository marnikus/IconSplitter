# Global undo/redo + reset-to-pending — design (2026-10-01)

Adapted from `Process-Images-in-Areana` (`app/core/undo_service.py`,
`app/persistence/undo_store.py`): ONE global timeline
`{history: [{kind, value}], index}`, `MAX_HISTORY = 100` with clamp, push
truncates the redo tail and skips consecutive duplicates, undo at index 0
returns the *empty frontier* (restore the pre-history baseline), redo walks
forward, every change is a snapshot the caller re-applies per kind.

## Redesign decisions for this app (RULE 1/3/13/16/18)

* Pure core in `src/lib/undo.ts` (no IO): `clampStack`, `pushEntry`,
  `undoOnce`, `redoOnce`, `parseUndoStack` (corrupt -> empty default),
  `serializeUndoStack`. The Python class becomes six small functions.
* Persistence: localStorage `iconSplitter.undo.v1` (app-owned metadata like
  presets; validated on read) instead of a config file — browser app, no
  server, survives restarts.
* Kinds recorded (Selection mode, "any change"): `decisions` (records
  snapshot), `select` (selectedIds), `filter`, `sort`. Search text excluded
  (per-keystroke snapshots would flood the timeline; documented).
* Baseline: `SelState.undoBase` holds the records at stack (re)init; a
  successful rescan resets the stack + baseline because external file changes
  rewrite the domain (honest history, no stale restores).
* Undo/redo never push; applying an undone/redone `decisions` step persists
  via the existing atomic save (partial-failure banner reused).
* Reset-to-pending (new feature): `resetDecision` / `bulkReset` set
  `decision: "pending"`, `reviewedAt: null`, drop the record
  (`recordsFromViews` already excludes pending) — one more `decisions` push so
  reset itself is undoable.

## UI

* Header: `sel-undo` / `sel-redo` buttons (disabled at the ends) +
  Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, inert inside form fields.
* Compare header: `sel-reset` "Reset to pending"; ListControls:
  `sel-bulk-reset` for the selected visible pairs.

## Tests (TDD)

* `tests/undo.test.ts` — clamp/cap, redo-tail truncation, dedupe, undo/redo
  walk incl. empty frontier, corrupt parse, round-trip.
* `tests/selection_undo.test.ts` (new file, keeps selection_state.test.ts
  focused) — `resetDecision`, `bulkReset`, `pushUndo`/`canUndo`/`canRedo`,
  `applyUndoOut` (all four kinds), rescan resets the stack.
* `tests/selection_undo_ui.test.tsx` — DOM: approve -> sel-undo -> count back
  to 0; sel-redo; sel-reset (+ reset is undoable); sel-bulk-reset; ctrl+z /
  ctrl+shift+z.
* `tests/undo.test.ts` + save round-trip (`{root, stack, base}`, corrupt
  fallbacks).
