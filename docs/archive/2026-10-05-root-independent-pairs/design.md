# The same folder picked as a different root: identity, scope evidence and the full path (2026-10-05)

The report, verbatim:

> if user choose folder
> `F:\Stocks 2026\icons testing\single\test_processing_2\_split_output\2026-10\2026-10-05_18-45-20`
> or `F:\Stocks 2026\icons testing\single\test_processing_2\_split_output\`
> both return 0 items in list in Selection Tab or in Generate SVG tab.
> accept only `F:\Stocks 2026\icons testing\single\test_processing_2\_split_output\2026-10\`
> but all 3 dir should gave same result and as it looking for the folders and files
> recursively and expected it give all same result with same list of items.
> **2bug** also unable to disply full folder puth as folder was chosen.

The three folders are one tree: `test_processing_2` is the batch's main folder,
`_split_output` its output root, `2026-10` the month, `…\_18-45-20` one run.

## 1. What the three picks did (measured, not reasoned)

Headless Chromium 153, a real OPFS tree with **two runs**
(`_split_output/2026-10/{2026-10-05_18-45-20 (2 pieces), 2026-10-05_19-02-11 (1)}`),
the real path on the clipboard, the app's own picker, the post-`1ba64b8` build:

| Picked | Selection V2 rows | Scope line | Generate SVG rows (approvals made from the MAIN folder) |
|---|---:|---|---:|
| the run folder | 2 | `Scope: split output only` | **0** |
| `_split_output` | 3 | `Scope: split output only` | **0** |
| `2026-10` | 3 | `whole folder — no split output found` | **0** |
| `test_processing_2` (main) | 3 | `split output only · 1 pair(s) in the main folder not listed` | 3 |

The path row, for the run folder, under four clipboard states:

| Clipboard at pick time | What the row showed |
|---|---|
| the run folder's own path | `…\_split_output\2026-10\2026-10-05_18-45-20` ✓ |
| nothing | `2026-10-05_18-45-20` + `full path not captured` |
| **the batch folder** (`…\_split_output`) | `…\_split_output\2026-10-05_18-45-20` ✗ — **the month segment is missing** |
| a same-named folder elsewhere (`D:\other\2026-10`) | `D:\other\2026-10\2026-10-05_18-45-20` ✗ |

So the reported "0 items" has **two different causes**, and the path row has one:

### RC1 — the scope read only relative paths (fixed in `1ba64b8`)

`splitPairs` kept a pair only when one of its relative segments was the output
folder, so a picked output folder filtered itself out and reported "2 pair(s) in
the main folder not listed" — a folder that is not inside the picked root. Fixed
by `ScopeRule { split, hideOutside }` (I-47): hide only while the output folder is
strictly **below** the root. The run-folder and `_split_output` picks now list 2
and 3 rows (the numbers above).

### RC2 — a pair file's identity and paths are ROOT-relative (the Generate SVG 0)

`<AI stem>.svg.json` is written beside its images (I-41) but records the pair's
`dir`, both faces and the id **relative to the root that was picked when it was
written** (`pairId(dirPath, base, suffix)`). Approve a piece while the root is
`test_processing_2` and the file says
`_split_output/2026-10/<run>/icon-sheet_AI/split_01`; pick `_split_output` next
and the same physical folder is `2026-10/<run>/icon-sheet_AI/split_01`, so

* the freshly scanned pair gets a **different id** → the decision does not match,
  Selection shows it pending again, and
* the record's `ai_result` names a path that does not exist from this root → the
  SVG tab counts it as `missing files` and lists **0 rows** (audit above:
  `3 AI sources · 3 references excluded · 3 missing files → 0 rows`).

The same folder, picked as a different root, must be the same pair — the file
sits **with** its images, so the file's own location is the truth.

### RC3 — "no split output found" for a month folder that IS the output

`scopeOf` recognised only `_split_output` and a run stamp by name. `2026-10`
matched neither, so the one pick the user called "accepted" also printed the
plain-folder line. Evidence for "this set is a batch output" is a **run stamp
anywhere** in the picked set (the root's own name or a directory below it).

### RC4 — the full path shown after a pick can be wrong

The capture is clipboard-only (I-35), and when the copied text's leaf is not the
picked folder's name the app appends that name and flags `completed` — one
segment, right for a direct parent, **wrong for a grandparent** (the third row
above) and wrong for a same-named folder elsewhere (the fourth). With an empty
clipboard there is nothing to show. Since the app remembers the folders it has
picked (the handle) and their captured paths, it can *derive* the exact path:
`FileSystemDirectoryHandle.resolve(picked)` answers "is this folder inside one I
already know?", so the descendant's path is the ancestor's path plus the
segments `resolve()` returns.

## 2. The rules

**I-49 — a pair file describes the pair where the file sits.** Every read of a
pair file rebases it onto the current root: `dirPath` = the file's own directory,
each face's `relPath` = that directory + the face's stored file **name**, and the
id recomputed with `pairId(dirPath, base, suffix)`. A decision therefore follows
the folder, whatever root it is read from, and the paths it hands to the scope,
the list and the writers always resolve. `lib/pairmeta.rebaseMeta` owns it;
`selection/pairstore.loadMetaAt` is the one place that applies it, so every
reader (walk, undo, generation reload) sees a current-root record.

**I-50 — the scope's evidence is a run stamp.** `scopeOf` reports `split: true`
when the picked folder is an output folder (`_split_output`, tolerant variants),
**or any name in the set is a run stamp** (`<YYYY-MM-DD_HH-mm-ss>` — the root's
own name or a directory below it); `hideOutside` stays true only when an output
folder (`_split_output`) is strictly below the root. All of the run / output /
month / main picks therefore name the same set the same way and list the same
pairs (a run folder lists its own run — the same list whenever the month holds
one run, as in the report).

**I-51 — the full path of a picked folder comes from a folder this app already
picked.** `ui/knownroots` remembers every folder picked with a captured path
(this session, plus the handles the tabs restore at boot). On a pick, the
clipboard match stays the first source; when it yields nothing usable — nothing
at all, or only a `completed` guess — the app tries
`known.resolve(picked)`: a non-null answer gives the **exact** path
`<known path>\<segments>` and is stored as captured (`how: "copied"`), because it
is derived from a real handle relationship, not from text. Only when neither
source can name the folder does the row state `full path not captured`.

## 3. Module plan (RULE 18: 150–300 lines per file, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/lib/pairmeta.ts` | **new** `rebaseMeta(meta, dirPath)` (identity + both faces), ~20 lines | 276 → ~300 |
| `src/selection/pairstore.ts` | `loadMetaAt` rebases onto the file's own directory | 304 → ~306 |
| `src/lib/splitscope.ts` | `scopeOf`: `split` = output name **or** a run stamp in the set | 85 → ~88 |
| `src/ui/knownroots.ts` | **new**: `rememberKnownRoot`, `knownRoots()`, `deriveRootPath(handle)` | ~55 |
| `src/ui/pickroot.ts` | the derivation fallback; remembers each captured pick | 66 → ~80 |
| `src/selection/rootsource.ts`, `src/svg/scan.ts` | remember the restored root (handle + captured path) at boot | +2 each |

