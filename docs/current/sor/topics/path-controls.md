# Folder control and output-root scope

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## 16. One folder control, one path row (2026-10-05, I-44…I-46)

The report, verbatim: *"Folder control is unclear and displays the folder name as
the button. Obsolete Watcher and copied-path controls add noise. Full selected
path is not presented clearly."* Full record:
`archive/2026-10-05-folder-bar/design.md`.

Three toolbars carried three variants of one control: Selection V1's
`Root: {name}` button, V2's `v2-path-pill`, Generate SVG's `📂 Root: {label}`
span beside its own `Change folder…` / `Choose source folder…` button. Every one
of them was labelled with **state** — the folder's name, or the path once
captured — rather than with the action, and every one was followed by a
`Full path for copies` field with a `Use copied path` button and a status
sentence explaining why the browser cannot read the drive. V2 additionally
carried a `Watcher` pill that re-scanned the root every 30 s.

All three now mount one shared control, `ui/FolderBar`:

* `Open folder` — the same words in every state, the same green button class
  (`folder-open`, with `:hover`, `:active` and `:focus-visible` states in
  `index.css`), and the only control that opens the picker. It is offered whether
  or not a root is loaded (I-30), and each tab's empty state shows the same
  button (`sel-open-folder-empty` / `v2-open-folder-empty` /
  `svg-open-folder-empty`).
* `sel-folder-path` / `v2-folder-path` / `svg-folder-path` — a full-width,
  read-only row directly below the controls: the complete captured path in
  monospace text, whole value in its `title`, selectable like any text. No input,
  no button, no status line; the states are the path, and the folder's name plus
  `full path not captured` (I-46; the `completed — check it` state was removed
  with the completion, I-59).
* Removed with it: `ui/RootPathField` (the field, the `Use copied path` button,
  the note), `ui/userootpath` (the live read lives in `ui/FolderBar`),
  `lib/rootpath.saveRootPath` (the field's own setter, and `PathHow` loses the
  `pasted` variant), `lib/clipboardpath.adoptCopiedPath` (the button's action —
  `readCopiedText` + `adoptCopiedText` stay, they are the pick-time capture), and
  the Watcher with its state and effect (`SelState.watcher`,
  `useSelection.useWatcher`, `WATCH_MS`).
* The pick-time capture (I-35) is untouched and is now the **only** writer of the
  memory: `ui/pickroot.pickRootWithPath` still reads the clipboard before and
  after the dialog, matches it against the folder that was really picked, and
  never invents a path. Its toast now says `Folder path captured: …`, because
  the path itself is on screen in the row.
* Rescan is unchanged in all three tabs (same handlers, labels and testids), and
  copies are unchanged (I-28): the real folder path when one was captured, the
  folder-name fallback otherwise.

## 17. Picking the batch's own output folder (2026-10-05, I-47/I-48)

The report names the two folders a user is most likely to pick after a batch:

```
…\test_processing_2\_split_output\2026-10\2026-10-05_18-45-20   (one run)
…\test_processing_2\_split_output\                                (the batch root)
```

Both are folders the app created, and both are what a copy hands over — but the
scope filter read only the **relative** paths, so a picked output folder filtered
itself out. Measured (headless Chromium, real OPFS tree, Selection V2, the path
on the clipboard):

| Picked | Rows before | Scope before | Copy before |
|---|---:|---|---|
| the run folder | 2 | `whole folder — no split output found` | `…\…_split_output\2026-10\2026-10-05_18-45-20\icon-sheet_AI\split_02` |
| `_split_output` | **0** | `split output only · 2 pair(s) in the main folder not listed` | *(no row to copy from)* |

After the fix the same probe reads, for **both** picks: 2 rows in Selection V2,
2 rows in Generate SVG (`Audit — 6 files · 2 AI sources · 2 references excluded ·
0 missing files · 0 duplicates removed → 2 rows`, no `outside-split`), scope
`Scope: split output only`, and a copy that hands over the file's own folder —
since I-56 that is `…\<piece>\split_NN`, not the run folder. Design:
`archive/2026-10-05-picked-output-root/design.md`.

