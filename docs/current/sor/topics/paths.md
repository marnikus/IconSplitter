# Folder copies and remembered path

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## 14. Folder copies and the remembered full path (2026-10-05)

A copy action used to hand over a **file**: `rootName\relPath` in Selection and
Generate SVG, and `rootName/relPath` — forward slashes, exactly the format
Explorer refuses — in the Batch tab. The user asked for the folder instead, as a
full Windows path that pastes straight into Explorer, and gave the target string
(`…\_split_output\2026-10\2026-10-01_10-24-31`). Full record:
`archive/2026-10-05-folder-path-copy/design.md`.

### 14.1 What the browser can and cannot know

The File System Access API tells the page the picked folder's **name** only
(`test_processing`); the drive and every folder above it are invisible for
privacy. So a pasteable path cannot be read — it has to come from the user's own
Explorer copy, captured when they pick the folder (§14.3). What was captured is
normalised (quotes, forward slashes, doubled and trailing separators, UNC pairs —
I-29) and remembered per folder name in `iconSplitter.rootpaths.v1`, so the same
folder picked in another tab gives the same text for free, and it is shown in the
read-only path row (§16, I-46). A hand-typed field (`ui/RootPathField`) existed
until 2026-10-05 and has been removed (I-45); with no capture the copies still
work and say so (`full path not captured`).

### 14.2 One function decides every copy

`lib/rootpath.folderCopyText(rootName, relPath)` and its one caller
`lib/copypath.copyFolderText` replace the three hand-written copies (the Batch
one had its own, with forward slashes). The rule (I-28, revised 2026-10-06 by
I-56): the copy names the **folder that contains the file** — the file name is
dropped, and no ancestor is skipped for looking like a month, a run stamp or a
`split_NN`. Until 2026-10-06 the tree rule stopped at the **batch folder**
instead; that reversal is what the user asked for, and the batch folder is
reached by copying an item that sits in it. (Historical note: the batch chain
used to be found from either side of the picked root — inside the
relative path, at its head (the output folder or a month folder picked as the
root), or the root itself being one run folder — see §17. Four surfaces use it:
the Batch scan table's row action, Selection V2's "original / AI
result" buttons and Generate SVG's "open location".

### 14.3 The path is captured at pick time (2026-10-05, I-35…I-37)

Reported: *"why it build the folder path not from my selected folder directly but
ask to put my full path folder manually? make it build full path from selecting
folder to scan. and give full path of selected folder visible."* The browser is
never told the path — `showDirectoryPicker()` yields `{ kind, name }` and nothing
else; a `File` from a handle has an empty `path`, a folder `input` gives only a
path *inside* the picked folder, and `startIn`/`id` remember a dialog's folder
without reporting it. What the column of the Explorer window does have is the
path on the clipboard ("Copy as path", `Ctrl+Shift+C`), and that is what the app
now takes:

* **One way to point the app at a folder to scan**: `ui/pickroot.pickRootWithPath()`,
  used by all four tabs' pickers. It reads the clipboard before the dialog (the
  click's activation is freshest there) and once more when that read did not
  name the picked folder (the other natural orders: copy after picking, or a
  stale non-empty clipboard beside a fresh copy), then matches the text against
  the folder that was really picked: the same leaf → adopted as *copied*; a
  path one level directly inside the folder → its exact parent, *derived*
  (2026-10-09); anything else — an unrelated folder, a copied parent, a file
  path or a bare word → **nothing** is adopted (I-29: no memory beats a guess).
* **The full path is visible with the root** (I-36): the row under the controls
  shows it once known (`ui/FolderBar`, §16) and names the state the value is in —
  the path, or *full path not captured* (*completed — check it* existed until I-59). The row follows
  the storage (`ui/FolderBar.useRootPath`, a subscription), so a capture in one
  tab is visible in the other without a reload. Until 2026-10-05 this was a pill
  plus a `Full path for copies` field with a `Use copied path` button and a
  status sentence; the row replaced all three (I-44/I-45).
* The storage keeps one record per folder **handle** (`{ handle, path, how }`,
  `how = copied | derived`, persisted per handle in IndexedDB — I-63); the
  old name-keyed `{ [folderName]: path }` in `localStorage` is never read —
  a value from before this change cannot prove which folder it was for, and a
  guess may not survive as data (I-59).
* The bug the pick-time capture exposed is fixed with it: a scan commit is built
  from a state snapshot, and when React batched it with the pick's own update the
  snapshot carried the **old** (empty) root name and won — what showed the root
  fell back to "Choose source folder…". `rescan` now takes the root's name from
  the handle it just walked, which is the only authoritative source.
  Regression-tested (`selectionv2_ui`: the path row shows the picked folder after
  the mount pick).

### 14.4 The Generate SVG tab can be pointed by hand

The picker used to render only while no root existed, so a tab that had
inherited the Selection tab's remembered handle had no way to choose a folder of
its own — reported as "now it takes the path already saved in selection tab …
fix the btn so I can select the folder here manually too". The source bar
(`svg/SourceLine`, extracted from `SvgControls` for the RULE 18 budget) now
always offers the picker: the shared green `Open folder` button (I-44, §16), with
or without a root, next to the rescan and the folder's path row. Picking there
remembers the handle under this tab's own key, so the fallback is only the first
run.

### 14.6 The reviewable set is the split output, and a path is only a folder path

Two reports, one working session. First: *"the selection tab v2 also incorrectly
adding the full unsplitted batches in to the list but should not use the folder
with files that was not splitted in root man folder. It should use created folder
where this files where added like \"_*split_*output\" fix it"*. The Batch tab has
always ignored its own output (`presets.ignoreFolders = ["_split_output"]`); the
Selection tabs and Generate SVG never applied the rule — `rescan` and
`discoverApprovedSources` walked the picked folder in full, so a batch root was
listed twice: the unsplit sheet pair at the root (the batch's **input**) and one
pair per split piece inside `_split_output` (the result). Per I-38 the scope is
now decided from the tree's directories (`lib/splitscope`), the list keeps only
what is inside a split-output folder, and everything hidden is counted, said and
logged (I-40) — the sheet pair the user was told not to review is named as an
`outside-split` exclusion in Generate SVG and never written.

Second: *"why it copy svg to file path. it only for path explorer dir nothing
else. bug."* — a screenshot of the root pill and the Full-path field holding
`<svg xmlns="http://www.w3.org/2000/svg" width="25…`. The guard ran too late:
`isPathLike` judged the **normalised** text, and `normalizeRootPath` had already
turned the markup's `/` into `\`, so `…"http:\www.w3.org\2000\svg"…` looked
like a path and was stored; the field additionally stored any text at all. Per
I-39 `isFolderPathText` now judges the raw text (drive or UNC only), at the
clipboard at pick time and by the one writer, and again on read — a junk value
written by an older build counts as no memory — while the field that accepted it
by hand has since been removed altogether (I-45, §16). The app never lies about
what a copy will hand over: the path row shows the captured path or the folder's
name with *full path not captured* (I-46).
