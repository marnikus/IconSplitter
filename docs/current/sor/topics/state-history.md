# Session restore and global undo

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## 12. Session restore, reset to pending & the global undo timeline (2026-10-01)

Design record: `docs/archive/2026-10-01-history-session/design.md`.

### 12.1 One store above the tabs

`Workbench` shows one panel at a time; Batch and Generate SVG stay mounted but
hidden while other panels may unmount. Everything a restart or a cross-tab undo
must see therefore lives in `src/state/appstore.ts` — a module-scope store bound to React
by `useAppState` / `useAppView` (`useSyncExternalStore`):

| slice | contents | persisted by |
|---|---|---|
| `tab` | the active tab | session |
| `sheets` | `padding`, `size`, `transparent` | session |
| `view` | `filter`, `sort`, `selectedId`, `zoom`, `sync`, `autoNext` (Selection V2 review state) | session |
| `v2` | `checked`, `scrollY`, `anchorId` (the Shift anchor) | session |
| `batch`, `svg`, `upload` | each tab's `checked`, `activeId`, `anchorId` | session |
| `prefs` | V2 `mode`, `thumbHeight` — held in memory only | `selectionv2/prefsstore` |

One owner per value, so the session file deliberately does **not** duplicate: the
last batch preset (`saveLastName`), a preset's `ignoreFolders` (`lib/presets`),
the V2 prefs (`prefsstore`), folder handles (IndexedDB via `batch/store`) or
decisions (per-pair sidecars; legacy root file is read-only).

Restore happens in `state/boot.ts` **before** the first render, so no panel ever
paints defaults and then jumps. Autosave is debounced 250 ms
(`useSessionAutosave`) and prefs are written by `usePrefsAutosave`, both mounted
above the tabs so an undo applied while a panel is unmounted is persisted too.

### 12.2 The timeline

`lib/history.ts` is pure and holds the contracts (adapted from the reference
implementation, see the design doc): `{ entries, index }` with `index = -1`
meaning "before the first action", `MAX_HISTORY = 100`, `HISTORY_VERSION = 2` (still reads version 1),
push truncates the redo branch, collapses a consecutive duplicate and drops the
oldest entry on overflow, `parseTimeline` validates and clamps on every read.
Each entry is `{ id, type, label, at, origin, ids[], before, after, v }` —
minimal before/after, never a full app snapshot.

`state/HistoryProvider.tsx` owns the clock/ids, persistence
(`state/historystore.ts` → `iconSplitter.history.v1`) and the shortcuts
`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y` (ignored while typing in a
field). `ui/HistoryBar.tsx` shows the controls, the next-action label and a
read-only list of the timeline.

`pushGesture` coalesces one gesture (slider drag, search typing, arrow-key
navigation) into a single entry: the tip's `after` is replaced and the original
`before` kept.

Current [selection performance](../selection-performance.md) extends this dated
record: selection payloads are ordered deltas (legacy absolute values still read),
`useHistoryActions` is stable and separate from `useHistoryView`, and persistence
is deferred per burst with read/pagehide/unmount flush. Session keys are unchanged.

### 12.3 The apply path and the failure rule

Every reversible change is applied through `state/apply.ts`, whether it came from
a click or from the timeline. A step returns the entry to apply and the new
cursor position separately (`stepBack` / `stepForward`), and the provider only
commits the cursor after the apply reported success — **a failed apply never
moves the cursor** and surfaces "That change could not be reversed".

Decisions go through `selection/offline.ts`: a mounted Selection/V2 panel binds
itself as the applier (so an undo lands in the same reducers a click uses); with
no panel mounted the stored `review-decisions.json` is patched directly from the
remembered root handle. Stale targets are skipped, never fatal.

### 12.4 Reset to pending

`withReset` is one transition for a whole batch, so a bulk reset is one history
entry and one summary line ("3 pairs reset to pending"). A pending pair owns no
record (I-13), the record is removed from the JSON, and pair identity, paths and
file metadata are untouched. Available for one item (`sel-reset` in the
comparison view) and for the checked ∩ visible ∩ complete scope
(`v2-reset-selected`); the visible-list variant was removed.

### 12.5 Undoable vs not (documented and tested)

| undoable | not undoable (and why) |
|---|---|
| decisions: approve / decline / reset, single and bulk | batch processing — it writes files into the destination folder |
| checkbox/row selection gestures, select visible, deselect all (including Upload) | ZIP / download / clipboard export — the file is already on disk |
| filters, sort, date mode and range | picking a folder — re-granting permission can be denied, so the app cannot promise it |
| view prefs (list/compare, thumbnail zoom), zoom, sync, auto-next, sidebar | switching tabs — navigation, restored on restart but not an edit |
| sheets padding / size / transparent | the folder watcher toggle — not persisted, so undoing it across a restart would be fiction |

Nothing in the right column is ever reported as reversed; the history simply does
not record it.

### 12.6 Storage map additions

| key | contents | owner |
|---|---|---|
| `iconSplitter.session.v1` | `{v, savedAt, tab, sheets, selection, selectionV2, svg, upload, batch}` | `state/sessionstore` |
| `iconSplitter.history.v1` | `{v, entries, index}` capped at 100 | `state/historystore` |
| `iconSplitter.selectionV2.prefs.v1` | unchanged | `selectionv2/prefsstore` |

Both new payloads are validated field by field on read; a corrupt or
foreign-version payload costs one ignored load and the defaults, never a broken
startup (RULE 13).

### 12.7 Selection is one gesture, one entry

A row click once pushed two entries (`checked` and `view`) and needed two
undo presses. A changed list gesture now records **one** entry carrying
`{ids, anchor, active}`; a plain click changes active/anchor but NOT checks.
Modifiers follow [RULE 25](../../rules/BEHAVIOR.md#rule-25): Shift replaces the
visible range, Ctrl/Alt/Cmd toggles one row, and checkbox/header gestures
leave active alone. `lib/reviewselect` owns intent/range semantics; persisted
anchors let Shift work after a tab switch. V2 keeps `checked`, Batch keeps
`batchChecked`, and SVG/Upload use `svgChecked`/`uploadChecked`; an older SVG-origin
`checked` entry restores SVG checks, not V2. Older bare-array timelines still
read safely. Upload selection joins the global timeline, not a panel-local stack.

The bulk bar is selection-only: **Approve selected**, **Decline selected** and
**Reset selected to pending**, each armed before it applies and each labelled
with the number of pairs that will really change
(`checked ∩ visible ∩ complete`). The visible-list variants were removed — a
bulk action reaching beyond the selection is exactly what the `v2-blocked` and
`v2-hidden` warnings are there to prevent.

The History window (`ui/HistoryPanel.tsx`, opened by `hist-open`) lists the whole
timeline newest first, marks the cursor and offers the same Undo/Redo. It is
read-only: clicking an entry would apply several changes at once, and a failed
apply must never move the cursor.

### 12.8 Undo must not depend on where the focus ended up

`selection/hotkeys` only skips a keystroke for a *text* surface: a text-ish
`<input>` (`text, search, number, email, password, url, tel, date, month, time,
datetime-local`), a `<textarea>`, a `<select>` or a contenteditable. A `range` or
`checkbox` passes the keystroke through, so `Ctrl+Z` still works after dragging
the zoom slider or clicking a row checkbox — the previous "any input is a text
field" test killed undo for the two controls the review tab uses most.

The original Selection UI is removed. Old saved `tab: "selection"` opens V2
and preserves its valid view/checked state; `collapsed` is no longer a view
field. A historical collapse-only apply is refused without mutating state;
valid mixed history still applies its supported V2 fields.
