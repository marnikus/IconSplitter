# One folder control, one path row: the folder UI of Selection V2 and Generate SVG (2026-10-05)

The report, verbatim:

> **SELECTION V2 & GENERATE SVG — FOLDER UI FIX**
>
> **PROBLEM**
> * Folder control is unclear and displays the folder name as the button.
> * Obsolete Watcher and copied-path controls add noise.
> * Full selected path is not presented clearly.
>
> **SELECTION V2**
> * Replace the current folder control with a real green "Open folder" button.
> * Add clear hover and clickable states.
> * After selection, show the complete directory path in a new full-width row below.
> * Path is read-only text—no copy/paste input fields.
> * Remove "Use copied path".
> * Remove all related copied-path information.
> * Remove the Watcher button and its functionality.
> * Keep Rescan unchanged.
>
> **GENERATE SVG**
> * Apply the exact same folder button, path row, removals, and behavior.
>
> **ACCEPTANCE**
> * "Open folder" opens folder selection in both tabs.
> * Selected full path stays visible below the controls.
> * Watcher and copied-path UI/functionality are absent.
> * Rescan continues to work unchanged.

with two screenshots of the toolbars as they are today: V2's `_split_output`
pill beside `● Watcher active` and the `FULL PATH FOR COPIES` field with its
`Use copied path` button, and Generate SVG's `📂 Root: 2026-10` pill, its own
`Change folder…`, its own copied-path field and the scope line.

## 1. Why the controls read as noise

| What the screenshot shows | Why it is there today | Why it fails |
|---|---|---|
| `_split_output` (V2), `Root: 2026-10` (SVG) | the picker button, labelled with the folder's **name** | the label is *state*, not an action; nothing says "click to choose a folder", and the folder's name is the one thing the user already knows |
| `Change folder…` / `Choose source folder…` (SVG) | a second picker button, shown only while a root is loaded | two controls, one job, and the label changes with state |
| `FULL PATH FOR COPIES` + input + `Use copied path` + `not set — Chrome can't read the drive path; copy the folder in Explorer, then press "Use copied path"` | the File System Access API hands a page only the picked folder's **name** (I-35), so the real path was typed or adopted by hand | four pieces of chrome to explain a browser limit — for a value the app already captures by itself when the folder is picked from a clipboard that holds it |
| `● Watcher active` / `○ Watcher paused` | an interval re-scans the root every 30 s | a timer nobody asked for; `Rescan` does the same thing on demand, and a scan that writes nothing (I-22) has nothing to poll for |

Everything the user needs to see is the path itself. Everything the user needs
to *do* is pick a folder or rescan. So the fix is one button, one read-only
row, and the removals — in every toolbar that scans a folder, so the app has
one folder control rather than three variants of one.

## 2. The contract

**One control for the one job, shared by Selection (V1 and V2) and Generate SVG.**

1. **`Open folder`** — a green button, labelled exactly `Open folder` in every
   state (no `Change folder…` / `Choose source folder…` variants: the action is
   the same whether or not a folder is already loaded). It is the only control
   that opens the picker, it is always present while the tab can pick, and it
   has real `:hover`, `:active` and `:focus-visible` states. The empty state of
   each tab carries the same button in the middle of the panel.
2. **The path row** — a new full-width row directly below the toolbar, rendered
   whenever a folder is loaded. It shows the folder's **complete path** as
   read-only text (monospace, selectable text, the whole value in the `title`).
   No `<input>`, no button, no status line. Three states, never fake:
   * captured → the path, exactly as `isFolderPathText` accepted it;
   * captured by *completing* the copied parent with the picked folder's name →
     the path plus `completed — check it`;
   * never captured → the folder's **name** plus `full path not captured`.
3. **The removals** — `Use copied path`, the editable field, the
   `not set — …` note and the Watcher pill are gone from every tab. Nothing in
   the UI writes the path memory any more: the capture at pick time (the
   invisible clipboard read of I-35, which runs before and after the dialog)
   stays the single source, and the row states honestly when it found nothing.
   The Watcher goes with its state, its effect and its interval: only the user's
   `Open folder` / `Rescan` (plus the boot restore) scans.
4. **Rescan is untouched** — same handler, same label, same testid per tab
   (`sel-rescan`, `v2-rescan`, `svg-rescan`).
5. **Copy actions are untouched** — a copy still hands over a folder path
   (I-28); with a captured path it is the real Explorer path, and without one it
   keeps the folder-name fallback that already existed. The capture toast now
   reads `Folder path captured: …` instead of mentioning the clipboard, because
   the path is on screen in the row.

