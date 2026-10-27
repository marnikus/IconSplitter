# Shared selector conventions, shell, and history — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

## I. Selector object structure — for every element

Same shape as the source project, adapted. Prefer semantic queries first
(RULE 21); a stable `data-testid` is the explicit handle where semantics or
structure cannot identify the element (for example the SVG boundary overlay):

```ts
{
  name: "export-zip",              // stable id, matches data-testid
  semantic: 'button "⬇ ZIP"',      // first choice: role + visible text
  testid: "export-zip",            // stable explicit handle when needed
  state: "disabled when total === 0",
  verified: "2026-09-30",          // date the handle was checked in src
}
```

When a test needs a handle that is not listed, add the `data-testid` to the
owning component **and** document it in the owning tab's selector page in
the same change (RULE 17).

## J. Handles still needed (to be added on demand)

| Handle | Where | Needed when |
|---|---|---|
| `sheet-row-{id}` | sheet list rows | first test that selects a sheet by click |
| `icon-card-{n}` / `icon-copy-{n}` / `icon-save-{n}` | result grid cards | first test of per-icon export |
| `empty-result-note` | "No icons selected…" paragraph | empty-state assertions |
| `row-status-{relPath}` | scan table status cell | first test asserting per-row status text |
| `ref-warn-{relPath}` | per-row missing-reference note | first test of per-row warning detail |

Nothing fetches these yet — they are the discovery list, kept honest like the
source doc's "Missing Selectors" section.

## K. Workbench tabs — mode switch

The sixth tab is `tab-stock-upload` (Upload); see [stock selectors](stock-upload.md).

| Test id | Visible text | Notes |
|---|---|---|
| `tab-sheets` | `Single sheets` | mounts the original `App` UI; one mounted at a time with the others |
| `tab-batch` | `Batch folders` | mounts `BatchPanel`; batch state (`useBatch`) survives sheet tabs |
| `tab-selection-v2` | `Selection V2` | mounts `SelectionV2Panel` ([§N](selection.md#n-selection-review-v2--srcselectionv2-verified-2026-10-01)) |
| `tab-generate-svg` | `Generate SVG` | mounts `SvgPanel` ([§P](svg-generation.md#p-generate-svg--srcsvg-verified-2026-10-01)) |
| `tab-upload` | `SVG to upload` | mounts `UploadPanel` ([§R](upload.md#r-svg-to-upload--srcupload-verified-2026-10-07)), after Generate SVG |

Semantic fallback: button role + visible text.

## O. Global history bar, reset actions (verified 2026-10-01)

App-level, rendered by `ui/Workbench` above every panel (`ui/HistoryBar.tsx`):

| testid | element | notes |
|---|---|---|
| `history-bar` | container | present on every tab |
| `hist-undo` | button | `disabled` at the frontier; `title` = "Undo: <label> (Ctrl+Z)" |
| `hist-redo` | button | `disabled` at the tip; `title` = "Redo: <label> (Ctrl+Shift+Z)" |
| `hist-label` | text | "Undo: <label>" or "Nothing to undo" |
| `hist-open` | button | `History (<n>)`; toggles the History window (`aria-expanded`) |
| `hist-error` | span `role="alert"` | shown when an undo/redo could not be applied |

The History window (`ui/HistoryPanel.tsx`), opened by `hist-open`:

| testid | element | notes |
|---|---|---|
| `hist-panel` | `aside role="dialog"` | fixed, top-right, below the bar |
| `hist-panel-count` | text | "<n> change(s)" |
| `hist-close` | button | `aria-label="Close history"`; Escape closes too |
| `hist-panel-undo` / `hist-panel-redo` | buttons | `title` names the entry they reverse; same disabled rules as the bar |
| `hist-panel-items` | ul | newest first; the list is read-only — jumping to an entry would mean applying several changes at once, which is not reversible |
| `hist-item-<entryId>` | li | `data-current` marks the entry under the cursor |
| `hist-panel-error` | p `role="alert"` | same error as `hist-error`, inside the window |

Selection V2's reset and row-click details live [with the Selection handles](selection.md#selection-reset-and-row-interactions); the `hist-*` controls above are the one global undo timeline.

Shortcuts: `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` redo. Ignored only
while the focus is in a *text* surface — text-ish input, textarea, select or a
contenteditable — so undo still works after using the zoom slider or a checkbox.

## Q. App shell and the global activity log (verified 2026-10-05)

| Test id | Element | Notes |
|---|---|---|
| `app-shell` | the app's one viewport column | nav → `app-main` → `log-dock`; `height: 100dvh`, `overflow: hidden` |
| `app-main` | the scrolling region | holds the active tab's panel; the window itself never scrolls |
| `log-dock` | the docked log, the shell's last row | a layout row, never `fixed`/`sticky` — that overlay is what used to eat row-checkbox clicks (I-27) |
| `log-head` | the dock's header | `log-count` ("120 of 200"), `log-autoscroll` ("following" / "paused"), `log-max` (select: 50/100/200/500/1000), `log-copy`, `log-clear`, `log-minimize` ("Minimize" / "Restore"), `log-note` (Copy/Clear feedback) |
| `log-body` / `log-list` / `log-entry` / `log-empty` | the scrolling entries | one `log-entry` per line: level, `feature.action`, ids, detail; `role="log"` |
| `--app-dock-h` | CSS custom property on `:root` | the dock's height (236 px open, 36 px minimized), published by `src/log/dockheight.ts`; the fixed floats (`svg-toast`, `svg-busy`, `.toast-above-dock`) read it |
| `scroll-top-btn` | `↑` corner button, `aria-label="Back to top"` | rendered by the shell next to `app-main` — one instance on every tab; `hidden` while the list is at the top, appears past 80 px of scroll; click returns `app-main` to the top (verified 2026-10-15) |

Shared process header/accessibility and Upload portal selectors: [process progress](../sor/process-progress.md#handles).

Completion sound is global across tabs; existing `process-sound`, `process-sound-enabled` and `process-sound-test` remain below Generate SVG. Pointer/keyboard capture on `app-shell` silently unlocks audio for all task starts; [contract](../sor/process-progress.md#completion-sound-on-every-tab).

## Large-list selection state

The existing row/check handles in Batch, Selection V2, Generate SVG and Upload
are unchanged. Assert native `HTMLInputElement.checked` (or semantic checked
state), not the HTML `checked` attribute. `.selected` is the row highlight;
`aria-current` and tab order still describe the separate active row.
[One canonical selection / layout projection](../sor/selection-performance.md)
updates all mounted inputs/classes before paint; filtering retains hidden checks.

Active projection also owns `.active`, `aria-current`, roving `tabIndex` and
scrolling; assert the same existing row node after arrow/checkbox gestures.
History handles/shortcuts stay unchanged; recording now uses stable actions and
compact ordered deltas with deferred persistence (read/pagehide/unmount flush).
