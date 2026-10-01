# Global log — the dock (2026-10-01)

Feature 2, UI half. Data contract: `docs/archive/2026-10-01-svg-confirm-global-log/log-contract.md`. Planned
files and budgets: `docs/archive/2026-10-01-svg-confirm-global-log/modules.md`.

## 1. Placement and layering

The dock is rendered by `Workbench` as a sibling of `Shell`, above every panel and outside the tab
conditionals, so no tab can unmount it (the store would survive anyway, L-7).

| Layer | z-index | Source |
|---|---:|---|
| **Log dock** `position: fixed; inset: auto 0 0 0` | **10** | new |
| `.svg-backdrop` (SVG dialogs) | 20 | `index.css` |
| `.svg-toast`, `.svg-busy` | 30 | `index.css` |
| `HistoryPanel`, drop overlay | 40 | Tailwind |
| toasts and busy overlays on the other tabs | 50 | Tailwind |

Dialogs and busy overlays therefore dim and cover the dock; toasts float above it. **Clearance:** the dock
publishes its height as `--log-dock-h` on `document.documentElement` (32 px minimised, `clamp(160px, 28vh, 280px)`
open, 0 when unmounted). `Shell`'s root gains `padding-bottom: var(--log-dock-h, 0px)` so the last row of any
tab stays reachable, and the five fixed-bottom elements move up by the same variable: `.svg-toast` / `.svg-busy`
(`bottom: calc(var(--log-dock-h, 0px) + 54px)`) and the three Tailwind toasts at `App.tsx:571`,
`selection/Surfaces.tsx:55`, `batch/BatchPanel.tsx:52` (`bottom-6` → `bottom-[calc(var(--log-dock-h,0px)+1.5rem)]`).
These are in-place edits with zero line growth. Panels use `min-height`, not fixed heights, so nothing else moves.
Styles live in `src/log/log.css`, imported by the dock, using the `--v2-*` tokens — `index.css` does not grow.

## 2. Anatomy

