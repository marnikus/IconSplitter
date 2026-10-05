# Folder UI — Selection V2 & Generate SVG (2026-10-05)

Reported: *"Folder control is unclear and displays the folder name as the button.
Obsolete Watcher and copied-path controls add noise. Full selected path is not
presented clearly."* Requested outcome, verbatim:

* a real green **Open folder** button in both tabs, with clear hover and
  clickable states;
* after selection, the **complete directory path** in a new **full-width row
  below** the controls — read-only text, no copy/paste input field;
* `Use copied path` gone, "and all related copied-path information" gone;
* the **Watcher** button gone, "and its functionality";
* **Rescan unchanged**.

## 1. What was wrong

| Surface | Before | Why it read as unclear |
|---|---|---|
| Selection V2 `SourceBar` | `.v2-path-pill` **button** whose whole label *is* the root's label (`split_root`, or the full path once captured) | the click target is a text blob — nothing says "this opens a folder", and the pill grows to 380 px |
| Generate SVG `SourceLine` | a `<span>` pill `📂 Root: …` **plus** a second button `Change folder…` / `Choose source folder…` | two elements for one action, and the folder name sits in the non-button |
| both tabs | `ui/RootPathField` | a paste field + `Use copied path` + a status sentence per state — three more controls beside the picker, and a place to type a path by hand |
| both tabs | a Watcher pill | a 30 s auto-rescan toggle nobody asked for, sharing the row with Rescan (RULE 10 noise) |
| both tabs, empty state | the centre note repeated the picker button | two controls for one decision |

The path itself: the File System Access API hands the page `{ kind, name }` only
(`SYSTEM_OF_RECORD` §14.3), so the *complete* path can only ever come from the
clipboard captured at pick time. That capture stays — it is the feature, not the
noise. What goes is every trace of it in the UI.

## 2. Decisions (user-confirmed, 2026-10-05)

| # | Decision | Consequence |
|---|---|---|
| D1 | **State, not control**: the folder name is never a button label. One green `Open folder` button per tab; the picked path is shown as plain text. | the pills are deleted (`.v2-path-pill`, `.svg-path-pill`) |
| D2 | The path is a **read-only, full-width row directly below** the control row (`v2-root-path` / `svg-root-path`), no input, no button, no copy affordance. | `RootPathField.tsx` deleted; `saveRootPath(name, text)` (the manual writer) deleted with it |
| D3 | **No path → no row** (user chose "hide"). The row is a statement about a known path, never a placeholder. | `RootPathRow` returns `null` for `""`; the green button stays visible so the next pick can fill it |
| D4 | A copied path is adopted **only when its leaf is exactly the picked folder's name** (user chose "exact matches only"). The old "completed from the parent, check it" guess is removed. | `pathFromCopied` returns `string`; `PathHow` (`copied\|completed\|pasted`) and its status wording are gone |
| D5 | The pick-time clipboard capture is **kept and silent**: no toast mentions the clipboard, `pickMessage` is deleted, the row appearing *is* the report (RULE 2 stays satisfied — the global log still records the capture). | `pickroot` returns the handle; no caller says a path message |
| D6 | The **Watcher is removed everywhere** (user chose "remove everywhere"): state field, 30 s timer, both pills. | `useWatcher` + `WATCH_MS` deleted; `SelState.watcher` deleted; `sel-watcher` / `v2-watcher` gone |
| D7 | **Rescan is untouched** — same handle, same wording, same disabled-during-scan behaviour in both tabs. | the new button is a *sibling* of Rescan, never a replacement |
| D8 | Both tabs share **one component file** for the button and the row. | `src/ui/FolderBar.tsx` (`OpenFolderButton`, `RootPathRow`) |
| D9 | Scope is the two named tabs. Selection V1 keeps its `sel-root` button; it only loses the Watcher. | no picker redesign in `selection/HeaderRow.tsx` |

## 3. Invariant deltas (`SYSTEM_OF_RECORD.md`)

* **I-35** — capture unchanged in spirit (clipboard read before the dialog, once
  more only if empty, never invented). **Tightened**: adoption requires an exact
  leaf match (D4); the app no longer completes a parent path.
* **I-36** — *rewritten*: the full path is shown in **one read-only row under the
  control row** of Selection V2 and Generate SVG (`v2-root-path` /
  `svg-root-path`), live from the store, hidden while unknown. No pill, no field,
  no status sentence, and nothing to press.
* **I-37** — *retired*: there is no `Use copied path` and no paste field, so the
  "Chrome can't read the drive path" explanation has no control left to explain.
  The number stays in the record (RULE 17: numbers are stable, never renumbered)
  with a pointer here.
* **I-30** — *strengthened*: each tab still has exactly one picker control; the
  duplicate button in the empty-state notes is removed.
* Watcher: `SelState.watcher`, `useWatcher`, `WATCH_MS`, `sel-watcher`,
  `v2-watcher` no longer exist (D6). Rescan, its ticket (`lib/scanseq`) and the
  scope announcement are untouched.

