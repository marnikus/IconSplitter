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

What a restart must remember lives in **two documents with one owner each**
(`state/boot.ts` reads both, the selection wins):

- **`iconSplitter.selection.v1` — the selection document**
  (`state/selectionstore.ts`, parsed by `lib/selectiondoc`). The only place a
  tab's **checked ids**, active id and anchor live. Its own key is the fix for
  the report "a new selection is never stored and the 100 checks picked before
  come back after every reload": pages still running an older build know only the
  session snapshot and can therefore never write this document, so their stale
  100 checks cannot come back over a newer pick. A check gesture writes it in the
  same task; the write is read back, retried once, and a refusal is logged as
  `session.save-refused` (`error`) instead of being swallowed.
- **`iconSplitter.session.v1` — the session snapshot** (`state/sessionstore.ts`,
  parsed by `lib/session`): tab, sheets options, view filters, active rows — with
  the selections **stored empty** (`clearSelectionOf`). Nothing here is a second
  copy of the checks. Its first-run/migration read is the one exception: while no
  selection document exists, its ids are still restored (an install upgrading from
  an older build), and mounting the autosave immediately writes them into the
  selection document so the snapshot stops being read.
- **No page resurrects an older pick.** Both documents are guarded: a stamp later
  than this page's last change to that document came from ANOTHER page, so the
  page keeps it (`lib/sessionorder`, logged `debug` as
  `session.kept-newer-snapshot`). `pagehide`/`beforeunload`/unmount and a hidden
  or frozen tab (`visibilitychange`) flush; every non-selection change keeps the
  250 ms debounce.
- **A scan that found nothing removes nothing.** An unreadable folder or a
  permission the page has not been granted yet must not empty the restored checks
  (`upload/rowmodel.pruneChecked`, `stockupload/useStockUpload`,
  `svg/rowmodel.pruneChecked`): only a non-empty scan may prune.
- **The reload names its build.** Every boot logs `session.restored` at `debug`
  ("build <stamp>: tab …, N row(s) selected, restored from the selection
  document|session snapshot"), and the log dock head shows the source
  fingerprint vite stamps into the page (`lib/buildstamp`) — a tab opened before
  a rebuild runs older code, and a report must say which.
- Tests: `session_selection_persist.test.tsx` (same-task write, the older-build
  page that must not resurrect the 100, the migration read, the ids kept out of
  the snapshot, the newer document of another page, the empty scan, the refused
  write), `buildstamp.test.ts`, `session.test.ts`, `workbench_ui.test.tsx`.