```
┌ Log · 312 entries · ● 3 new · ✖ 1   [Copy all] [Clear]  Max entries [1 000 ▾] ───── [▾ Minimize log] ┐
│ 21:43:36.120  ⓘ INFO  svg  request.sent   attempt 1/3 · 4 images · fp 3fa9c1d2.1b4 · run r1xk-1      │
│ 21:43:38.402  ▲ WARN  svg  request.retry  rate_limit · waiting 4.0 s (attempt 1/3)                   │
│ — session k3f9ab · 2026-10-01 21:40 —                                                                │
│ 21:43:43.995  ⓘ INFO  svg  request.ok     200 · 5.6 s · 4.1k in · 2.2k out · $0.0210 reported        │
│                                               [↓ 3 new — Jump to latest]                             │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

* **Row** = `time` (local `HH:mm:ss.SSS`, `title` = ISO) · level **word + glyph** (`ⓘ INFO`, `▲ WARN`,
  `✖ ERROR` — text first, colour reinforces, I-14) · feature · action · message · muted ids, data and usage.
  Row and Copy-all call the same `lib/logformat` helpers, so what is shown is what is copied (L-6). A `×N`
  suffix marks a folded repeat.
* **Session break** row where `sid` changes; **empty** state "No entries yet" (`role="status"`) is distinct from
  "Previous log could not be read — started empty" and from "Not saved to this browser (storage unavailable) —
  entries last until reload" (RULE 4). A non-zero `dropped` counter shows "N entries could not be recorded".
* **Minimised** (32 px): title, entry count, unseen badge, unseen-error count — errors are never hidden by
  minimising. Nothing else is rendered except the toggle.

## 3. Component split (hooks ≤ 10 per component, RULE 16.1)

`LogDock` (shell, header, minimise, publishes `--log-dock-h`) → `LogToolbar` (copy, clear, max, status) +
`LogList` (rows, session breaks, jump button). `useLog` binds the store with `useSyncExternalStore`;
`useStickyScroll` owns every ref and listener of the scroll container. `LogRow` is `React.memo`, keyed by
`entry.id`, re-rendered only when `repeat` changes.

## 4. Follow-scroll — a pure machine, thin DOM glue

`lib/logscroll.ts`: `BOTTOM_EPS = 4` px; `Geometry { top, height, client }` (scrollTop, scrollHeight,
clientHeight); `Follow { following, unseen, unseenErrors }`; `atBottom(g) = g.height - g.top - g.client <= EPS`.

| Event | While following | While paused |
|---|---|---|
| entries appended, list visible | `pin` → scroll to bottom after layout | `unseen += n`, `unseenErrors += errors`, no scroll |
| entries appended, dock minimised | counters grow, no pin (nothing to scroll) | counters grow |
| scroll event reaching `atBottom` | stays | → **following**, counters 0 |
| scroll event not at bottom | → **paused** | stays |
| intent up (wheel up, PageUp, ArrowUp, Home) | → **paused** at once, before the scroll event, so a burst of appends cannot yank the view back | stays |
| *Jump to latest* / End | — | scroll to bottom ⇒ following |
| Clear | reset: following, 0 | same |
| minimise | remember `top` | remember `top` |
| restore | pin | re-apply remembered `top` (clamped) |
| max lowered (ring trims the oldest) | pin | keep (`overflow-anchor: auto` holds the viewport) |

```ts
atBottom(g): boolean;  onUserScroll(f, g): Follow;  onIntentUp(f): Follow;
onAppend(f, levels: readonly LogLevel[], visible: boolean): { follow: Follow; pin: boolean };
onRestore(f): { follow: Follow; pin: boolean };
```

A programmatic pin fires a scroll event that reports "at bottom", so it needs no special-casing; content growth
alone fires none. **One control per decision (RULE 10):** following is *not* a checkbox — the scroll position
decides, and *Jump to latest* is a shortcut to the bottom, not a second setting. `happy-dom` has no layout, so
tests stub `scrollTop/scrollHeight/clientHeight`; the table above is unit-tested with plain numbers.

## 5. Actions

| Control | Behaviour |
|---|---|
| **Copy all** | `copyAllText()` = header line + `formatAll(stored entries)`, sanitised once more; `navigator.clipboard.writeText`. Result in `log-status` (`role="status"`): "Copied 312 entries" or, when blocked, "Clipboard is blocked by the browser — select the log text and copy it" (RULE 9: fails open; rows are selectable). Records `log.copy`. |
| **Clear** | immediate, no confirmation (diagnostic data); empties memory and storage, resets follow, leaves one `log.clear` breadcrumb |
| **Max entries** | `<select>` of 100 / 250 / 500 / 1 000 / 2 000 / 5 000. Applies at once to stored *and* displayed (RULE 24); lowering it drops the oldest and records `log.max {from, to, dropped}`. A select cannot hold an invalid or half-typed value, so typing "5" on the way to "500" can never delete entries (A-5). |
| **Minimize log / Restore log** | button with `aria-expanded` + `aria-controls`; persisted in `iconSplitter.log.prefs.v1` |
| **Jump to latest** | visible only while paused; shows the unseen count |

None of these is pushed to the undo timeline (D13). No hotkey is added; `Ctrl+Z` is unaffected
(`selection/hotkeys` already skips `<select>`).

## 6. Accessibility

Region `aria-label="Application log"`. The list is `role="log"` with `aria-live="off"` — a screen reader is not
flooded by entries — and a separate visually quiet `role="status"` line announces at most once per second:
the unseen count and the Copy result. The scroll container is `tabIndex=0`, so arrows/PageUp/PageDown/End
scroll it natively. Every control is a real `<button>` or a labelled `<select>`; focus ring reuses
`--v2-purple-2`. Colour is never the only signal (glyph + word).

## 7. Handles (to be added to `docs/current/UI_SELECTORS.md` when shipped)

Semantic first (RULE 21): region "Application log"; buttons named "Copy all", "Clear", "Minimize log" /
"Restore log", "Jump to latest"; select labelled "Max entries". Test ids: `log-dock`, `log-toggle`,
`log-count`, `log-badge`, `log-list`, `log-row` (with `data-entry-id`), `log-session`, `log-empty`, `log-copy`,
`log-clear`, `log-max`, `log-jump`, `log-status`, `log-persist`, `log-dropped`.

## 8. Rendering budget

≤ 5 000 single-line rows, memoised, no virtualisation (D14). If profiling shows more than one frame per append
at the maximum, windowing is added inside `LogList` only — the store and the interfaces do not change.

## 9. Not in the first version

Level filters and search, row expansion, drag-resize, download — each its own decision (RULE 10), none needed
for the stated verify list.