## 4. TDD order

1. `tests/pairstore.test.ts` — a pair file written under root A is read under
   root B: same decision, id/paths rebased, both faces named, corrupt still
   corrupt.
2. `tests/svg_scan.test.ts` — approvals made while the root was the MAIN folder,
   then `scanSources` on the `_split_output` root: rows listed, **no**
   `ai-missing`/`no-files`, and the same three pairs under the month root.
3. `tests/selection_scan.test.ts` — the same cross-root read shows the decision
   (`approved`, not `pending`) after rescanning from `_split_output`.
4. `tests/splitscope.test.ts` — the month root reports `{ split: true,
   hideOutside: false }`, and all four picks agree on `split`.
5. `tests/knownroots.test.ts` (new) — derivation: a descendant resolves to
   `ancestor + segments`; the deepest known ancestor wins; `resolve` null/throw,
   a handle that is not a directory and an empty path all fall back to nothing.
6. `tests/pickroot.test.ts` — an empty clipboard **and** a `completed` guess both
   yield the derived exact path (`how: "copied"`); with no known ancestor the
   behaviour is exactly as before.
7. `tests/selectionv2_ui.test.tsx` — the DOM proof: pick the output folder, then
   pick the run folder with **nothing on the clipboard** → the path row shows the
   complete path; and the list is the same from both roots.
8. `npm run verify`, `npm run quality:changed`, and the probe of §1 re-run with
   the expectations of §5.

## 5. Verification (the probe of §1, after the change)

