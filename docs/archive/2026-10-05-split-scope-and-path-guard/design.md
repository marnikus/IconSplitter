# The reviewable set is the split output, and a "full path" is only a folder path (2026-10-05)

Two reports in a row, from the same working session:

> the selection tab v2 also incorrectly adding the full unsplitted batches in to
> the list but should not use the folder with files that was not splitted in root
> man folder. It should use created folder where this files where added like
> "\_*split\_*output"

> why it copy svg to file path. it only for path explorer dir nothing else. bug.

with a screenshot of the Generate SVG source bar: the root pill reads
`📂 Root: <svg xmlns="http://www.w3.org/2000/svg" width="25…`, the **Full path
for copies** field holds the same SVG document, and the status below says
*"Nothing path-like on the clipboard"*. Both bugs are real and both are fixed
here.

## 1. What produced each symptom

### 1.1 The list used the whole picked folder, including the unsplit sheets

The Batch tab has always known about its own output tree — `presets.ignoreFolders
= ["_split_output"]`, so a batch never re-processes what it exported. The
Selection tabs and Generate SVG never applied the rule: `rescan` and
`discoverApprovedSources` both did `readDirTree(root, [])`, i.e. **everything
under the picked folder**. For a root like

```
test_processing/
  icon-sheet.png                 ← the reference (a sheet of N icons)
  icon-sheet_AI.png              ← the AI sheet, not split yet
  _split_output/2026-10/2026-10-01_10-24-31/
    icon-sheet_AI/                ← the batch's own folder for that sheet
      split_01/
        icon-sheet.png            ← the reference copy the batch writes
        icon-sheet_AI_01.png      ← the split piece
      split_02/…
```

pairing produced **two kinds of pairs**: the *unsplit sheet* pair at the root
(`icon-sheet.png` + `icon-sheet_AI.png` — the batch's input, an image the user
never wants to review or generate from) and one pair per split piece inside
`_split_output` (the reviewable result). Both were listed. The reported fix is
exactly the user's rule: when the tree contains a split-output folder, that
folder is the set; the main folder's unsplit files are not.

### 1.2 The path guard ran too late, and the field had no guard at all

`pathFromCopied` decided "is this even a path?" with `isPathLike(path)` — on the
**normalised** text, after `normalizeRootPath` had already turned every `/` into
`\`. Explorer's clipboard is the normal case (`F:\a\b`), but the app's own SVGs
are copied to the clipboard by the *Copy code* action, and an SVG document
contains `xmlns="http://www.w3.org/2000/svg"`. After normalisation that reads
`…"http:\www.w3.org\2000\svg"…`, which contains a separator, passes
`isPathLike`, and then passes `isFolderPath` too (the markup does not end in
`.ext`) — so the pick (or **Use copied path**) stored the whole SVG document as
the folder's path. That is the screenshot: the pill and the field show it
because the *storage* holds it.

The field was worse: `saveRootPath` normalised and stored **any** text at all, so
pasting markup (or a URL, or a sentence) into the field made it the remembered
"full path" — and from then on every copy action prefixed it. There was no
validation on read either, so the bad value survived reloads.

A "full path" in this app means one thing: the Explorer path of the folder that
was picked. Nothing else may ever be stored.

## 2. The contract

### 2.1 Scope (invariant I-38)

* A directory is a **split-output folder** when its name matches
  `/^_.*split.+output/i` — the app's own `_split_output` and tolerant variants
  (`_split_output_v2`, `_my_split_output`). The rule is about the folder, not the
  file names, because `icon_AI.png` is a legitimate single-icon AI result in the
  ordinary (non-batch) workflow and must keep working.
* The scope is decided **from the tree**, not from its contents: if such a
  folder exists anywhere under the picked root, or the picked root's own name
  matches, the scope is "inside a split-output folder"; otherwise the scope is
  the whole root (a folder that never saw a batch behaves exactly as before).
* In scope, Selection V1/V2 and Generate SVG list **only** pairs with a side
  inside a split-output folder.
* Out-of-scope pairs are **reported, never silently dropped** (the rule from
  2026-10-05 stands): both Selection toolbars state the scope and the count
  (`sel-scope`, `v2-scan-scope`), the scan logs it, and the Generate SVG list reports
  every out-of-scope approved source as an `outside-split` exclusion in its
  banner, so an approval can never look as if it vanished.
* Nothing is written: decision records of out-of-scope pairs stay where they are
  (they are kept as orphans, as they already were), and a later scan of a folder
  without a split tree lists them again.

### 2.2 The path guard (invariant I-39)

* `isFolderPathText(text)` accepts exactly what Explorer can hand over:
  a drive path (`F:`, `F:\`, `F:\a\b`, forward slashes and surrounding quotes
  forgiven), or a UNC path (`\\server\share`, `\\server\share\folder`).
  It refuses everything else: SVG markup, URLs, `hello`, a relative
  `history\more`, a file-looking tail, Windows-forbidden characters
  (`< > " | ? * :` outside the drive's own colon, control characters).
