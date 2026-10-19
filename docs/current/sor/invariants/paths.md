# Paths invariants

Stable IDs belong here; [all IDs](README.md) route to one canonical definition.

**Detail pages:** [I-35/52/59/63 capture](paths-capture.md) · [I-38/47/49–51 scope](paths-scope.md).

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

I-48 was superseded by [I-56](#i-56); it is a historical reference, not a second active rule.
