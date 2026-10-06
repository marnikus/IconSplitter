# The picked folder's full path, captured at pick time (2026-10-05)

> "why it build the folder path not from my selected folder directly but ask to
> put my full path folder manually? make it build full path from selecting folder
> to scan. and give full path of selected folder visible."

## 1. The honest answer: the browser is never told the path

This is not a limitation of this app — no web page can read it. `showDirectoryPicker()`
resolves with a `FileSystemDirectoryHandle` whose **only** identity is
`{ kind: "directory", name: "test_processing" }`: the drive letter and every
folder above the picked one are deliberately withheld (spec:
`FileSystemHandle` has `kind` + `name`, nothing else; a page that could read
absolute paths could fingerprint the user's disk layout). The neighbouring APIs
do not close the gap either:

| Attempt | What it really gives |
|---|---|
| `showDirectoryPicker()` / `getDirectoryHandle()` | a handle: `name` + contents. No path, ever |
| `File` from `handle.getFile()` | `name`, `size`, `lastModified` — and an **empty** `path` (Electron had to file a feature request for it, and the answer is still "no" for FSA handles) |
| `<input webkitdirectory>` / dropping a folder | `webkitRelativePath`: the path **inside** the picked folder (`test_processing/2026-10/a.png`), never the drive prefix |
| `showDirectoryPicker({ id, startIn })` | remembers which folder the dialog opens in, per origin — it does not report it back |
| `chrome.fileSystem.getDisplayPath` | Chrome-Apps-only, removed; not on the web |

So the app cannot *derive* the path from the pick. What it **can** do is capture
it from the thing the user already has in hand at that moment — Explorer's
"Copy as path" (`Ctrl+Shift+C`) puts the real path on the clipboard — and stop
asking them to type it. Reported as "it asks me to put my full path manually".

## 2. The contract

1. **One way to pick a scan root: `ui/pickroot.pickRootWithPath()`.** It reads
   the clipboard *before* opening the dialog (the click's activation is freshest
   there), opens the picker, then reads the clipboard a second time only if the
   first read was empty (a denied or unimplemented clipboard never breaks the
   pick). Every tab's "choose folder" goes through it.
2. **The captured text is matched against the folder that was actually picked**
   (`rootpath.pathFromCopied(copied, folderName)`), never trusted blindly:
   * the copied path's **leaf equals the picked folder's name** (case-insensitive,
     quotes / forward slashes / trailing separator forgiven) → adopted as-is:
     `F:\Stocks 2026\icons testing\single\test_processing`;
   * it is a **folder path whose leaf is something else** — the user copied the
     parent it lives in, or a sibling — → the picked name is appended and the
     result is adopted, marked **completed** so the UI can say "check it":
     `F:\Stocks 2026\icons testing\single` + `test_processing`;
   * it names a **file** (`…\icon-airplane-landing.png`) or is not a path at all
     ("hello", "icon_AI") → **nothing is adopted**; nothing is invented (I-29
     stands: no memory is better than a guess).
3. **The full path is visible wherever the root is.** The root pill shows the
   full path once one is known (`svg-root`, `v2-root`) instead of only the
   folder's name, the field shows the same string, and the field's status line
   distinguishes the three states: *copied/typed* → "✓ every copy uses this
   path"; *completed* → "completed from the copied folder — check it"; *unknown*
   → "not set — Chrome can't read the drive path; copy the folder in Explorer,
   then press 'Use copied path'".
4. **`Use copied path`** (a button beside the field, `svg-root-path-use` /
   `v2-root-path-use`) applies the same rule on demand — for when the user
   copies the path *after* picking, which is the other natural order. Its
   feedback is explicit: adopted, completed, or "Nothing path-like on the
   clipboard".
5. Adoption is announced: `Full path taken from your clipboard: <path>` (or
   `… completed from the copied folder: <path> — check it`). A repeat pick that
   changes nothing stays quiet.
6. The memory stays `iconSplitter.rootpaths.v1`, one entry per folder name,
   shared by every tab; stored values gain a `how` field
   (`"copied" | "completed" | "pasted"`), and a **legacy string value is read as
   `pasted`** so nothing written before this change is lost.
7. `folderCopyText` is untouched: the copy still names a folder, with the full
   path when known and the folder name alone when not (I-28).

## 3. Module plan (RULE 18: 150–300 lines per file, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/lib/rootpath.ts` | `pathLeaf`, `pathFromCopied`, `RootPathInfo`/`how`, `loadRootPathInfo`, `saveRootPathInfo`, a write-revision + subscriber so the pill updates the moment a path is captured, legacy-string migration | 101 → 219 |
| `src/lib/clipboardpath.ts` | **new**: the guarded clipboard read (`readCopiedText`), the one-shot "read, match, save" (`adoptCopiedPath`) and the pure `adoptCopiedText` | 41 |
| `src/ui/pickroot.ts` | **new**: `pickRootWithPath()` (the clipboard read around `pickDirectory()`, the match, the save) and `pickFolderFor()`, the whole step every caller uses | 62 |
| `src/ui/userootpath.ts` | **new**: `useRootPath`/`useRootLabel` — the storage as a live React value (`useSyncExternalStore`) | 25 |
| `src/ui/RootPathField.tsx` | storage is the one source of truth, the three status lines, the `Use copied path` button | 36 → 85 |
| `src/svg/SourceLine.tsx`, `src/selectionv2/SourceBar.tsx` | the root pill shows the full path when one is known | 76 / 73 |
| `src/svg/actions.ts` | picks through `pickFolderFor`, logs the capture, says the one line | 285 |
| `src/selection/rootsource.ts` | **new**: boot / pick / rescan moved out of `useSelection` — the RULE 18 ceiling was reached (299 lines) and the pick added to it | 93 |
| `src/selection/useSelection.ts` | the flow now comes from `rootsource` | 294 → 232 |
| `src/batch/outcomes.ts` | **new**: the item → status records and the run tally, moved out of `useBatch` (299 → 279) | 38 |
| `src/index.css` | `.pathfield` gains the button + the two status colours | +16 |

### 3.1 The race the capture exposed (found by test, fixed with it)

Making the pick chain one step longer (a clipboard read after the dialog) made the
Selection V2 suite fail with an empty list — a real bug, not a test artefact:
`rescan` builds its next state from `ctx.state.current`, a **render mirror**, and
when React batched the pick's own update with the scan commit, the snapshot taken
before the pick won, so `rootName` went back to `""` (the pill fell back to
"Choose source folder…"). `rootsource.rescan` now takes the root's name from the
handle it just walked — the only authoritative source — and a regression test
states it (`selectionv2_ui`: after the mount pick the pill shows the folder).

## 4. TDD order (red before green, per cycle)

1. `tests/rootpath.test.ts` (extends): `pathLeaf`; `pathFromCopied` — exact leaf
   match through quotes / trailing separator / forward slashes / case, the
   parent-completion case, the rejection of a file path and of a non-path,
   UNC; `loadRootPathInfo` states and legacy-string migration; the revision
   notified on save.
2. `tests/clipboardpath.test.ts` (new): adopt + save + revision; no clipboard
   API → "none"; a rejected read → "none"; a copied parent → `completed`;
   junk → "none", nothing written.
3. `tests/pickroot.test.ts` (new): the pick adopts the clipboard path; the
   pre-read is used when the post-read is unavailable; a cancel returns null and
   writes nothing; a clipboard read that fails at pick time still returns the
   handle.
4. `tests/svg_ui.test.tsx` / `tests/selectionv2_ui.test.tsx`: the pill shows the
   remembered full path; a pick with a copied path shows it in the pill, the
   field and the status line; `Use copied path` adopts on demand; the unknown
   state explains *why*.
5. Docs (`SYSTEM_OF_RECORD` §14.3, `UI_SELECTORS`, `README`), then `npm run verify`
   and the browser probe (both tabs: the pill shows the real path after a pick,
   the copy hands over `<path>\set_A`, and the unknown state shows the reason).

## 5. Verification

* `npm run verify` (6 lanes) + `npm run quality:changed` (RULE 16/18).
* The headless-Chromium probe: a clipboard stub holding
  `F:\Stocks 2026\icons testing\single\test_processing`, then **Choose folder** —
  the pill must show that string, a row's Location action must put
  `…\test_processing\set_A` on the clipboard, and with an unrelated clipboard the
  pill must show the folder name with the "Chrome can't read the drive path"
  status (the app answers the question, it does not hide it).
* The negative cases are asserted, not assumed: a copied file path and a copied
  non-path are both refused by unit tests, so no invented path can reach a copy.

### 5.1 Results (2026-10-05)

* Tests: `tests/pickroot.test.ts` (6, new), `tests/clipboardpath.test.ts` (6,
  new), `tests/rootpath.test.ts` (+9: `pathLeaf`, the four `pathFromCopied`
  outcomes incl. UNC and the refusals, the `how` record + legacy-string read,
  the revision/subscriber contract), `svg_ui` (+2 pick/status tests and the
  field's new wording), `selectionv2_ui` (+2, one of them the race). Whole suite:
  **79 files / 763 tests, all green**.
* `npm run quality:changed`: GATE PASSED. Two files had crossed the RULE 18
  ceiling with the change (`useSelection` 302, `useBatch` 305) and were split, not
  squeezed: `selection/rootsource.ts` (boot/pick/rescan + `pruneChecked`) and
  `batch/outcomes.ts` (item → status records + tally).
* Headless-Chromium probe (`/tmp/repro2/probe_path.mjs`, 1440×900, real clipboard
  stub, 22 checks, all green) on a fake root with three approved pairs:

  | Scenario | Result |
  |---|---|
  | pick with `"F:\Stocks 2026\icons testing\single\test_processing\" ` on the clipboard | pill `📂 Root: F:\…\test_processing`, field the same string, status "✓ every copy uses this path", toast "Full path taken from your clipboard: …", memory `{"test_processing":{"path":"F:\…","how":"copied"}}` |
  | a row's copy action | clipboard `F:\Stocks 2026\icons testing\single\test_processing\set_A` — folder, full path, backslashes |
  | pick with `hello` on the clipboard | nothing stored, pill `📂 Root: test_processing`, status "not set — Chrome can't read the drive path; copy the folder in Explorer, then press "Use copied path""; the button then answers "Nothing path-like on the clipboard" |
  | pick with the **parent** on the clipboard | field completed to `…\test_processing`, status "completed from the copied folder — check it" |
  | Selection V2 pick, then the Generate SVG tab | both pills show the captured path (no reload) |
  | layout with the long path in the bar | toolbar 107 px, rows band 606 px, dock 237 px; across 3 scroll positions per tab: 0 controls under the dock, 0 blocked hit-tests |

## 6. Rejected alternatives

* **Scan `C:`…`Z:` for a folder with that name.** A page cannot list drives; the
  "search" would be a blind guess, could match the wrong `test_processing` and
  would put a wrong path into every copy. Refused (I-29).
* **Read `webkitRelativePath` and prefix it with the remembered root.** It is
  relative to the picked folder, so the prefix is exactly the thing that is
  unknown — circular.
* **Keep asking the user to type the path (status quo).** That is the report.
  The clipboard already carries it at the moment of the pick.
* **Adopt any clipboard text at pick time.** The path must name the picked
  folder (or be completed from its parent); an unrelated path silently pasted
  into the memory would make every later copy wrong. A bare word is refused too
  (pinned by a test: `pathFromCopied("hello", …)` and `pathFromCopied(ROOT, …)`
  both yield nothing) — a name with no drive would make a copy look
  authoritative while naming nothing.
* **Store the path per handle in IndexedDB instead of per folder name.** Handles
  do not survive a move/rename of the folder either, and the existing
  folder-name memory is what the copy actions already read (I-29).

## 7. Invariants

* **I-35 (the pick captures the path, RULE 4/13):** every way of pointing the app
  at a folder to scan — the three tabs' pickers — goes through
  `ui/pickroot.pickRootWithPath()`, which captures the picked folder's real path
  from the clipboard when that text names the folder (exactly, or completed from
  its parent) and remembers it. The app never invents a path: text that does not
  name the folder is not stored, and what was captured is stated to the user.
* **I-36 (the path is visible, RULE 12):** wherever a root is shown, its
  full path is shown with it once known — the root pill itself, the field, and a
  status line that says which of the three states the value is in (*copied or
  typed*, *completed from the copied folder — check it*, *not set*). A user never
  has to open a dialog to find out what a copy will hand over.
* **I-37 (the browser boundary is stated, RULE 9):** the reason the app cannot
  read the drive itself ("Chrome can't read the drive path") is written in the
  UI next to the action that fixes it (`Use copied path`), instead of leaving the
  user to wonder why they are asked for something the app "should" know.
