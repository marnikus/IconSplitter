# Path scope invariants — output set, pair-file rebase

Stable IDs belong here; [all IDs](README.md) route to one canonical definition. Split from [path invariants](paths.md).

<a id="i-38"></a>
* **I-38 (the scope is the batch's output, RULE 3/24):** when the picked tree
  contains a folder whose name matches `/^_.*split.+output/i` (or the picked
  folder is one), Selection V2 and Generate SVG list **only** pairs with a
  side inside such a folder — the main folder keeps the unsplit sheets, which are
  the batch's input, and they are not reviewable and not generatable. The scope
  is a function of the tree's directories — and of what the picked folder itself
  is (I-47) — so a repeated scan decides the same way; every out-of-scope item is
  counted and reported (both toolbars, the log, `outside-split` exclusions),
  never silently dropped, and the records of out-of-scope pairs stay as orphans.
  A tree without such a folder behaves exactly as before.

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
