# Copy a folder, not a file — and give it the picked folder's real full path (2026-10-05)

Feature: every "copy path" action in the app copies a **folder**, as a Windows
full path with backslashes, and the picked root's full path is a value the user
supplies once and the app remembers. Plus: the Generate SVG tab gets its own
"Change folder…" button, so its root can be picked there instead of only being
inherited from the Selection tab.

Two things were wrong, and one of them is a browser fact rather than a bug:

1. **The copy names a file.** `copyPathText` wrote `rootName\relPath` (Selection,
   Generate SVG) and the Batch tab wrote `rootName/relPath` — the item's file
   path, with the Batch one not even using backslashes. The user wants the
   *folder*, because that is what you paste into Explorer to go look at it.
2. **The copy has no drive and no ancestors.** A browser's File System Access
   API tells the page only the picked folder's **name** (`test_processing`), for
   privacy. Nothing in the web platform exposes `F:\Stocks 2026\icons
   testing\single\test_processing`, so the prefix cannot be read — it has to be
   told to the app once.

The user's own example, verbatim:

```
*split*output\2026-10\2026-10-01_10-24-31\icon-airplane-landing_AI_9\split_02\icon-airplane-landing.svg.json
…
like
F:\Stocks 2026\icons testing\single\test_processing\_split_output\2026-10\2026-10-01_10-24-31
```

and, when asked how the full path should be found:

> i set up full path by selecting folder first it should take full path as i
> selecting the folder than remember full path after saving the root
>
> fix the btn so i can select the folder here manualy too. now it takes the path
> already saved in selection tab. but i what it be select here by user also
> manually.

## 1. Reading of the request (what the example fixes)

| Question | Answer used | Why |
|---|---|---|
| What is copied? | a **folder**, never a file name | "change path copy to folder only not to file itself" |
| Which folder? | inside a batch output tree, the **batch folder** (`_split_output/<YYYY-MM>/<stamp>`); otherwise the file's own folder | the example ends at `…\_split_output\2026-10\2026-10-01_10-24-31`, not at `…\split_02` — the folder a human browses is the run's folder, while source-tree items only have their own |
| What is the prefix? | the **remembered full path** of the picked root, else the folder's name | "it should take full path as i selecting the folder … remember full path" |
| How does the app learn it? | the user pastes it once into a field in the toolbar; it is remembered per folder name and reused by every tab | the browser cannot expose it; the folder name alone is not pasteable in Explorer |
| Slashes | backslashes, always | "correct slashes so it usable in win explorer" |
| The button | the SVG tab always offers **Change folder…** | "fix the btn so i can select the folder here manually too" — today the picker is only rendered while no root exists, so the tab is stuck with the inherited Selection root |

## 2. Rules

`folderCopyText(rootName, relPath)` — one exported function, used by every copy
action, so the three copies cannot drift apart again:

1. Normalise the remembered path: trim, strip the surrounding quotes Explorer's
   "Copy as path" adds, `/` → `\`, collapse duplicate separators, drop a trailing
   separator (so `F:\` joins as `F:\x`, and a drive-only root as `F:\x` too).
2. Take the batch base out of `relPath` when it matches
   `_split_output/<YYYY-MM>/<YYYY-MM-DD_HH-mm-ss>` (case-insensitive): the copy
   stops there. Anything else keeps its containing folder (`Category-A/icon_AI.png`
   → `Category-A`); a file at the root keeps just the root.
3. Join with `\`. The result never contains a file name.
4. Fall back to the folder's own name when no full path was pasted — a copy that
   is incomplete is still honest and pasteable; the app never guesses a drive.

`rememberedRootPath(rootName)` is `iconSplitter.rootpaths.v1` = `{ [name]: path }`,
validated on read (RULE 13: a non-object, a non-string value or corrupt JSON →
no memory, never a guess) and written on every change of the field.

## 3. Module plan (RULE 18: ideal 150–300 lines, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/lib/rootpath.ts` | **new**: the path memory + the pure copy-text rules | ~110 |
| `src/lib/copypath.ts` | **new** (moved from `src/selection/copypath.ts`, which is deleted): `copyFolderText(rootName, relPath, say)` | ~20 |
| `src/ui/RootPathField.tsx` | **new**: the shared full-path field (label, hint, remembered value); one component in both toolbars | 35 |
| `src/svg/SvgControls.tsx` | the source bar loses `SourceLine` (extracted) so the file stays inside RULE 18 | −44 |
| `src/svg/SourceLine.tsx` | **new**: the source bar — root pill, the always-offered picker, rescan, the full-path field, the counts | 68 |
| `src/selectionv2/SourceBar.tsx` | the same field joins V2's source bar (the other tab with copy buttons) | +1 |
| `src/batch/BatchPanel.tsx` | its private `copyPath` (forward slashes, file name) is replaced by the shared function | −4 |
| `src/selection/SelectionPanel.tsx`, `src/selectionv2/SelectionV2Panel.tsx`, `src/svg/codeactions.ts` | import the shared function | ±1 each |
| `src/ui/RootPathField.tsx` | the field's change is logged (`svg.root-path`, info) — no other writer of the memory exists (RULE 10) | +1 call |