* The guard runs at **all three** entry points: the clipboard adoption at pick
  time, the **Use copied path** button, and the field's own save. A refused value
  is not stored, and the UI says so: the field shows *"That is not a folder path
  — paste the folder's path, e.g. F:\work\icons"* (the pill keeps showing the
  folder name, so the app never lies about what a copy will hand over).
* The guard also runs **on read**: a stored value that is not a folder path is
  treated as no memory, so a bad value written by an older build cannot poison
  the pill, the status or any copy.
* `Use copied path` keeps its honest messages: an unusable clipboard answers
  *"Nothing path-like on the clipboard — copy the folder in Explorer first"*.

### 2.3 What the UI shows

| Surface | Before | After |
|---|---|---|
| Selection V1 `sel-scope` | — | "Scope: split output only · 12 pair(s) in the main folder are not listed" or "Scope: whole folder (no `_split_output` found)" |
| Selection V2 `v2-scan-scope` | "Recursive · subfolders included" | the same two states (the id is not `v2-scope` — the bulk bar already owns that, for "across N visible pairs") |
| Generate SVG `svg-warn-excluded` | exclusions only from the source rules | also names the out-of-scope approved sources ("… not in the split output") |
| Generate SVG audit (`svg-audit`, log) | files · AI sources · references · missing · duplicates → rows | the same line; out-of-scope sources are part of the reported exclusions |
| Full path field `svg/v2-root-path-note` | three states | plus the refusal: "That is not a folder path — …" |

## 3. Module plan (RULE 18: 150–300 lines per file, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/lib/splitscope.ts` | **new, pure**: the folder-name rule, the tree's directory names, the scope decision, the pair filter + the outside count | ~60 |
| `src/lib/rootpath.ts` | `isFolderPathText`, the guard in `saveRootPath`/`pathFromCopied`/`loadRootPathInfo`; `isPathLike`/`isFolderPath` deleted | 219 → ~235 |
| `src/selection/state.ts` | `SelState.scope` (`{ split: boolean; outside: number }`) + `initialSelState` | +6 |
| `src/selection/rootsource.ts` | the scan applies the scope, records it and logs it | +12 |
| `src/selection/HeaderRow.tsx` | the V1 scope line (`sel-scope`) | +6 |
| `src/selectionv2/SourceBar.tsx` | the V2 scope line (`v2-scan-scope`) replaces the static "Recursive" note | ±4 |
| `src/svg/sourcelist.ts` | `selectRows(pairs, records, scoped)` → out-of-scope pairs become `outside-split` exclusions | +12 |
| `src/svg/sources.ts` | computes the scope from the walked tree | +6 |
| `src/ui/RootPathField.tsx` | refuses a non-path save with its own note | +10 |
| `src/index.css` | no change needed: the V2 line reuses `.v2-recursive`, the V1 line Tailwind's muted text, the refusal note the existing `.pathfield-note.warn` | +0 |

## 4. TDD order (red before green, per cycle)

1. `tests/splitscope.test.ts` (**new**): the matcher accepts the app's folder and
   tolerant variants and refuses near-misses (`split_output`, `_splitoutput`,
   `_output_split`); the scope decision from a tree (nested, root-as-scope, none);
   the pair filter keeps the split pieces and drops + counts the sheet pair.
2. `tests/rootpath.test.ts` (extend): `isFolderPathText` — accepts drive/UNC/
   quoted/forward-slash forms, refuses markup, URLs, words, relative paths,
   illegal characters, a file-looking tail; `saveRootPath` refuses junk and still
   clears on `""`; `loadRootPathInfo` forgets a stored junk value;
   `pathFromCopied` refuses markup and URLs.
