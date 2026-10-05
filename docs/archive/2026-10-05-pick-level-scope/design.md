# Pick level, scope and the pair file's identity (2026-10-05)

Reported, verbatim:

> if user choose folder `F:\…\test_processing_2\_split_output\2026-10\2026-10-05_18-45-20`
> or `F:\…\test_processing_2\_split_output\` both return 0 items in list in
> Selection Tab or in Generate SVG tab. accept only
> `F:\…\test_processing_2\_split_output\2026-10\` but all 3 dir should gave same
> result and as it looking for the folders and files recursively and expected it
> give all same result with same list of items.

> also unable to display full folder path as folder was chosen

Two independent defects, both reaching the same user-visible result ("the list is
empty" / "the path is missing"). Research, then the fixes.

## 1. Why opening a level below the root emptied the list

The list's contents are decided in three steps: **scope** (`lib/splitscope`),
**pairing** (`lib/pairing`), **approval matching** (`selection/pairstore` +
`svg/sourcelist`). The scope step is where a recursive pick broke — and the
approval step is where a *deeper* pick broke even when the scope was right.

### 1.1 The scope was a property of the tree, not of the pick

```ts
// before (lib/splitscope.ts)
export function scopeOf(names: readonly string[], rootName: string): boolean {
  return isSplitDirName(rootName) || names.some(isSplitDirName);
}
export function inSplitScope(relPath: string): boolean {
  return relPath.split("/").some(isSplitDirName);   // "…/_split_output/…"
}
```

`directoryNames(tree)` collects every directory name at **any depth**, the root
excluded. Opening `F:\…\_split_output` therefore produced:

| pick | `directoryNames` | `scopeOf` | `inSplitScope(pair)` | list |
|---|---|---|---|---|
| `test_processing_2` | `_split_output`, `2026-10`, `2026-10-05_18-45-20`, `icon-sheet_AI`, `split_01`… | **true** | `_split_output/…` → **true** | pieces ✅ |
| `test_processing_2/_split_output` | `2026-10`, `2026-10-05_18-45-20`, `icon-sheet_AI`, `split_01`… | **true** (`rootName`) | `2026-10/…/split_01` → **false** | **nothing** ❌ |
| `…/_split_output/2026-10` | `2026-10-05_18-45-20`, `icon-sheet_AI`, `split_01`… | false | — | pieces ✅ (accidental) |
| `…/_split_output/2026-10/2026-10-05_18-45-20` | `icon-sheet_AI`, `split_01`, `split_02`, … | **true** (`<dir>_split_02` matches `/^_.*split.+output/i`) | `icon-sheet_AI/split_01` → **false** | **nothing** ❌ |

So the answer to "which pairs are in scope" depended on how deep the user
started — the exact opposite of the rule the tab documents ("the folder is
walked recursively"). Two more paths into the same wire are worth naming:

* the level-3 pick matched only by luck: `<stamp>_split_02` is a *piece* folder
  whose name matches the output-folder pattern, and a piece folder at depth 0
  would have emptied the list the same way;
* a *deeper alias* of the split folder (`…/sub/_split_output/…`, which the
  `fullPathText`/`folderCopyText` rules already tolerate) scoped the tree while
  leaving every pair outside the scope.

### 1.2 The pair file's identity was relative to the root that WROTE it

A pair file (`<stem>.svg.json`, I-41) stores the pair's identity and both faces
`relPath`s — **relative to the root that was scanned when the file was written**.
Reading was matched by that stored identity:

```ts
// before (selection/pairstore.ts, mergeRecords)
const own = toRecord(meta, pairRefOf(meta));   // pairRefOf = the STORED id + STORED paths
```

`toRecord` fills `pair_id` from `meta.id` and `ai_result` from the stored face.
The list matches an approval two ways (`svg/sourcelist.decide`): the pair id, or
the recorded `ai_result` path. Both were computed against **another root**:

| approval written at | `meta.id` = hash of | `ai_result` = |
|---|---|---|
| `test_processing_2` | `_split_output/2026-10/…/split_01` | `_split_output/2026-10/…/icon-sheet_AI_01.png` |
| pair as scanned at `…/_split_output` | `2026-10/…/split_01` | `2026-10/…/icon-sheet_AI_01.png` |

Different hash, different path ⇒ `decide()` said *not approved* ⇒ Generate SVG
(approved sources only) listed **0 rows**, and Selection showed the pieces as
**pending** although their own file right beside them said `approved`. The same
mismatch also hid the SVG version history: `Discovery.metas` is keyed by the
pair id the walk uses, while the map was keyed by the stored id.

### 1.3 What the report's own numbers say

Their three picks behaved differently because three separate inputs decide the
list: the scope (1.1), the approval match (1.2) and the pair file's location.
"Accept only the month folder" is exactly what a level-dependent answer looks
like from the outside; the fix is to make all three inputs functions of the pick
level alone (RULE 3: the answer is a function of the file set **plus** the picked
folder, never of the writing session).

## 2. Why the full path did not show

`RootPathRow` renders `null` while the captured path is unknown, and the capture
itself only succeeds when Explorer's *Copy as path* is on the clipboard **at the
moment the folder is opened** — a browser cannot read the drive. The row was
therefore correct but silent: picking a folder with nothing on the clipboard
produced no row at all, and nothing in the rebuilt UI explained why (the old
`not set — Chrome can't read the drive path…` status text was removed with the
paste field). The user reads that as "unable to display full folder path as
folder was chosen" — the folder *was* chosen, and the app said nothing.

