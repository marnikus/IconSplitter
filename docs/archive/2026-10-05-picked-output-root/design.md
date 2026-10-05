# Picking the batch's own output folder: `…\_split_output\` or one run folder inside it (2026-10-05)

The report names the two folders a user is most likely to pick once a batch has
run:

```
F:\Stocks 2026\icons testing\single\test_processing_2\_split_output\2026-10\2026-10-05_18-45-20   (a run folder)
F:\Stocks 2026\icons testing\single\test_processing_2\_split_output\                             (the batch root)
```

Both are folders the app itself created, both are what a human opens in Explorer,
and both are what a **copy action** hands over — so the picked-folder rules have
to work when the output tree is the root, not only when it sits somewhere below
it.

## 1. What the two picks did before this change (measured, not reasoned)

Headless Chromium 153, a real OPFS tree
(`probe_root/test_processing_2/_split_output/2026-10/<stamp>/icon-sheet_AI/split_0N/`),
the path on the clipboard, Selection V2:

| Picked | Rows | Scope line | A copy handed over |
|---|---:|---|---|
| the **run folder** | 2 ✓ | `Scope: whole folder — no split output found` | `…\2026-10-05_18-45-20\icon-sheet_AI\split_02` |
| the **`_split_output` folder** | **0 ✗** | `Scope: split output only · 2 pair(s) in the main folder not listed` | *(no row to copy from)* |

Two defects, one cause each:

1. **The scope filter is root-blind.** `lib/splitscope.splitPairs` kept a pair
   only when one of its **relative** path segments was the split-output folder.
   That is right when the output folder is *below* the root
   (`test_processing_2`, relPath `_split_output/2026-10/…`) and wrong when the
   output folder **is** the root: the relative paths are then
   `2026-10/<stamp>/…`, no segment matches, so every pair was filtered out and
   reported as "in the main folder" — a folder that is not even inside the
   picked root. Generate SVG had the same hole: all approved pairs became
   `outside-split` exclusions and the list was empty.
2. **The batch folder is only found below the root.** `lib/rootpath.folderCopyText`
   looks for `_split_output/<month>/<stamp>` *inside the relative path*. With the
   output folder as the root (or a run folder as the root) that chain is above
   the root, so the copy fell back to "the item's own folder" and handed over a
   deeper folder (`…\icon-sheet_AI\split_02`) than I-28 promises — the batch
   folder a human opens in Explorer.

The scope *words* were wrong for the run-folder pick as well: the folder **is**
the batch's output tree, and the toolbar called it "whole folder — no split
output found".

## 2. The rules that replace them

**Scope (I-47).** The scope is a decision about **the set the picked folder
defines**, not about a segment of every relative path:

```
scope = { split:       the set is a split output (the folder is one, is a run stamp, or holds one)
        , hideOutside: the split output is strictly BELOW the picked root
        }
```

* `_split_output` as the root → `split: true`, `hideOutside: false`: the whole
  picked folder **is** the reviewable set; nothing is "in the main folder",
  because the main folder is above the root and was not picked.
* a run stamp as the root → the same: `split: true`, `hideOutside: false`.
* `test_processing_2` (the tree holds `_split_output`) → `split: true`,
  `hideOutside: true`: the unsplit sheets at the root are the batch's input and
  stay out, counted and reported (I-38/I-40 — unchanged).
* anything else → `split: false`, `hideOutside: false` (unchanged).

**Copy (I-48).** The batch folder is found from **either side of the root**:
the relative path may carry the output chain (`_split_output/<month>/<stamp>` —
unchanged), or the chain may start at the root (`<month>/<stamp>/…`), or the
root itself may be the run folder (`<stamp>`). All three stop the copy at the
run folder; a root that only *looks* similar keeps the folder chain of the item,
exactly as before.

Both rules are decided from **names** (RULE 3): the same folder picked twice
behaves the same, no scan is needed to know what a copy will hand over, and the
one owner of "what the app's own output layout looks like" is the new
`lib/batchlayout.ts` — `_split_output` (tolerant variants), `<YYYY-MM>`,
`<YYYY-MM-DD_HH-mm-ss>` — imported by both `lib/rootpath` and `lib/splitscope`
instead of each repeating the patterns.

## 3. Module plan (RULE 18: 150–300 lines per file, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/lib/batchlayout.ts` | **new**: `isSplitDirName`, `isMonthName`, `isRunStamp`, `OUTPUT_DIR` — the one owner of the output layout's names | ~25 |
| `src/lib/splitscope.ts` | `scopeOf` returns `ScopeRule { split, hideOutside }`; `splitPairs` takes it; `isSplitDirName` re-exported so callers/tests keep one import | 76 → ~90 |
| `src/lib/rootpath.ts` | `folderOf(relPath, rootName)`: the three root shapes; `MONTH`/`STAMP`/`OUTPUT_DIR` come from `batchlayout` | 242 → ~235 |
| `src/svg/sourcelist.ts` | `selectRows(..., hideOutside)` — the flag's real meaning, no second guess | +1 |
| `src/svg/sources.ts`, `src/selection/rootsource.ts` | pass `rule.hideOutside` instead of the old `scoped` boolean | small |

## 4. TDD order

1. `tests/splitscope.test.ts` — the rule object, and the case that was broken:
   picking `_split_output` keeps **every** pair and hides none; picking a run
   stamp says `split: true`; the tree-with-output case keeps hiding the sheets.
2. `tests/selection_scan.test.ts` — a scan whose root **is** `_split_output`:
   both pieces listed, `scope === { split: true, outside: 0 }`.
3. `tests/svg_scan.test.ts` — an approved pair under a `_split_output` root is a
   **row**, with no `outside-split` exclusion.
4. `tests/rootpath.test.ts` — the three copy shapes (root above the output
   [unchanged], root = `_split_output`, root = month, root = run stamp), plus the
   near-miss cases that must not change.
5. `tests/selectionv2_ui.test.tsx` — the DOM proof for the reported picks: rows
   listed and a scope line without "not listed" for the output folder, and the
   batch folder in the copy toast.
6. `npm run verify`, `npm run quality:changed`, and the same browser probe run
   again (before/after numbers in `QUALITY_RECHECK.md`).

## 5. Invariants

* **I-47 (picking the output folder is picking the set, RULE 3/12):** when the
  picked folder is the app's own output folder (`_split_output`, tolerant
  variants) or one run folder inside it (`<YYYY-MM-DD_HH-mm-ss>`), every pair
  found below it is reviewable — nothing is reported as "in the main folder",
  because the main folder is above the picked root — and the scope line names
  the set (`Scope: split output only`). The filter that hides the unsplit sheets
  applies **only** when the output folder is strictly below the picked root.
* **I-48 (the batch folder is the folder a human opens, RULE 4):** a copy stops
  at the run folder whether the output chain is inside the relative path, starts
  at the root, or **is** the root; a folder that merely resembles the layout
  (a `split_01` folder, `_split_output/latest`, a `2026-10` folder that holds no
  run) keeps the item's own folder, as before.
