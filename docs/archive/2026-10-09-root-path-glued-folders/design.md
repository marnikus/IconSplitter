# The Full path that glued two folders together — a guess yields to evidence (I-59)

Date: 2026-10-09. Report (two screenshots of the SVG-to-upload folder bar):

> user opens a new folder to parse; it parses correctly but the Full path
> preview does not change to the correct one — concatenates? Chosen folder
> `F:\Stocks 2026\icons testing\single\test_process_3`, shown as
> `F:\…\single\test_processing_2\_split_output\2026-10\2026-10-08_18-46-23\icon-bank-institution_AI_10\split_03\export\test_process_3`.
> It then impacts incorrect location copy folder path of files.

The list was right — the scan used the real handle. Only the path was wrong,
and every "copy folder path" made from a file in the new root inherited it
(`lib/rootpath.folderCopyText` = remembered root path + the file's folder, I-56).

## 1. Measured cause

The pick (`ui/pickroot.pathForPick`) reads the clipboard and asks
`lib/rootpath.pathFromCopied(copied, pickedName)`. Its "parent + name"
completion trusts **any** folder path whose leaf is not the picked name: it
appends the picked name and files the result as `completed`. In the report the
clipboard held the **app's own** last copy — `copyFolderText` of an export
folder deep inside the previous root (`…\split_03\export`) — so the completion
produced `…\export\test_process_3`. The derivation from a known root (I-51)
could not overrule it: `test_process_3` is a *sibling* tree, so the known
root's `resolve()` answered `null`, and the code treated `null` ("not below
me") the same as a thrown error ("cannot say") — it kept the guess. The guess
was then **saved before** the derivation ran, keyed by the folder's name, and
`Rescan` (`ui/rootcapture.retryCapture`) only re-reads when the stored path is
empty, so the wrong value could never be repaired by the one button the row
names. Only a fresh Explorer `Ctrl+Shift+C` + `Ctrl+V` fixed it.

Three breaches of the rules, one root: a guess was treated as a capture.

| Breach | Rule |
|---|---|
| A path the app wrote itself was read back as if Explorer had copied it | RULE 13 — an unanswerable question stays unanswered |
| A definite "not below me" (`resolve() === null`) was ignored as if unknown | RULE 4 — honest about what is known |
| A flagged guess was not reconsidered by `Rescan` | RULE 12 — the way out the UI names must work |

## 2. Decisions (I-59 — a guess yields to evidence)

* **D1 — the app's own copy is never completed.** `lib/copypath.copyFolderText`
  remembers the text it last wrote (`lastCopiedByApp()`, session state). The
  picker still adopts that text when it names the picked folder **exactly** (it
  is a real folder path), but never completes a guess from it.
* **D2 — a known root can veto a completion.** `ui/knownroots.provenOutside`
  answers true when the copied folder lies under (or is) a known root's path
  **and** that root's own `resolve(picked)` returned `null`. `resolveSegments`
  now distinguishes `"outside"` (null) from `"unknown"` (no `resolve`, a throw);
  only a definite answer vetoes. `deriveRootPath` is unchanged in behaviour.
* **D3 — settle, then write.** `pathForPick` orders its sources: exact clipboard
  → derivation → believable completion → nothing; nothing is stored before the
  answer is settled, so a wrong completion is never written and then overruled.
* **D4 — `Rescan` reconsiders a completion.** `retryCapture` re-reads for a root
  whose path is empty **or** `completed`; an exact leaf match replaces the
  guess, anything else leaves it as it was. The SVG-to-upload tab's `Rescan`
  now calls `retryCapture` like the other two tabs (I-52 said all three did).
* **Unchanged:** the completion itself stays, flagged `completed — check it`,
  when nothing the app knows contradicts it (I-51's last clause) — refusing it
  outright would take the path away from the one case it serves (a first pick
  with the parent folder copied). No new control, no new storage key.

## 3. Owner files

`src/lib/copypath.ts` (+`lastCopiedByApp`), `src/ui/knownroots.ts`
(`provenOutside`, `resolveSegments` tri-state), `src/ui/pickroot.ts`
(`pathForPick` order, `believable`), `src/ui/rootcapture.ts` (`settled`),
`src/upload/actions.ts` (`rescan` → `retryCapture`).

## 4. TDD steps (all red first)

1. `tests/knownroots.test.ts` — `provenOutside`: true under a known root whose
   `resolve` says null (case/trailing-separator tolerant); false for a sibling
   prefix, for a root that contains the pick, for no `resolve`/throw/no path.
2. `tests/pickroot.test.ts` — the reported concatenation refused (path `""`,
   toast names `Ctrl+Shift+C`); the app's own copy never completed, still
   adopted when exact.
3. `tests/rootcapture.test.ts` — `retryCapture` replaces a `completed` guess
   with an exact match; keeps it when the clipboard cannot name the folder.
4. `tests/upload_ui.test.tsx` — end to end in the tab the report came from:
   the old root's export folder on the clipboard + a sibling pick → the row
   shows the folder name with `full path not captured`, never the glued path;
   `Rescan` turns `completed — check it` into the exact path.
