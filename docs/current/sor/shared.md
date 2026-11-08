# Shared state and shell

Read this only for cross-tab changes. Mode-specific state lives on its tab page; see [shared invariants](invariants/shared.md), [path invariants](invariants/paths.md), [storage](STORAGE.md) and [shared selectors](../selectors/shared.md).

The shell and session are shared by every tab. [Global history and undo](topics/state-history.md), [the activity log](topics/log.md), [folder/path capture](topics/paths.md), and [browser key storage](topics/secret-store.md) have opt-in deep dives. A tab should not invent a second undo timeline or leak data into logs. The builder slice uses `builderChecked` selection deltas and absolute `builderConfig` entries.

[Shared batch progress](process-progress.md) owns the common header, generic reporter, cross-tab Upload lifecycle, all-tab completion sound and selector contract.

The shell has seven tabs, including `svgBuilder`; the original Selection tab is removed. A session saved
on that old tab opens Selection V2, retaining valid review and checked state.
The shared review helpers and persistent handle/sidecar keys remain compatible.

[Large-list selection performance](selection-performance.md) owns the indexed checked-row projection, presentation invalidation and reproducible Chromium response benchmarks. Selection gestures/history remain unchanged.

[Review-list state sorting](list-state-sorting.md) owns selected/not-selected and approved/not-approved grouping on the four review tabs.

## Back where you were after a reload (2026-11-06)

- Every tab's scroll position in the shared tab area is saved as you scroll and restored after a reload and on reopening the tab (`ui/scrollmemory.ts`, `iconSplitter.ui.scroll.v1`); the restore retries briefly while rows load and stops when the user scrolls, clicks or types.
- A list scrolls its restored active row into view the first time that row appears (`ui/checkedrows`).
- The SVG edit mode makes the row it opens the active row, so the last edited row is the one you return to.
- Tests: `scroll_memory.test.tsx`.

## The last selection survives the reload (2026-11-08)

The restart snapshot (`iconSplitter.session.v1`, `state/sessionstore.ts`, parsed by
`lib/session`) carries each list tab's **checked ids**, active id and anchor, not
just its filters. Three rules, one report ("a new selection is never stored and
the 100 checks picked before come back after every reload"):

- **A selection gesture IS the write.** Any change to a selection slice
  (`upload`, `stockUpload`, `svg`, `builder`, `batch`, `v2`) is written in the
  same task (`state/useSessionAutosave.ts`); every other change keeps the 250 ms
  debounce, and `pagehide`/`beforeunload`/unmount — plus a tab the browser hides
  or freezes (`visibilitychange`) — still flush. A page that is killed, reloaded
  by the helper or closed without a clean unload therefore cannot lose the last
  pick.
- **A verified write, never a silent one.** `saveSessionState` reads the document
  back (`state/sessionstore.ts`), retries once, and the caller logs
  `session.save-refused` at `error` when storage still refuses — the app never
  pretends a refused write stored the selection.
- **A page may not resurrect an older selection.** A snapshot stamped after this
  page's own last selection change came from ANOTHER page (the helper opens a
  second tab), so this page keeps it instead of overwriting it
  (`lib/sessionorder`, logged at `debug` as `session.kept-newer-snapshot`).
- **A scan that found nothing removes nothing.** An unreadable folder or a
  permission the page has not been granted yet must not empty the restored checks
  (`upload/rowmodel.pruneChecked`, `stockupload/useStockUpload`,
  `svg/rowmodel.pruneChecked`): only a non-empty scan may prune, because only a
  non-empty scan can say which ids no longer exist.
- Tests: `session_selection_persist.test.tsx` (same-task write through the real
  panel, the 100-→-new replacement, the other-page snapshot, the empty scan, the
  refused write), `session.test.ts`, `workbench_ui.test.tsx`.
