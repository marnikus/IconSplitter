# A tab's folder: remembered, restored, re-opened

[shared owners](shared.md) · [full-path capture](topics/root-path-identity.md) · [remove row](svg-remove-row.md)

One module owns this for every folder tab: `src/state/tabroot.ts`. The tabs are
Selection V2, Generate SVG, SVG to upload, SVG builder and Upload. No tab reads
or writes the folder store by itself (a test fails if one does). Batch folders
keeps its own two-folder presets (`src/batch/useBatch.ts`).

## Why (2026-11-28)

After a page reload the browser hands a remembered folder back **without read
access**. It may be asked for access only on a click. Each tab had its own
start code, and only Generate SVG knew this. The SVG builder scanned anyway,
failed, and showed no folder at all; the other tabs showed an empty list.

## The contract

| Step | Function | Rule |
| --- | --- | --- |
| Tab start | `bootTabRoot(tab, { show, scan, say })` | The folder is shown at once. Its saved full path is bound. It is scanned only when readable. When locked, the tab says `LOCKED_NOTE` and does not scan. |
| Rescan click | `rescanTabRoot(handle, say, scan)` | Asks the browser when it must (`openTabRoot`), then scans. A refusal is said, naming the folder. |
| After a pick | `rememberTabRoot(tab, handle)` | Saved under the tab's own key. A failed save returns false, never throws. |
| Undo paths | `storedRoot(key)` | The folder kept under a key, or null. |

Nothing here can hold a tab or throw. The handle store is waited for 3 s, the
path lookup and the browser's access answer for 1.5 s each. No answer about
access counts as open: the scan finds out.

## Keys and borrowing

`ROOT_KEYS` holds the IndexedDB key of each tab. They must never change: users'
saved folders live under them. A tab with no folder of its own starts on
another tab's, in this order:

- Generate SVG: Selection.
- SVG to upload, SVG builder, Upload: SVG to upload, Generate SVG, Selection.
- Selection never borrows.

The SVG builder keeps a borrowed folder as its own, because its removals find
their pair files through its key.

## The button

`src/ui/RescanButton.tsx` is the one Rescan button. While the folder is locked
it reads `🔓 Restore access` (`data-locked="true"`). It re-checks the lock when
the folder, the scan state or the scan result changes, and whenever any tab
asked the browser — a folder opened in one tab is open in all of them.

Generate SVG also rescans when its tab is opened again, so that click already
asks the browser.

## Tests

- `tests/tabroot.test.ts` — the contract, run for every tab: restore, locked,
  silent browser, store that never answers, failing store, failing scan,
  borrowing, the click, and the "one folder system" guard.
- `tests/tabroot_every_tab.test.tsx` — the whole app with a locked folder: each
  tab shows it, offers Restore access, asks once on the click, and scans.

Test files that use `tests/helpers/svgpanel` must import it before any app
module: it installs the in-memory folder store.