Fix (design D3 revised): the row is **never empty once a root is open**. Known
path → the path (as before). Unknown path → a one-line, read-only hint naming
the reason and the one action that fixes it, with no control and no field:

```
Full path unknown — copy the folder in Explorer (Ctrl+Shift+C) before pressing Open folder
```

The row also stays honest about *which* folder it describes (the picked root's),
and nothing about it is clickable (no copy/paste affordance — the user's D2).

## 3. Decisions

| # | Decision | Consequence |
|---|---|---|
| D10 | **The scope is decided by the pick level.** `scopeOf(dirs, rootName)` returns a *level*: `whole` (no output below the pick — as before), `output-child` (a split-output folder sits **directly** inside the picked folder → that output is the reviewable set), `output` (the picked folder **is** a split output → the whole pick is reviewable, nothing is "outside"). | `treeDirs` replaces `directoryNames` (name **and** depth); `splitPairs`/`inScope` take the level; a pick inside the output never hides anything. |
| D11 | A piece folder that merely *looks* like an output (`<stamp>_split_02`) never scopes the tree: only a **depth-0** direct child can be the "output-child", so the accident in the table above is impossible. | one `depth === 0` predicate |
| D12 | **A pair file answers for the pair it sits beside.** `loadPairDecisions` resolves each `<stem>.svg.json` against the walk's own pairs (`metaPathFor(pair)`) and builds the record with the **walk's** id and paths; the stored identity is only the fallback for a file whose pair is not on disk (I-41: `files-missing`). | approvals, pending/declined and the SVG version history are the same at every pick level; `PairLoad.metas` is keyed by the id the walk uses (what every consumer already looked up) |
| D13 | The legacy global file keeps its role (fallback for pairs no local file answered for) and gains a **path-based** coverage check, so a legacy record written at another level cannot duplicate or contradict a pair file. | `mergeRecords` covers ids **and** the paths a record names |
| D14 | **The path row is never empty while a root is open** (§2). | `RootPathRow` gets the `rootName`; unknown → the hint line (same row testid, still text-only) |
| D15 | Rescan is untouched; so are `folderCopyText`, the copy actions and the pair-file write path (they already use the walk's paths). | no widening |

## 4. Invariants (`SYSTEM_OF_RECORD.md`)

* **I-38 — rewritten**: "the reviewable set is the batch's output" becomes
  **level-relative**: when the picked folder *is* a split output, everything
  under it is reviewable (`Scope: split output — everything under it is listed`);
  when a split-output folder is a **direct** child, that folder's pairs are the
  set and the rest (the unsplit input) is counted and reported
  (`Scope: split output only · N pair(s) in the main folder not listed`); any
  other pick reviews the whole picked folder. **The list is the same for every
  pick level of the same tree.**
* **I-44 (new) — a pair file belongs to the pair it sits beside**: its stored
  identity is a *locator*, not the current identity; the walk's paths win, so a
  decision, its SVG versions and the row all stay the same however deep the tree
  was opened, and a file whose pair is gone still answers by its stored identity.
* **I-36 (extended)**: the path row states what is known, and — while the path is
  unknown — why, with the one action that fixes it; it never becomes a control.

## 5. Files

| File | Change |
|---|---|
| `src/lib/splitscope.ts` | `treeDirs` (name + depth), `ScopeLevel`, `scopeOf` → level, `inScope(relPath, level)`, `pairInScope`, `splitPairs(pairs, level)`, three `scopeText` wordings |
| `src/selection/rootsource.ts` | passes the level through the scan; scope = `{ level, outside }` |
| `src/selection/state.ts` | `SelState.scope` type (`ScanScope`) |
| `src/selection/HeaderRow.tsx`, `src/selectionv2/SourceBar.tsx` | wording via `scopeText` (unchanged handles) |
| `src/svg/sources.ts`, `src/svg/sourcelist.ts` | scope level instead of a boolean; `selectRows(pairs, records, level)` |
| `src/selection/pairstore.ts` | D12: pair files resolved against the walk's pairs; `mergeRecords` covers ids + paths |
| `src/ui/FolderBar.tsx` | `RootPathRow({ rootName, path })` — the unknown-path hint |
| `src/selectionv2/SourceBar.tsx`, `src/svg/SourceLine.tsx` | pass `rootName` to the row |
| `src/index.css` | `.folder-path.unknown` tone |
| docs | `SYSTEM_OF_RECORD` I-38/I-44/I-36 + §14 pointers, `UI_SELECTORS` (§N row), `README` (the picking levels), `QUALITY_RECHECK` entry |

## 6. Rejected alternatives

| Alternative | Why not |
|---|---|
| Treat "the picked folder is inside a split output" as the whole scope (name-based, no depth rule) | it cannot tell the batch's output from a piece folder named `…_split_02`; the depth-0 rule makes the accident impossible |
| Keep the boolean scope and pass a `pickedIsSplitOutput` flag everywhere | two inputs that must agree by convention; a level type carries the decision once |
| Recompute the stored identity when reading (rewrite the file on read) | a scan writes nothing (I-42) and a read that mutates user files is worse than the bug |
| Match approvals by *file-stem* search across the whole tree (ignoring folders) | two folders may hold the same stem; the pair file's own location is the exact evidence |
| Show the full path in a dark hint row and also a `Copy` button | the user removed every path control (D2); the row stays read-only |

## 7. Test plan (written before the code — RULE 8)

| Test | Behaviour it pins |
|---|---|
| `tests/splitscope.test.ts` | `treeDirs` depths; `scopeOf` for the four real pick levels; the piece-folder accident; a deeper alias; the acceptance table — one tree, four picks, **one** piece list, and the input sheet hidden only where it is really mixed in |
| `tests/selection_scan.test.ts` | `rescan` at `_split_output`, at the month and at the run level lists the same pieces; the input sheet counts as outside only at the batch root; an approval written at the root still approves the pair when a deeper level is opened |
| `tests/pairstore.test.ts` | a pair file read from a deeper root yields the **walk's** id and paths; the stored identity still answers for a file whose pair is gone; the legacy fallback does not duplicate a local decision |
| `tests/selectionv2_ui.test.tsx` | the panel shows the pieces (not zero) when the picked folder is the split output / the month / the run; the scope line's wording; the unknown-path hint row |
| `tests/svg_ui.test.tsx` | the same approved pieces listed at all four levels (one row set, one pair id each), proving the cross-level approval match through the real panel |
| `tests/folderbar.test.tsx` | the row renders the path when known and the hint (still no `input`/`button`) when not |
