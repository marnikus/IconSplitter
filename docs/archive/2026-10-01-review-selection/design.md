# Design — Image Review Selection (Original ↔ AI result)

Date: 2026-10-01. Status: implementing (TDD). Rules: AGENT_RULES 1–24, esp. 16/18.

## 1. Goal

A third mode, **Selection**, directly after **Batch folders**
(`src/ui/Workbench.tsx`). It recursively scans the configured split root, pairs
each `image.ext` source with its `image_AI[_N].ext` result, and lets the user
approve / decline every pair. Decisions live in a JSON file in the root and
survive rescans and restarts.

## 2. Environment constraints (honest, RULE 4 / RULE 9)

* Reading and writing the decision file uses the same File System Access API the
  batch mode already uses (`src/lib/fs.ts`, Chrome/Edge only).
* "Open in File Explorer" has no browser API. Substitute (identical to the
  batch mode): copy `<root>/<relPath>` to the clipboard and say so honestly.
* "Atomic JSON write": File System Access has no rename for `move()`-capable
  files in every browser, so the writer tries `handle.move()` on a temp file and
  falls back to `createWritable()` — which the spec implements as write-to-swap
  -file + replace-on-close, i.e. still never a half-written JSON file (RULE 23).

## 3. Module map (RULE 1, RULE 18 — one responsibility per file)

Pure core (`src/lib/`, unit-tested, no browser APIs):

| Module | Owns |
|---|---|
| `review.ts` | pair identity (`pairId`), recursive-scan pairing (`buildPairs`), pair diff for rescan (`diffPairs`), `nextPendingId` |
| `reviewfile.ts` | decision record model, strict parse/reject (RULE 13), upsert, `syncRecords` (missing file ⇒ pending), `recordIndex` |
| `reviewmerge.ts` | pairs + decisions ⇒ `ReviewItem[]`, optimistic `withDecision`, `tally`, `orphanRecords`, `recordForItem` |
| `reviewquery.ts` | month / custom-range / status filters, the four sort keys × two directions |
| `reviewio.ts` | read / atomic write / corrupt backup of `review-decisions.json` |
| `reviewkeys.ts` | hotkey → action map (A, D, ←, →, Esc) with editable-target guard |

Adapters and UI (`src/review/`):

| Module | Owns |
|---|---|
| `useReview.ts` | root picking, scan, rescan, decisions, filters, selection, toast (RULE 2/5/24) |
| `useCompare.ts` | side metadata (dimensions, format, size) + object URLs, revoked on change (RULE 20) |
| `ReviewPanel.tsx` | layout: header, counters, filters, list, overlays |
| `ReviewCounters.tsx` | total / pending / approved / declined chips — text + icon, also the status filter (RULE 10) |
| `ReviewList.tsx` | scrollable rows: thumbnail, filename, folder, date, status |
| `ReviewFilters.tsx` | scope (all / month / range), From + To, Clear, sort key + direction |
| `CompareView.tsx` | side-by-side Original ↔ AI result, metadata, Approve/Decline, hotkeys |
| `StatusBadge.tsx` | status text + icon + colour (never colour alone, §11) |
| `store.ts` | review root handle in IndexedDB (reuses `src/batch/store.ts` generic key-value) |
| `src/ui/useThumbnails.ts` | shared thumbnail cache (extracted from `batch/ScanTable.tsx`, now revokes object URLs) |

Direction stays UI → review/batch → lib (RULE 1/3).

## 4. Key decisions

* **Pair id** = lowercased `dir/base` plus `#variant` for `_AI_N`
  (`category-a/star`, `category-a/star#2`). Stable while the pair is unchanged,
  independent of which side is currently on disk.
* **One pair per AI file**; several AI variants of one base share the source
  (that is not a duplicate pair — the ids differ). A source with no AI file
  becomes `source-only` ("AI result missing"); an AI file with no source becomes
  `ai-only` ("Original missing").