## 3. Module plan (RULE 18: 150–300 lines per file, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/ui/FolderBar.tsx` | **new**: `useFolderPath` (the subscribed read), `OpenFolderButton`, `FolderPathRow` | ~110 |
| `src/ui/RootPathField.tsx` | **deleted** — the field, its `Use copied path` button and its status note | 74 → 0 |
| `src/ui/userootpath.ts` | **deleted** — `useRootPath`/`useRootLabel` move into `FolderBar.tsx` | 27 → 0 |
| `src/lib/rootpath.ts` | `saveRootPath` (the manual setter) deleted; `PathHow` loses `"pasted"`; the guard, the capture and `folderCopyText` unchanged | 249 → ~230 |
| `src/lib/clipboardpath.ts` | `adoptCopiedPath` deleted (it existed only for the button); `readCopiedText` + `adoptCopiedText` stay (the pick-time capture) | 47 → ~35 |
| `src/selection/state.ts` | `SelState.watcher` removed | 262 → ~260 |
| `src/selection/useSelection.ts` | `useWatcher` + `WATCH_MS` removed | 262 → ~252 |
| `src/selection/HeaderRow.tsx` | green button + path row; the watcher pill gone | 71 → ~70 |
| `src/selectionv2/SourceBar.tsx` | green button + path row; watcher pill and field gone | 77 → ~78 |
| `src/svg/SourceLine.tsx` | green button + path row; `svg-root` pill and field gone | 71 → ~68 |
| `src/selection/SelectionPanel.tsx`, `src/selectionv2/SelectionV2Panel.tsx`, `src/svg/SvgPanel.tsx` | the empty-state pick button becomes the shared green one | small |
| `src/index.css` | `.folder-open` (+ hover/active/focus), `.folder-path`; `.v2-path-pill`, `.svg-path-pill`, `.pathfield*` deleted | small |
| `src/ui/pickroot.ts` | `pickMessage` wording: no clipboard mention | small |

Testids (`UI_SELECTORS.md` gets the same table):

| Surface | Open folder | Path row | Empty state |
|---|---|---|---|
| Selection V1 | `sel-open-folder` (was `sel-root`) | `sel-folder-path` | `sel-open-folder-empty` |
| Selection V2 | `v2-open-folder` (was `v2-root`) | `v2-folder-path` (was `v2-root-path`) | `v2-open-folder-empty` |
| Generate SVG | `svg-open-folder` (was `svg-choose-root`) | `svg-folder-path` (was `svg-root`, `svg-root-path`) | `svg-open-folder-empty` |

## 4. TDD order (red before green, per cycle)

1. `tests/folderbar.test.tsx` (**new**): the button's exact label, its
   `folder-open` class, its `onClick`; the row as read-only text — never an
   `<input>`/`<button>` — in all three states (path, folder name +
   `full path not captured`, `completed — check it`); nothing when no folder is
   loaded; a CSS guard that `src/index.css` defines the hover/active/focus
   states and no longer defines the removed classes.
2. `tests/selectionv2_ui.test.tsx`: `v2-open-folder` opens the picker with and
   without a root; `v2-folder-path` shows the name first and the captured path
   after a pick (no reload), stays free of inputs; `v2-root`, `v2-root-path*`
   and `v2-watcher` are absent; a source guard that the Selection modules no
   longer contain an interval or the word `Watcher`.
3. `tests/selection_ui.test.tsx`: `sel-open-folder` picks; `sel-folder-path`;
   `sel-watcher`/`sel-root` absent.
4. `tests/svg_ui.test.tsx`: `svg-open-folder` is present, enabled and labelled
   while a root is loaded (the reported "point it by hand" case), the row shows
   the captured path, the capture toast states the path, and the removed handles
   and wordings are gone.
5. `tests/rootpath.test.ts`, `tests/clipboardpath.test.ts`: the pasted-setter
   tests go with the setter; every guard and refusal test stays.
6. Docs (`SYSTEM_OF_RECORD`, `UI_SELECTORS`, `README`), `npm run verify`,
   `npm run quality:changed`, and the browser probe.

## 5. Verification

* `npm run verify` (6 lanes) + `npm run quality:changed` (RULE 16/18).
* The probe (real OPFS folder): in V2 and in Generate SVG — the green
  `Open folder` button opens the picker and the full path appears in the row
  below the controls; no `Watcher` and no `Use copied path`/path field exist in
  the DOM; `Rescan` still lists the same rows; and the per-pair behaviour
  verified for the previous task (one file per pair, no global file) still
  holds.

## 6. Rejected alternatives

* **Keep the name pill and add the green button beside it** — two controls for
  one job, which is the reported problem itself.
* **Keep the editable field, drop only the button** — the request says the path
  is read-only text; an input in the toolbar is what the user called noise.
* **Keep the Watcher as a stored preference without a pill** — a timer the user
  cannot see or stop, and the state would be dead code.
* **Re-read the clipboard on every rescan** — a scan must not write anything
  (I-22); the capture stays at pick time, where the user's gesture explains it.
* **Drop the path memory entirely** — every copy would fall back to the folder
  name, which is not a usable Explorer path (I-28, Task E/F).
* **A folder control per tab** — three copies of one rule (RULE 12).

## 7. Invariants

* **I-44 (one folder control, RULE 12/24):** every tab that scans a folder
  offers exactly one green `Open folder` button — always present, always with
  that label, the only way to open the picker — with real hover, active and
  focus states. The loaded folder's complete path is shown in a full-width
  read-only row below the controls: text, never an input, never a button
  labelled with the folder's name.
* **I-45 (no hidden scanning, no hidden writes, RULE 13/24):** only the user's
  `Open folder` / `Rescan` (plus the boot restore) scans a folder, and only the
  pick-time capture writes the path memory. The Watcher and every
  copied-path control are gone from the UI and from the code.
* **I-46 (the path row never lies, RULE 4):** the row shows the captured path
  word for word, or the folder's name with `full path not captured`; a path the
  app completed from a copied parent carries `completed — check it`. A copy
  action still hands over a folder path (I-28) and says what it copied.