Two rules carry it. **Scope (I-47)** is now a decision about the set the picked
folder defines, not a segment of every relative path:
`lib/splitscope.scopeOf` returns `{ split, hideOutside }` — `split` when the
folder is an output folder, a run stamp, or holds one; `hideOutside` **only**
when the output folder lies strictly below the root (the `test_processing_2`
case, which keeps hiding and counting the unsplit sheets, I-38/I-40).
**Copy (I-48, replaced by I-56 on 2026-10-06)** used to find the batch folder from
either side of the root: the chain inside the relative path, the chain at the
head of it (`<month>/<stamp>` when `_split_output` or a month is the root), or
the root being one run folder. Since I-56 the root plays no part in the answer:
the copy names the containing folder of the file it was given. A near-miss
(`split_01`, `_split_output/latest`, a `2026-10` folder that holds no run) keeps
the item's own folder, exactly as before.

`lib/batchlayout.ts` is the one owner of the layout's names — `_split_output`
(tolerant variants), `<YYYY-MM>`, `<YYYY-MM-DD_HH-mm-ss>` — imported by
`lib/rootpath` and `lib/splitscope` instead of each repeating the patterns;
`svg/sourcelist.selectRows` takes `hideOutside` under its real name.

## 18. The same folders under any root (2026-10-05, I-49…I-51)

The report compares three picks of one batch:

```
…\test_processing_2                                   (the main folder — today's behaviour)
…\test_processing_2\_split_output                     (the batch root)
…\test_processing_2\_split_output\2026-10\<stamp>     (one run)
```

"all 3 dir should gave same result and same list of items" and "also unable to
display full folder path as folder was chosen". Measured on the two-run tree of
the probe (`probe_three_roots.mjs`, real OPFS, both tabs):

| Picked | Rows before | Scope before | Generate SVG before | Path row before |
|---|---:|---|---:|---|
| one run | 2 | `split output only` | **0 rows** (`2 missing files`) | exact |
| `_split_output` | 3 | `split output only` | **0 rows** (`3 missing files`) | exact |
| the month `2026-10` | 3 | `whole folder — no split output found` | **0 rows** (`3 missing files`) | exact |
| `test_processing_2` | 3 | `split output only · 1 pair(s) not listed` | *not measured (the baseline)* | exact |

After the fix, on the same tree: the run lists **2** pairs, `_split_output` and
the month list **3** (the same items — every pair below the pick), every scope
line reads `Scope: split output only` without "not listed", and Generate SVG
lists 2 / 3 / 3 rows with `Audit — 9 files · 3 AI sources · 3 references excluded
· 0 missing files · 0 duplicates removed → 3 rows` — no `outside-split`, no
`missing files`. The main folder is unchanged by design (I-38/I-40): the unsplit
sheet stays hidden **and counted** ("1 pair(s) in the main folder not listed").

Three causes, one per invariant. **A pair file written under another root** was
read with the paths and the id it was written with, so the pairs a scan of this
root found never matched those decisions and every approved source looked
missing (I-49 — I-49's rebase makes the file speak for the pair it sits beside).
**The scope filter recognised only `_split_output` as evidence**, so a month
folder — which is not an output dir but holds run stamps — fell back to "whole
folder", which then hid the pieces as if they were the main folder's sheets
(I-50). **The path row** completed a partial clipboard path by appending the
picked folder's name, which *dropped* every segment between the copied folder and
the pick (the month, in the report) and could just as well append the name to a
stale path of the same name elsewhere (I-51 — the app derives a path only from a
folder it already named, via `resolve()`, and never from a guess).

Scope of the change: `lib/pairrebase.ts` (new), `selection/pairrecord.ts` (new —
the record ⇄ pair-file mapping moved out of `pairstore`), `lib/pairmeta.ts`
(`rebaseMeta` moved out), `selection/pairstore.ts` (the read rebases; the id each
file carried still answers the legacy file), `lib/splitscope.ts` (run-stamp
evidence), `ui/knownroots.ts` (new), `ui/pickroot.ts`, `selection/rootsource.ts`
and `svg/scan.ts` (boot remembers the restored root). Design:
`archive/2026-10-05-root-independent-pairs/design.md`.