## 4. TDD order (red before green, per cycle)

1. `tests/rootpath.test.ts` — normalising (quotes, forward slashes, trailing
   separator, empty), the storage round-trip / corrupt / unknown-name cases, and
   `folderCopyText`: the user's exact example, a source-tree item, a root-level
   file, a `_split_output` folder that is *not* a batch base, a folder-only
   guarantee (`no ".svg.json"`, no `.png`), and the no-memory fallback.
2. `tests/copypath.test.ts` — rewritten for `copyFolderText` (the folder text,
   the remembered prefix, the honest message, the blocked-clipboard error).
3. `tests/svg_ui.test.tsx` — `svg-choose-root` present and enabled **while a root
   exists**, the field shows the remembered path after a remount, and editing it
   stores the normalised value.
4. `tests/selectionv2_ui.test.tsx` — end to end on a row's "AI result" button: the
   clipboard stub receives the pasted full path + the row's folder, and the toast
   says `Folder path copied`.

Built as designed, with three deviations worth recording: the field lives in
`src/ui/` (both toolbars use it), the CSS class is `.pathfield` (not
`svg-pathfield`) for the same reason, and `SourceLine` had to move out of
`SvgControls.tsx` — adding the field pushed that file to exactly 300 lines, the
RULE 16 fail line, so the source bar became its own module rather than a
grandfathered exception.

## 5. Verification

* The new unit tests + the rewritten copy tests, then the full `npm run verify`
  (types, lint, RULE 16 gate, tests, coverage, build).
* A DOM test drives the real field and the real clipboard stub, so the text the
  user pastes is asserted, not assumed.
* The headless-Chromium probe is re-run on both tabs after the change: the
  toolbar grows by one control, and the dock must still interpose on nothing
  (`covered=0`, a real click still selects a row). Ran, 1440×900, fake root with
  14 approved pairs:

| Measured | Selection V2 | Generate SVG |
|---|---|---|
| `.app-main` / `.app-dock` | `57…663` (scroll 1915) / `663…900` | `57…663` (scroll 2244) / `663…900` |
| window scroll | `max 0` — the panel scrolls, not the page | `max 0` |
| checkboxes hit-tested | 14 (`covered=0`, 11 clipped by scroll) | 14 (`covered=0`, 14 clipped) |
| the new controls | `v2-root-path` clear at `84…113` | `svg-choose-root` clear at `82…115`, `svg-root-path` clear at `84…113` |
| a human click on the last row's checkbox | `false → true` ✔ | `false → true` ✔ |
| the copy itself | (covered by the DOM test) | `Location` on a row after pasting `"F:\Stocks 2026\icons testing\single\test_processing\"` → clipboard `F:\Stocks 2026\icons testing\single\test_processing\set_A`, toast `Folder path copied — browsers can't open Explorer directly: …`, no file name in the text ✔ |
| `Change folder…` re-picks from this tab | — | eligible `14` → `14`, root `test_processing` ✔ |
* RULE 16/18 recheck over the touched files.

## 6. Rejected alternatives

* **Guessing the drive** (e.g. assuming `C:`) — invents a path that may not
  exist; Explorer then opens nothing. Rejected (RULE 4).
* **Reading the path from the handle** — the File System Access API exposes
  `name` only; there is no path property to read. Documented in the UI hint.
* **Copying the item's own folder in every case** — does not produce the string
  the user asked for (`…\2026-10-01_10-24-31`), and leaves the batch folder
  (which is what they browse) undiscoverable from a deep row.
* **A per-row "copy batch folder" button** — a second control for one string;
  the existing buttons already mean "where is this?", and there is one answer.
* **Keying the memory by tab** — the same folder picked in Selection and in
  Generate SVG must give the same text; keying by folder name gives that for
  free (a documented limitation: two different folders with the same name share
  one remembered path).

## 7. Invariants

* **I-28 (copy, RULE 2/9):** a copy action yields a **folder** path, never a file
  name: the batch folder for anything inside `_split_output/<month>/<stamp>`,
  otherwise the item's own folder. The text uses backslashes; a blocked
  clipboard is reported as an error, never swallowed.
* **I-29 (full path, RULE 13/20):** the full path of a picked root is remembered
  per folder name in `iconSplitter.rootpaths.v1`, validated on read (corrupt →
  nothing remembered), written on change, never invented, and never leaves the
  browser.
* **I-30 (root picking, RULE 4/10):** the Generate SVG tab can always pick its
  root itself — the Selection tab's handle is a fallback for the first run, not
  a lock — and there is exactly one picker control per tab.
