# Folder UI fix — Selection V2 & Generate SVG (2026-10-05)

Task: replace the unclear folder control (folder name shown as the button) with a
real green **Open folder** button plus a full-width read-only path row below;
remove the Watcher and copied-path controls; keep Rescan unchanged. Same change
in both tabs.

## 1. Problem (what exists today)

* Selection V2 (`src/selectionv2/SourceBar.tsx`): the picker is a `v2-path-pill`
  button (`v2-root`) whose label is the folder name — or the remembered full path
  once one is known. Next to it: `↻ Rescan` (`v2-rescan`), the watcher toggle
  (`v2-watcher`), the shared full-path field (`ui/RootPathField`, `v2-root-path`
  + `v2-root-path-use` "Use copied path" + `v2-root-path-note`), and the scope
  line (`v2-scan-scope`).
* Generate SVG (`src/svg/SourceLine.tsx`): a `svg-path-pill` span (`svg-root`),
  a `Choose source folder…` / `Change folder…` button (`svg-choose-root`), the
  rescan (`svg-rescan`), the same shared field (`svg-root-path*`), scope/audit
  lines. No watcher here.
* Why the field existed: `showDirectoryPicker()` yields `{ kind, name }` only —
  the drive path is invisible to the page. The app captures it from the clipboard
  at pick time (`ui/pickroot`, I-35), remembers it per folder name
  (`lib/rootpath`, `iconSplitter.rootpaths.v1`), and every folder copy
  (`lib/copypath` via `folderCopyText`) is built from it. Full record:
  `docs/archive/2026-10-05-folder-path-copy/design.md` and
  `docs/archive/2026-10-05-root-path-at-pick/design.md`.
* The user now finds the pill-as-button unclear and the Watcher + copied-path
  controls noise, and wants the full path plainly visible.

Clarified scope (2026-10-05): the path row shows the **full path as before**
(remembered path when one was captured, else the folder name); row copy buttons
keep building from it as before; the Watcher goes away **only in V2**
(Selection V1 keeps its pill and 30 s rescan).

## 2. Design (the new contract, both tabs)

Row 1 — controls (unchanged layout, new button):

* One green **📂 Open folder** button — `v2-root` in V2, `svg-choose-root` in
  SVG (same testids as the pickers they replace, so "open the picker" keeps its
  handle). Style: new `.v2-btn.open` / `.svg-btn.open` — solid green
  (`#159361`/`#1ab274`, white text) with explicit `:hover` (brighter border +
  lift), `:active` (pressed), `:focus-visible` (outline) and `cursor: pointer`.
* `↻ Rescan` untouched in each tab (same testid, same handler, same visibility).
* V2 keeps its mode switch, counters and scope line; SVG keeps its scope/audit
  lines and summary chips.

Row 2 — full-width read-only path (`v2-path` / `svg-path`, new testids):

* A block row below the toolbar: `📁 {label}` where `label` is
  `useRootLabel(rootName)` — the remembered full path once captured (I-36), else
  the folder name. `title` carries the full text for ellipsised paths.
* Empty state (no root yet): `No folder selected — open a folder to start`
  (RULE 4: empty is said out loud, never blank).
* Read-only text (`<p>`/`<div>`) — no `<input>`, no paste, no status line.

Removals:

* V2: `v2-watcher` pill + `v2-root-path*` field gone from `SourceBar`; `watcher`
  / `toggleWatcher` props gone from `SourceBar` and its call in
  `SelectionV2Panel`. `src/ui/RootPathField.tsx` deleted (no other importer —
  dead code per RULE 16.4) with its `.pathfield*` CSS; `.v2-path-pill` /
  `.svg-path-pill` CSS deleted with the pills they styled.
* SVG: `svg-root` pill + `svg-root-path*` field gone from `SourceLine`; the
  picker label collapses to one always-visible **Open folder** (the
  Choose/Change split existed only around the pill).
* Empty-state buttons (`v2-root-empty`, `svg-root-empty`) say **Open folder**
  too — one folder action, one label (RULE 10).