| Check | Expected |
|---|---|
| the three picks, Selection V2 | 2 / 3 / 3 rows, all three `Scope: split output only` |
| the three picks, Generate SVG | 3 rows each for output/month, 2 for the run folder; no `missing files`, no `ai-missing` |
| the same list | the run folder's pairs are a subset of the month's; the month (one run) equals the output root's |
| the path row, run folder, empty clipboard | `…\_split_output\2026-10\2026-10-05_18-45-20` |
| the path row, run folder, batch folder copied | the same exact path (derived), no `completed` warning |
| the path row, run folder, a same-named folder elsewhere copied | the derived exact path wins |

## 6. Rejected alternatives

* **Write root-relative paths away — store absolute paths.** The browser never
  knows one (I-35/§14), and a stored absolute path would break the moment the
  folder moves — which is exactly what the pair file is designed to survive.
* **Match records by file name only.** Two runs of the same sheet have pieces
  with the same names in different folders; a name-only match approves the wrong
  piece.
* **Recompute ids from the file's location at *write* time only.** The id in the
  file is right for the root that wrote it; the reader is what must rebase —
  writes already use current-root paths.
* **Derive the path from the picked folder's name plus the remembered path of any
  folder with that name.** Same-named folders in different trees exist (the
  report's own `_split_output` could be one) — that is what produced the wrong
  row in §1.
* **Hide the path row's warning instead of deriving.** Keeps a path on screen
  that does not exist; the row must never lie (I-46).

## 7. As shipped (the same day)

The plan held; four things were decided while implementing it, each because a
test or a measurement said so.

1. **The legacy file still finds its pair after rebasing.** I-49 recomputes the
   id from the file's own directory, so a pair file that *carried* an id no scan
   of this root computes (a legacy-era record) no longer covered that record —
   `tests/legacyfile.test.ts` went red. `pairstore.loadPairDecisions` now keeps
   the id each file carried (`MetaRead.storedId` → a `carried` map) and lets it
   answer for the legacy record, in both directions: a record only that id names
   is suppressed, and a file with no decision still lets it through (I-42).
2. **Boot remembers the restored root** (`rootsource.boot`, `svg/scan.bootSources`):
   the handle the tab restores plus its captured path become a known folder, so
   the *second* pick in a session — and the first pick after a reload — is named
   exactly. Both are covered by a new test in `selection_scan`/`svg_io` (the svg
   file's existing in-memory handle store, mirrored into `selection_scan`).
3. **The pair-file modules were split by concept, not by size** (RULE 19 step 4):
   the gate failed `lib/pairmeta.ts` (309 lines) and `selection/pairstore.ts`
   (334) against RULE 18's 300-line ideal, and neither is in the ratchet baseline.
   `lib/pairrebase.ts` (the I-49 rebase) and `selection/pairrecord.ts` (the
   record ⇄ pair-file mapping: `metaForRecord`, `metaFor`, `metaPathOf`,
   `metaFromRecord`, `locatable`, `identityOfPaths`) came out; both files are now
   under the ideal (286 / 232) with no behaviour change.
4. **The fixture, not the algorithm, was the first failure.** The real API is
   `parent.resolve(child)`; the first tests put `resolve` on the *picked* folder.
   Every derivation returned `null` for a reason that had nothing to do with the
   module. `tests/helpers/fakefs.FakeDir.resolve` now implements the real
   semantics (`[]` for itself, `null` when not below) so a test can construct the
   ancestor that answers.

### The measured result (headless Chromium, real OPFS)

Two-run tree: run `2026-10-05_18-45-20` (2 pieces) + run `2026-10-05_19-02-11`
(1 piece) under `_split_output/2026-10/`:

* Selection V2 — run / `_split_output` / month / main → **2 / 3 / 3 / 3** rows,
  every scope line `Scope: split output only`, main adding
  `· 1 pair(s) in the main folder not listed` (unchanged, I-38/I-40).
* Generate SVG after approving on the main pick — run / `_split_output` / month →
  **2 / 3 / 3** rows, audits `0 missing files`, no `outside-split`, no `ai-missing`.
* One-run tree, the three roots, **empty clipboard** → the same 2 pairs in all
  three, each with its exact full path.
* Path row (run folder) under four clipboard states — exact path copied, nothing
  copied, the batch folder copied, a stale folder of the same name elsewhere →
  the **exact** run path in all four (I-51 overrules the guess; the flagged
  completion survives only when no known folder can place the pick).

Probe: `/tmp/probeenv/probe_three_roots.mjs`; screenshots
`/home/user/run-folder-derived-path-v2.png`, `/home/user/single-run-three-roots.png`.
Verified: `npm run verify` (84 files / 872 tests, coverage, build) and
`npm run quality:changed` both pass — see `docs/current/QUALITY_RECHECK.md`.