* **Case-insensitive paths** on both sides — Windows/macOS folders are
  case-insensitive, so ids and lookups fold case.
* **`createdAt`** = the newest mtime of the two sides (filter + sort key), so
  "created/generated in range" includes either side being (re)generated.
* **Decisions**: `pending | approved | declined`; a record exists for every
  pair, `pending` when nothing was decided. `reviewed_at` is the ISO timestamp
  of the last decision change. Unknown/missing file ⇒ all pairs pending.
* **Corrupt file**: `parseReviewFile` reports `corrupt` with a reason and the
  app **refuses to overwrite** it until the user chooses *Back up & start
  fresh* (writes `review-decisions.corrupt-<ts>.json` first) or fixes the file
  and hits *Retry*. In-memory decisions keep working meanwhile (never a silent
  loss of stored decisions, §8).
* **Rescan** re-reads the tree and the JSON, then reports
  `+added / -removed / ~changed / renamed / unchanged`; decisions for unchanged
  ids are reused, new ids start pending, vanished ids stay in the JSON and are
  listed under "no longer on disk".
* **No auto-approval**: `processed` status from the batch feature never counts
  as approved (§7). Review status is only what the review file says.
* **After a decision** the comparison view rolls on to the next pending pair
  (wrapping); when none is left it closes with an honest "all reviewed" toast.

## 5. TDD order

`reviewfile` → `review` (pairs/diff) → `reviewmerge` → `reviewquery` →
`reviewio` (fakefs) → `reviewkeys` + component markup tests → UI wiring.
Each step: red test, green implementation, RULE 16 gate clean.

## 6. Rule budget checked up front (RULE 16.6)

* Every new function ≤ 20 LOC (fail 30), ≤ 4 params, CC ≤ 10, nesting ≤ 4.
* New files target 150–300 lines; none may exceed 300.
* No new hook component with > 10 hooks; `useReview` is split into small
  callbacks, the panel stays presentational.
* `src/App.tsx` (legacy) is not touched (RULE 16.5).

## 7. Implementation notes (written while landing the change)

Two helpers were split out of the planned modules to stay inside RULE 18:
`src/lib/text.ts` (the case-insensitive comparison shared by pairing, orphans
and sorting) and `src/lib/reviewformat.ts` (list/compare display text, the
rescan summary line and the backup timestamp). `nextPendingId` lives in
`reviewmerge.ts` (it works on items, not on pairs). Two shared UI pieces were
extracted from `src/batch/ScanTable.tsx` and reused by both modes:
`src/ui/useThumbnails.ts` + `src/ui/Thumb.tsx` (object URLs are now revoked,
RULE 20) and `src/ui/Overlays.tsx`. Tests: 8 new files, including a DOM-driven
flow test (`tests/review_ui_flow.test.tsx`) that picks a folder, reviews with
the A/D hotkeys and asserts the decision in the JSON on disk.

## 8. Design rebuild (same day, after the supplied screen)

The supplied screen redefined the layout; the pure core stayed, the presentation
was rewritten:

* `Workbench` became the app bar: brand ("Image Operator"), tabs, a status slot
  a panel can publish into (`src/ui/AppChrome.tsx` — the Selection tab puts the
  watcher pill there) and a help popover (hotkeys + browser limits).
* The comparison window moved **inline** beside the list (no modal), so
  `CompareView.tsx` became `DetailPane.tsx` + `DetailHead.tsx` + `SidePane.tsx`
  and `Hotkeys.tsx` took over the keyboard map for the whole tab.
* New filter row (All/Month/Custom with always-visible From/To), search with
  ⌘K, per-status/attention badges with icons (`Glyph.tsx`), counters as header
  chips, and the bottom status bar (index state, last rescan, delta, retry
  count, progress).
* Zoom: `Space` toggles `fit` (object-contain) ↔ `100` (true pixels), shown as
  `FIT SYNC` / `1:1 SYNC`.
* Watcher: while the tab is open the root is re-scanned every 15 s; the toast
  only fires when the scan actually changed something.
