# Path capture invariants — pick, clipboard, identity

Stable IDs belong here; [all IDs](README.md) route to one canonical definition. Split from [path invariants](paths.md).

<a id="i-35"></a>
* **I-35 (the pick captures the path, RULE 4/13 — amended 2026-10-09):** every
  way of pointing the app at a folder to scan goes through
  `ui/pickroot.pickRootWithPath()`, which captures the picked folder's real
  path from the clipboard when that text names the folder exactly, **or** is a
  path one level directly inside it (its direct parent is then the exact answer,
  `how: derived` — one level down is the same root, the third report of
  2026-10-09), and binds it to the picked folder's HANDLE (I-63). Nothing is
  completed from a parent or an unrelated folder (I-59). The app never invents
  a path: text that does not name the folder is not stored, and what was
  captured is stated to the user.

<a id="i-52"></a>
* **I-52 (a capture is a conversation, RULE 4/12/13 — amended 2026-10-09):** the
  pick is the primary capture; when it finds nothing the path is still
  recoverable without another dialog, and the UI says how. `Rescan` (in all four
  tabs) makes one more attempt for a root whose path is unknown, and a `paste`
  anywhere outside a text field adopts the text for the root on screen
  (`ui/rootcapture.retryCapture` / `bindPasteCapture`, mounted by
  `ui/FolderBar.FolderPathRow`). Both take the same rule as the pick
  (I-35/I-59): the text must name the folder exactly or be one level directly
  inside it — a pasted parent two levels up, a word, a URL or markup writes
  nothing — and no read happens without the user's own gesture
  (`navigator.userActivation`), so a boot-time scan never touches the clipboard.
  The read reports a state, not just text
  (`lib/clipboardpath.ClipRead`: `text` / `empty` / `blocked` / `unsupported`),
  which is what lets the toast name the reason and the row name both ways out.

<a id="i-59"></a>
* **I-59 (exact or nothing — no completed path, RULE 4/13 — 2026-10-09, rewritten
  twice the same day after three reports):** the "parent + name" completion is
  gone. A copied path is adopted only when it names the picked folder — its
  leaf IS the folder (`how: copied`), or the folder is the parent of the copied
  path's leaf (one level down, `how: derived` — I-35, the third report);
  otherwise the path comes from a folder the app already placed exactly
  (I-51), or it is unknown and the row says so. `PathHow` is `copied` or
  `derived`; a stored `{ how: "completed" }` written by an older build is never
  read at all (the name-keyed store is gone, I-63), so the glued guesses it
  left behind vanish from the row, from every copy (I-56) and from the
  derivation, which may start only from an exact capture. The first fix of the
  day (a veto by a known root + "the app's own copy is never completed") was
  not enough: the stored guess for `test_process_3` survived the fix, the tab
  restored that folder at boot as a known root, and picking its `_split_output`
  *derived* `<glued guess>\\_split_output`. The second ("exact leaf or nothing")
  was not enough either: the frozen glue — labelled `copied` — kept showing for
  every same-named pick (report 1), and a parent pick read as unknown
  (report 2). The real poison was the **name key** itself (I-63): no rule about
  which strings to trust can survive a store that cannot tell two folders
  apart. What remains: `Rescan` (all four tabs) re-reads for an unknown path,
  `Ctrl+V` adopts the text, and both bind the capture to the folder's handle
  for the next derivation.

<a id="i-63"></a>
* **I-63 (a path is bound to the folder, not its name, RULE 4/13 — 2026-10-09,
  after the third report):** a captured full path belongs to the picked FOLDER —
  its `FileSystemDirectoryHandle` — and answers only for that handle
  (`lib/knownroots.rememberKnownRoot` / `boundRootPathInfo`, identity `===`
  plus the platform's own `isSameEntry`; persisted per handle in
  IndexedDB `iconSplitter.rootpaths`, `lib/rootstore`). A name is not an
  identity: every run of this app creates another `_split_output`, and the old
  name-keyed store (`iconSplitter.rootpaths.v1`, one slot per folder name) let
  a glued guess become the path of every same-named folder — the recurring bug
  of 2026-10-09 (§"The Full path that glued two folders together"). With I-63:
  two `_split_output` folders keep their own paths (or their own honest
  unknown), a pick never reads another folder's record, the v1 key is never
  read (an unverifiable payload is corrupt — RULE 13), and the derived path is
  only ever `known handle path ± the segments resolve() reported` (I-51).
  What stays name-shaped on purpose: the row's no-path fallback shows
  `root.name`, and `folderCopyText`'s base falls back to the folder's name
  (I-29) — the folder's own name, never a remembered path of some other folder.
