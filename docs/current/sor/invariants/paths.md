# Paths invariants

Stable IDs belong here; [all IDs](README.md) route to one canonical definition.

<a id="i-28"></a>
* **I-28 (copies, RULE 2/9):** a "copy path" action yields a **folder** path,
  never a file name: the folder that holds the file the action was made from
  (I-56 — reversed 2026-10-06 from the older "stop at the batch folder" rule).
  The text uses backslashes throughout, and a blocked clipboard is reported as
  an error instead of being swallowed.

<a id="i-29"></a>
* **I-29 (full path, RULE 13/20 — amended 2026-10-09, I-63):** the full path of
  a picked root is bound to the folder's **handle** and persisted with it
  (IndexedDB `iconSplitter.rootpaths`, `lib/rootstore`), normalised on write
  (Explorer's surrounding quotes, forward slashes, trailing and doubled
  separators, UNC pairs kept) and validated on read — a corrupt payload or a
  lost handle means no memory, never a guess, and the app never invents a
  drive. The old name-keyed `localStorage iconSplitter.rootpaths.v1` is never
  read (I-63: a name is not an identity). With no memory the copy falls back to
  the folder's own name.

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

<a id="i-36"></a>
* **I-36 (the path is visible, RULE 12):** wherever a root is shown, its full
  path is shown with it once known — the full-width row below the controls
  (`ui/FolderBar`, `sel-folder-path` / `v2-folder-path` / `svg-folder-path` /
  `upload-folder-path`) — and the row names the state the value is in (*the
  path*, *full path not captured*). A user never has to open a dialog to find out
  what a copy will hand over, and a capture in one tab reaches the others without
  a reload (the binding is per handle and the rows subscribe to the registry,
  I-63). The pill that showed the folder in place of the action, and the field
  that let the path be typed, are gone (§16, I-44/I-45).

<a id="i-37"></a>
* **I-37 (the boundary is stated, RULE 9):** the browser can never read the drive
  path of a picked folder, so the app states that boundary where the path would
  be: the row prints the folder's name with `full path not captured`, and the
  `Open folder` button's tooltip says that the path Explorer copied is captured
  with the pick. Nothing asks the user to type or paste a path any more (I-45).

