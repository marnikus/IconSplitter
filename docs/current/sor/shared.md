# Shared state and shell

Read this only for cross-tab changes. Mode-specific state lives on its tab page; see [shared invariants](invariants/shared.md), [path invariants](invariants/paths.md), [storage](STORAGE.md) and [shared selectors](../selectors/shared.md).

The shell and session are shared by every tab. [Global history and undo](topics/state-history.md), [the activity log](topics/log.md), [folder/path capture](topics/paths.md), and [browser key storage](topics/secret-store.md) have opt-in deep dives. A tab should not invent a second undo timeline or leak data into logs.

[Shared batch progress](process-progress.md) owns the common header, generic reporter, cross-tab Upload lifecycle and selector contract.

The shell has five tabs; the original Selection tab is removed. A session saved
on that old tab opens Selection V2, retaining valid review and checked state.
The shared review helpers and persistent handle/sidecar keys remain compatible.