* Kept on purpose: `lib/rootpath`, `lib/clipboardpath`, `lib/copypath`,
  `ui/pickroot`, `ui/userootpath` — the pick-time capture, the memory and every
  row copy (`folderCopyText`) work exactly as before; only the toolbar *input*
  is gone. `adoptCopiedPath`/`saveRootPath` stay as tested lib API (paste has no
  UI caller now, but the functions are the documented entry points, not dead
  branches).

Watcher scoping (V1 keeps it, V2 loses it):

* The 30 s interval lives in shared `useSelection` (`src/selection/useSelection.ts`,
  `useWatcher`). It gains one optional options object —
  `useSelection({ watcher: false })` — defaulting to enabled, so Selection V1
  (`SelectionPanel`) is untouched and `useSelectionV2` passes `{ watcher: false }`.
  `SelState.watcher` stays: it is V1's toggle, and V2 simply never reads it.

## 3. Files

| File | Change |
|---|---|
| `src/selectionv2/SourceBar.tsx` | Open folder button + `v2-path` row; drop watcher pill, field, pill button |
| `src/selectionv2/SelectionV2Panel.tsx` | drop watcher props; empty button → Open folder |
| `src/svg/SourceLine.tsx` | Open folder button + `svg-path` row; drop pill + field |
| `src/svg/SvgPanel.tsx` | empty button → Open folder |
| `src/selection/useSelection.ts` | `options?: { watcher?: boolean }`, interval gated on it |
| `src/selectionv2/useSelectionV2.ts` | pass `{ watcher: false }` |
| `src/ui/RootPathField.tsx` | **deleted** (no importer left) |
| `src/index.css` | add `.open` buttons + path rows; delete pill/field styles |
| `tests/folder_ui.test.tsx` | **new**: the contract below, both tabs, real panels |
| `tests/selectionv2_ui.test.tsx`, `tests/svg_ui.test.tsx` | retarget to the new UI (setter via lib/clipboard, not the field) |
| `docs/current/SYSTEM_OF_RECORD.md`, `UI_SELECTORS.md`, `docs/README.md` | new handles, watcher now V1-only, field → row |

## 4. Tests first (TDD, RULE 8 — real panels, fake FS)

New `tests/folder_ui.test.tsx` (fails before, passes after):

1. Each tab shows one green **Open folder** button (`v2-root` / `svg-choose-root`,
   `.open`) that opens the picker (click → rows appear).
2. Each tab shows a full-width read-only path row (`v2-path` / `svg-path`):
   folder name after pick; remembered full path once captured (seeded via
   `saveRootPathInfo`, the same memory the picker writes); placeholder with no
   root; never an `<input>`.
3. Absent: `v2-watcher`, `v2-root-path*`, `svg-root`, `svg-root-path*`, and the
   text "Use copied path" anywhere in either tab.
4. Rescan unchanged: add/remove files, click rescan, decisions kept, rows updated
   (V2); approved list rebuilt (SVG).
5. V2 never auto-rescans (add a pair, advance 35 s, row absent until manual
   rescan); V1 still offers `sel-watcher`.

## 5. Rule check (RULE 16/18/19)

* No new production function >30 LOC, >4 params, CC >10, nesting >4 — the edits
  are prop deletions, one options object, and two small rows; `index.css` and
  tests are outside the function gate. No new file >300 (one new test file).
* No new duplication: one green definition per namespace (matching the existing
  `.v2-`/`.svg-` mirroring), one label hook (`useRootLabel`) already shared.
* No dead code left: field component + pill/field CSS deleted with their last
  callers; old testids removed from source, docs and tests together.
* RULE 18 ideals: `SourceBar`/`SourceLine` stay ~80 lines / ~8-line functions;
  `useSelection` grows by ~4 lines (options + gate) — the watcher concept stays
  whole instead of being split across panels (RULE 19: no complexity added, so
  no remediation order to run).
* Gates before done: `npx tsc --noEmit`, `npm run lint`, quality gate
  (`--changed --allow-legacy`), `npx vitest run`, coverage (src/lib untouched,
  must not drop), `vite build`.