<a id="i-38"></a>
* **I-38 (the scope is the batch's output, RULE 3/24):** when the picked tree
  contains a folder whose name matches `/^_.*split.+output/i` (or the picked
  folder is one), Selection V1/V2 and Generate SVG list **only** pairs with a
  side inside such a folder — the main folder keeps the unsplit sheets, which are
  the batch's input, and they are not reviewable and not generatable. The scope
  is a function of the tree's directories — and of what the picked folder itself
  is (I-47) — so a repeated scan decides the same way; every out-of-scope item is
  counted and reported (both toolbars, the log, `outside-split` exclusions),
  never silently dropped, and the records of out-of-scope pairs stay as orphans.
  A tree without such a folder behaves exactly as before.

<a id="i-39"></a>
* **I-39 (a "full path" is only a folder path, RULE 13 — amended 2026-10-09):**
  the value bound to a root (`lib/knownroots`, persisted by `lib/rootstore`) is
  either an Explorer-usable **folder** path — a drive path (`F:`, `F:\`,
  `F:\a\b`; forward slashes and surrounding quotes forgiven) or a UNC path
  (`\\server\share[\…]`) — or nothing at all.
  `isFolderPathText` is the only judge, and it runs on the raw text at every
  entry point (the clipboard adoption at pick time and at a later capture, and
  the one writer `rememberKnownRoot`) and again on read, so SVG markup, URLs,
  relative text and file names can never be stored, replayed, shown as the
  root's path or prefixed to a copy. A refusal stores nothing and leaves the
  previous binding in place.

<a id="i-47"></a>
* **I-47 (picking the output folder is picking the set, RULE 3/12):** when the
  picked folder **is** the app's own output folder (`_split_output`, tolerant
  variants) or one run folder inside it (`<YYYY-MM-DD>`, legacy `<YYYY-MM-DD_HH-mm-ss>`), every pair
  found below it is reviewable — the filter that hides the unsplit sheets
  applies only while the output folder is strictly *below* the picked root
  (`lib/splitscope.ScopeRule { split, hideOutside }`). The scope line names such
  a root (`Scope: split output only`) and never says "in the main folder", which
  is not inside the picked root at all.

<a id="i-49"></a>
* **I-49 (a pair file is read from where it sits, RULE 3/13):** every read of a
  pair file rebases it onto the root doing the reading — `dirPath` is the file's
  own directory, each face's `relPath` is that directory plus the name the file
  stored, each generated version's `svgPath` is that directory plus the SVG file
  name it stored (a failure keeps its empty path), and the id is recomputed
  exactly as a scan of this root computes it (`lib/pairrebase.rebaseMeta`,
  applied by `selection/pairstore.loadMetaAt`). A decision — and the artwork it
  approved — therefore follows the folder between roots; a pair file that names an
  id no scan of this root would produce (a legacy record) still answers for that
  id when the legacy file is merged (`pairstore.loadPairDecisions` keeps the id
  each file carried).

<a id="i-50"></a>
* **I-50 (a run stamp anywhere in the set is evidence, RULE 3/12):** `scopeOf`
  reports `split: true` when the picked folder **is** an output folder *or* any
  name in the set (the root's own name, or any directory below it) is a run stamp
  — so `_split_output`, a month folder and one run folder all review the pieces
  they contain. Since 2026-10-16 a run stamp is a DAY (`YYYY-MM-DD`); the legacy
  timestamped form counts identically. `hideOutside` still applies only while `_split_output` lies
  strictly below the root (the `test_processing_2` case, I-38/I-40).

<a id="i-51"></a>
* **I-51 (the app names a folder only from a folder it already named, RULE 4/13
  — amended 2026-10-09):** the full path of a pick comes from the clipboard
  **only** when it names the picked folder (exactly, or as its direct parent —
  I-35); otherwise `lib/knownroots.deriveRootPath` answers it in EITHER
  direction from the folders this app already placed exactly: below one (the
  segments that folder's own `resolve(picked)` reports), the folder itself
  (`[]`), or ABOVE it (the segments `picked.resolve(known)` reports, stripped
  and verified — picking `test_process_3` with `test_process_3\_split_output`
  known is exact, the third report). Every capture is bound to its handle and
  persisted (`lib/rootstore`), each tab restores the root's record at boot
  (`restoreKnownRoot`), and a capture that lands later — `Rescan`, `Ctrl+V` —
  binds to that very handle, so the next pick related to it is exact. A
  clipboard text that names some OTHER folder yields nothing at all (I-59), and
  the old name-keyed registry (`nameKnownRoot` / `ui/knownroots`) is gone —
  a name cannot carry a path (I-63).

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

<a id="i-56"></a>
* **I-56 (the folder of the file, RULE 4 — 2026-10-06):** a copy names the folder
  that CONTAINS the file the action was made from, at every depth: for
  `…/<stamp>/<piece>/split_04/<file>` that is `…\<piece>\split_04`, whoever's
  root was picked (`_split_output`, the month folder, the run folder or any
  ancestor). **Reverses I-48** (2026-10-05), whose "stop at the run folder" made
  a deep file's location point one level too high; the run folder is reached by
  copying an item that really sits in it. `svg/codeactions.openLocation` hands
  over `targetPathOf(row)` — the same path `svg-target-{id}` shows — so the row's
  text and the copied folder can never disagree (the older code joined the row's
  folder onto an already root-relative `svgPath`, doubling the chain).
  A folder that merely resembles the layout keeps the item's own folder, as
  before; `lib/batchlayout` owns the names both rules read.

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

I-48 was superseded by [I-56](#i-56); it is a historical reference, not a second active rule.
