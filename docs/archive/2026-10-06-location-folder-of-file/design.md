# "Location" names the folder of the file, never the run's folder (2026-10-06)

Feature: every copy-path action in the app copies the **folder that contains the
file it was invoked on**. The earlier rule — "inside a batch output tree the copy
stops at the batch folder" (I-48) — is reversed by the user, verbatim:

> the location copied to clip board to file is incorrect now:
>
> `F:\Stocks 2026\icons testing\single\test_processing_2\_split_output\2026-10\2026-10-05_18-45-20`
>
> but full path is
>
> `F:\Stocks 2026\icons testing\single\test_processing_2\_split_output\2026-10\2026-10-05_18-45-20\icon-bunny-face_AI_7\split_04`
>
> to the file `icon-bunny-face_AI_7_04_v2.svg` for exple.
>
> fix it.

## 1. The two defects

| # | Defect | Where | Why it was invisible |
|---|---|---|---|
| 1 | The copy truncates at the run folder `…/<month>/<stamp>`, so a file three folders deeper is reported one level up | `lib/rootpath.ts` → `folderOf()` → `batchEnd()`/`runEnd()` | it was the SPECIFIED behaviour (I-48, 2026-10-05) — the user has now reversed it |
| 2 | The Generate SVG **Location** action joins `row.source.dirPath` onto `svgPath`, which is already root-relative, so the path it hands over is doubled (`…/split_04/…/split_04/<file>`) | `svg/codeactions.ts` → `openLocation` | the truncation in (1) collapsed the doubled chain, so the wrong string never reached the clipboard |

The second defect is why a "small" change to (1) alone would have produced
`…\icon-bunny-face_AI_7\split_04\icon-bunny-face_AI_7\split_04` — one level too
deep — instead of the user's path. Both are fixed together, and the test for (2)
exists so the doubling can never hide again.

## 2. The rule

`folderCopyText(rootName, relPath)` — one function, every copy action:

1. normalise the remembered root path exactly as before (quotes off, `/` → `\`,
   no doubled separators, no trailing separator, `F:` joins as `F:\x`);
2. **drop the last segment** of `relPath` — the file name — and keep everything
   above it: that is the containing folder. No segment is ever removed for being
   a month folder, a run stamp or a `split_NN` folder;
3. an empty result is the root itself (`FolderBar`'s own contract, and a file
   sitting directly in the root);
4. still **never a file name** (I-28), still backslashes, still nothing invented
   when no full path was captured.

`svg/codeactions.openLocation` hands over **exactly the file the row names** —
`targetPathOf(row)`, the same string `svg-target-{id}` displays (the shown
version's path; before anything is generated, the path the next SVG will be
written to). One helper, so the row's text and the copy's folder cannot drift
apart again.

## 3. Reversal

* **I-48** ("a copy stops at the batch folder — the folder a human browses") is
  **replaced** by **I-56**: *a copy names the folder of the file it was invoked
  on; the batch folder is reached by copying the run folder's own item.* The
  earlier reading came from an example that only ever showed a sidecar directly
  inside a run folder; the user's real tree is
  `…/<stamp>/<piece>/split_NN/<file>`, and there the useful folder is `split_NN`.
* `rootpath.batchEnd`/`runEnd` and their `batchlayout` imports go: with the rule
  above they are dead weight, and their removal is what makes the fix small
  enough to read (RULE 18).

## 4. Files

| File | Change | Size |
|---|---|---|
| `src/lib/rootpath.ts` | `folderOf` = containing folder; `batchEnd`/`runEnd` deleted; `batchlayout` import dropped | ~370 → ~350 |
| `src/svg/rowmodel.ts` | **new** `targetPathOf(row)` — the file a row's target line names | 114 → ~125 |
| `src/svg/SvgRow.tsx` | its local `targetPath` is replaced by `targetPathOf` (one implementation, RULE 10) | 203 → ~200 |
| `src/svg/codeactions.ts` | `openLocation` copies the folder of `targetPathOf(row)` — no join, no doubling | 120 → ~118 |
| `tests/rootpath.test.ts` | the two batch-truncation cases become the containing-folder cases; the user's exact path is a case | — |
| `tests/copypath.test.ts` | the split-tree expectation and its toast text | — |
| `tests/svg_location.test.tsx` | **new**: the Location button end-to-end on the user's own tree (v2 shown, v1 chosen, no version yet) | — |

## 5. TDD order

1. `tests/rootpath.test.ts` — the new expectations, including the user's exact
   `…\2026-10-05_18-45-20\icon-bunny-face_AI_7\split_04` string, for the PNG, its
   `.svg.json` sidecar and the versioned `_v2.svg` (red).
2. `tests/copypath.test.ts` — the copy and its toast name that folder (red).
3. `tests/svg_location.test.tsx` — the real panel on the user's tree: Location
   copies `…\split_04` and never the run folder; the shown version decides the
   FILE, never the folder; a pair with no version yet still gets its own folder
   (red).
4. Implement (2) then (1), re-run, then the full lane set (RULE 16).

## 6. Rejected

* **Copying the file name too.** Reversed twice by the user: the action feeds
  Explorer, which takes folders.
* **Keeping the batch-folder rule for the Batch tab only.** The three tabs are
  one rule by design (`copyFolderText` exists so they cannot drift); a per-tab
  exception is how the drift started.
* **Copying the run folder from a `split_NN` row ("one level up is what I meant").**
  The user's example names `split_04` explicitly, and a folder the user did not
  ask for is worse than the one they did.
* **Deriving the folder from `svgPath`'s parent instead of fixing `openLocation`.**
  The doubling would remain, and the *next* consumer of `svgPath` would trip on it.