3. `tests/clipboardpath.test.ts` (extend): adopting markup or a URL writes
   nothing.
4. `tests/selection_scan.test.ts` (extend): a root with sheets + `_split_output`
   lists only the split pairs, reports the outside count, keeps the outside
   pairs' records (nothing lost), and a root without a split folder is unchanged.
5. `tests/svg_sources.test.ts` (extend): only in-scope approved sources are rows;
   an approved sheet at the root is an `outside-split` exclusion with its reason.
6. UI: `tests/svg_ui.test.tsx` (the field refuses markup, a URL and a word with
   its note, keeps the folder name on the pill, and can still be cleared),
   `tests/selectionv2_ui.test.tsx` + `tests/selection_ui.test.tsx` (the scope
   line, and the sheet pair absent from the list).
7. Docs (`SYSTEM_OF_RECORD`, `UI_SELECTORS`, `README`), `npm run verify`, the
   browser probe.

## 5. Verification (done)

* `npm run verify` (6 lanes) + `npm run quality:changed` (RULE 16/18): ALL LANES
  PASSED — 80 files / 786 tests, coverage 97.16 | 92.05 | 97.35 | 98.5, build
  648.34 kB / 191.88 kB gzip (`/tmp/verify18.log`).
* The headless-Chromium probe on a root that has **both** the unsplit sheets and
  the batch output (real OPFS handles, so the tree survives IndexedDB and both
  tabs share it): **18/18 green** — V2 lists only the split pieces and says why;
  the pieces were approved through the UI and Generate SVG listed exactly those
  two, while an approved sheet outside the scope appeared as an `outside-split`
  exclusion with its reason; SVG markup on the clipboard at pick time and typed
  into the field stored nothing and the field said why; a row's copy still handed
  over the batch folder (`…\_split_output\2026-10\2026-10-01_10-24-31`).
* The audit the user asked for earlier must stay consistent: rows + reported
  exclusions account for every approved source.

## 6. Rejected alternatives

* **Filter by file name (`_AI` with a piece suffix = "split", plain `_AI` =
  "sheet").** A plain `court_AI.png` is the ordinary single-icon result and must
  keep working; the difference between a sheet and a single icon is not in the
  name. The folder the batch created is the only honest marker.
* **Ignore the main folder entirely (`ignoreFolders` on the Selection scan).**
  `readDirTree`'s ignore list cannot express "only inside that subfolder", and
  ignoring by name would also hide the split folders' own contents.
* **Delete or rewrite the out-of-scope decision records.** They are the user's
  review history; hiding them from the list is the report, losing them is not.
* **Refuse the whole scan when the tree has no split folder.** A user reviewing a
  plain folder (no batch involved) must keep working; the pre-existing behaviour
  stays for that case.
* **Validate the path only where it is used (at copy time).** The screenshot is
  the counter-example: the bad value was already visible in the pill and the
  field. The guard belongs where the value is written and where it is read.
* **Accept a "best effort" path when the clipboard holds markup (e.g. take the
  first `X:\…` substring).** Guessing a drive and folder chain out of unrelated
  text is how a copy ends up pointing at a folder the user never picked.

## 7. Invariants

* **I-38 (scope, RULE 3/24):** when the picked tree contains a folder whose name
  matches `/^_.*split.*output/i` (or the picked folder is one), Selection V1/V2
  and Generate SVG list only pairs inside such a folder; the main folder's
  unsplit files are not reviewable and not generatable. The scope is a function
  of the tree's directories, so a repeated scan is identical, and every
  out-of-scope item is counted and reported in the UI and the log — never
  silently dropped. A tree without such a folder behaves exactly as before.
* **I-39 (the path guard, RULE 13):** the value remembered for a root is either
  an Explorer-usable **folder** path (drive or UNC) or nothing at all. It is
  validated at every entry point (clipboard, field, storage read), so markup,
  URLs, relative text and file names can never be stored, replayed or shown as
  the root's path — and the field says why it refused.
* **I-40 (scope is visible, RULE 12):** both Selection toolbars state the scope
  and, when the scope hides pairs, the count of what is not listed; the Generate
  SVG list reports the same as exclusions. A user never has to guess why the list
  is shorter than the folder.
