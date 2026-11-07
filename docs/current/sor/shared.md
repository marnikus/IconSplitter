# Shared state and shell

Read this only for cross-tab changes. Mode-specific state lives on its tab page; see [shared invariants](invariants/shared.md), [path invariants](invariants/paths.md), [storage](STORAGE.md) and [shared selectors](../selectors/shared.md).

The shell and session are shared by every tab. [Global history and undo](topics/state-history.md), [the activity log](topics/log.md), [folder/path capture](topics/paths.md), and [browser key storage](topics/secret-store.md) have opt-in deep dives. A tab should not invent a second undo timeline or leak data into logs.

[Shared batch progress](process-progress.md) owns the common header, generic reporter, cross-tab Upload lifecycle, all-tab completion sound and selector contract.

The shell has seven tabs (SVG builder added 2026-11-07, see [builder](builder.md)); the original Selection tab is removed. A session saved
on that old tab opens Selection V2, retaining valid review and checked state.
The shared review helpers and persistent handle/sidecar keys remain compatible.

[Large-list selection performance](selection-performance.md) owns the indexed checked-row projection, presentation invalidation and reproducible Chromium response benchmarks. Selection gestures/history remain unchanged.

[Review-list state sorting](list-state-sorting.md) owns selected/not-selected and approved/not-approved grouping on the four review tabs.

## Back where you were after a reload (2026-11-06)

- Every tab's scroll position in the shared tab area is saved as you scroll and restored after a reload and on reopening the tab (`ui/scrollmemory.ts`, `iconSplitter.ui.scroll.v1`); the restore retries briefly while rows load and stops when the user scrolls, clicks or types.
- A list scrolls its restored active row into view the first time that row appears (`ui/checkedrows`).
- The SVG edit mode makes the row it opens the active row, so the last edited row is the one you return to.
- Tests: `scroll_memory.test.tsx`.