## 4. Storage

`iconSplitter.rootpaths.v1` keeps one entry per folder name. New writes store a
bare normalized path string; older `{ path, how }` objects and the oldest bare
strings are still **read** (validated by `isFolderPathText`, invalid ⇒ no
memory, RULE 13). `how` is no longer read, written or displayed — nothing in the
UI distinguishes a captured path from any other remembered path any more.

Dropping `how` also drops the legacy `completed` values' "check it" warning.
That is deliberate and safe: those values were already displayed as the root's
path before this change, and the remembered path is exactly what the copy
actions (`folderCopyText`) use. A user who never copied the folder keeps an
empty memory — the row then stays hidden (D3) and copies fall back to the folder
name, unchanged from today.

## 5. Rejected alternatives

| Alternative | Why not |
|---|---|
| Keep the paste field but style it read-only | a read-only `<input>` still looks editable and keeps the "type a path" contract the user removed |
| Keep `Use copied path` as a small icon button | it is the second entry point into the same memory; D2/D4 make it redundant, and the user asked for it gone |
| Keep the Watcher on Selection V1 | V1 and V2 share `useSelection`: hiding the pill would leave the 30 s timer running (the exact "functionality" the acceptance forbids) |
| Keep completing a copied parent folder into `parent\name` | the user chose exact matches only; a guessed drive path shown as fact is worse than no row (I-29: no memory beats a guess) |
| Show a placeholder row ("full path unknown") | user chose "hide" — the row states a fact, it does not explain an absence |
| A green button in the empty-state note as well | two controls for one decision (I-30); the note keeps the sentence, the toolbar has the button |

## 6. Files

| File | Change |
|---|---|
| `src/ui/FolderBar.tsx` | **new**: `OpenFolderButton` (green, hover/active/focus states) + `RootPathRow` (returns `null` when the path is unknown) |
| `src/ui/RootPathField.tsx` | **deleted** (field, `Use copied path`, status text) |
| `src/ui/pickroot.ts` | returns the handle; `pickMessage` + `capturedPath` deleted |
| `src/ui/userootpath.ts` | `useRootPath(name): string`; `useRootLabel` deleted |
| `src/lib/rootpath.ts` | `pathFromCopied` exact-match `string`; `PathHow`/`RootPathInfo`/`saveRootPathInfo`/`saveRootPath`(manual) deleted; `saveRootPath(name, path)` keeps the one validated write |
| `src/lib/clipboardpath.ts` | `adoptCopiedText` returns `string`; `adoptCopiedPath` deleted |
| `src/selectionv2/SourceBar.tsx` | green button + Rescan + scope chip; path row below; watcher/pill/field gone |
| `src/svg/SourceLine.tsx` | green button + Rescan + scope/audit; path row below; pill/field gone |
| `src/selection/{state,useSelection,HeaderRow,SelectionPanel,rootsource}.ts(x)` | watcher removed |
| `src/svg/actions.ts`, `src/batch/useBatch.ts` | pick returns the handle, no path message |
| `src/svg/SvgPanel.tsx`, `src/selectionv2/SelectionV2Panel.tsx` | empty-state duplicates removed; props |
| `src/index.css` | `.folder-open` (+ hover/active/focus-visible), `.folder-path`; `.pathfield*`, `.v2-path-pill`, `.svg-path-pill` deleted |
| docs | `SYSTEM_OF_RECORD.md` (I-30/35/36/37, watcher, UI inventory, module map), `UI_SELECTORS.md` §N, `README.md` archive row, one `QUALITY_RECHECK.md` entry |

## 7. Test plan (written before the code — RULE 8)

| Test | Behaviour it pins |
|---|---|
| `tests/folderbar.test.tsx` (new) | the button is a real `<button>` labelled `Open folder` that fires its handler; the row renders the path **as text** (no `input`, no `button` inside), wraps rather than truncates, and renders nothing for `""` |
| `tests/selectionv2_ui.test.tsx` | pick → the row shows the **full** path captured at pick time and stays after a rescan; no row while unknown; no `v2-root-path` input, no `-use` button, no `v2-watcher`; Rescan still picks up a new file |
| `tests/svg_ui.test.tsx` | same for `svg-open-folder` / `svg-root-path`; the picker stays offered with a root loaded; a parent-folder copy is refused (row absent, memory empty) |
| `tests/rootpath.test.ts` | exact-leaf adoption; parent path refused; legacy `{path, how}` and bare-string payloads still read; invalid payloads still rejected |
| `tests/clipboardpath.test.ts` | adoption writes the exact path and leaves junk alone |
| `tests/pickroot.test.ts` | one pre-read before the dialog, one post-read only when the first was empty; cancel/failed pick read nothing more; the handle always survives a clipboard failure |

Every new production function has a test that fails when it is deleted
(`OpenFolderButton`, `RootPathRow`, `pathFromCopied`, `adoptCopiedText`).
