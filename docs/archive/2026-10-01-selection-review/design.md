# Selection review — design (2026-10-01)

Third Workbench mode: review original images beside their generated `_AI`
results and record approve/decline decisions per pair. TDD; RULE 16/18 budget
on every new file (fn ≤ 30 LOC, ≤ 4 params via context objects, files ≤ 300).

## Reuse

* `lib/naming.ts` — `parseAiName`, `isImageExt` (pairing eligibility).
* `lib/scan.ts` — `walkTree` over `lib/fs.ts` `readDirTree` (recursive walk).
* `lib/fs.ts` — handle interfaces + `writeFileOverwrite` base for atomic write.
* `batch/picker.ts` — folder picking; `batch/store.ts` — IndexedDB handles.
* `lib/dom.ts` — object-URL loading for thumbnails/previews.

No second implementation of scan/naming (RULE 1/3).

## New pure modules — `src/lib/`

### pairing.ts
Input: `FileEntry[]` (walkTree output). Classification per file:
* AI file: `parseAiName(name)` non-null → candidate AI side; its source is
  `base+ext` in the same `dirPath`.
* image non-AI file → candidate source side.

Pairs (`ReviewPair`):
```
pairId      "pair_" + fnv1a32hex(lower(dirPath + "/" + base [+ "_v" + variant]))
base, relDir
source: SideRef | null      SideRef = { relPath, size, mtime }
ai:     SideRef | null
created  = source?.mtime ?? ai.mtime     (File API exposes no birth time)
generated = ai?.mtime ?? null
```
* One pair per AI file (variants `_AI_2` are distinct pairs, distinct ids).
* Source image with no AI file → pair with `ai: null` ("AI result missing").
* AI file with no source → pair with `source: null` ("Original missing").
* No duplicates: map keyed by pairId; equal ids collapse to first.
* `identityKey(pair)` = `${size}:${mtime}` of the source side, else AI side —
  used to carry decisions across renames/moves on rescan.
* `attentionInfo(pair)` true-text when a side is missing (drives "need
  attention"); implemented in pairing.ts (kept with the pair model).

### reviewfilter.ts
```
DateFilter  { mode: "all" } | { mode: "month", month: "YYYY-MM" }
            | { mode: "custom", from: number, to: number }   // epoch ms
ListFilter  { date: DateFilter, status: "all"|Decision, search: string }
```
A pair is inside a range when **either** `created` or `generated` falls in
[from, to] (inclusive); month likewise on the same anchor timestamps. Status
and search (substring over name+dirPath, case-insensitive) are AND-ed.

### reviewsort.ts
`SortState { by: "date"|"status"|"name"|"path", dir: "asc"|"desc" }`.
Comparators: date → `created`; status → rank pending 0 / approved 1 /
declined 2, ties by date desc; name → `base`; path → `relDir/base`.
Direction applied by sign flip; ties always break on pairId (deterministic).

### reviewmeta.ts (tiny)
* `statusInfo(decision)` → `{ label: "Pending"|"Approved"|"Declined", glyph }`
  — text always present so state never relies on colour alone (a11y §11).
* `keyToAction(key, inField)` → `"approve"|"decline"|"next"|"prev"|"zoom"|null`
  for A / D / ArrowDown / ArrowUp / Space; null when typing in a field.

### reviewfile.ts
Record shape (spec §8): `{ pair_id, source, ai_result, decision, reviewed_at }`.
* `parseDecisions(text)` → `{ ok: true, records } | { ok: false }` (corrupt).
  Validation per record; bad individual records dropped, bad payload corrupt.
* `mergeDecisions(pairs, records)` → pairs with `decision` + `reviewedAt`.
  Unknown pair_ids are kept aside as `orphans` (retained on next save so a
  transiently-missing file never destroys a decision — spec §9/§8).
* `carryRenamed(prevPairs, newPairs, decisions)` — pairs new by pairId whose
  identityKey matches an old pair's identityKey inherit its decision
  (rename/move), counted as `renamed`.
* `diffPairs(prev, curr)` → `{ added, removed, renamed, unchanged }` counts.
* `serializeDecisions(records)` — stable order (pair_id sort), pretty JSON.

## IO module — `src/selection/reviewstore.ts`
File lives at `<root>/review-decisions.json`.
* `loadDecisions(root)` → `{ records, missing, corrupt }`; missing → create
  empty file best-effort, all pairs pending (spec §8).
* `saveDecisions(root, records)` atomic pattern (browsers have no rename):
  1. write full JSON to `review-decisions.tmp`;
  2. read tmp back, verify it parses and record count matches;
  3. `writeFileOverwrite` main file; 4. delete tmp.
  Any thrown step aborts → caller keeps in-memory records, surfaces warning
  with Retry (spec §10), increments `awaitingRetry`.

## Orchestration — `src/selection/useSelection.ts`
Same Ctx/render-mirror pattern as useBatch. State:
```
rootName, pairs: ViewPair[] (pair + decision + reviewedAt),
lastDiff {added,removed,renamed,unchanged}, lastRescanAt,
filter: ListFilter, sort: SortState, selectedId,
writeWarn: string|null, awaitingRetry: number,
watcher: boolean, listCollapsed: boolean, zoom: "fit"|"full", sync: boolean,
busy, toast
```
Pure reducers exported for tests: `applyScan(state, pairs, records, now)` →
new state (merge + carry + diff + counters); `withDecision(state, id, d, now)`;
`nextPending(pairs, fromId)`.
Actions: chooseRoot (restores handle from IDB), rescan, decide, setFilter,
setSort, select, toggleWatcher (30 s interval rescan), retryWrite, zoom/sync.
Keyboard handled in panel via `keyToAction`.

## UI — `src/selection/*`
`SelectionPanel` (composition) → `HeaderRow` (root button, rescan, watcher
pill, counters), `FilterBar` (date mode, from/to datetime-local, status,
sort-by, order, clear), `PairList` (search, collapse, rows with thumbnail +
status chip text, empty states), `CompareView` (Original / AI result panes,
labels, meta row dims/format/size/path, Open-in-Explorer per side = copy path
+ honest toast, Approve/Decline above AI pane, Next-pending checkbox, 1:1 +
SYNC + Space zoom, discovery footer), `StatusFooter` (last rescan age,
diff counts, retry warning, reviewed progress).
Workbench gains `tab-selection` labelled "Selection" after "Batch folders".

## Storage map
* `<root>/review-decisions.json` — decisions (atomic write, app-owned).
* IndexedDB `iconSplitter/handles["selection"]` — root handle.
* Nothing else persisted; filters/sort are session state.

## Negative tests (must exist)
corrupt JSON, missing JSON, write failure → retry, unpaired both sides,
duplicate ids, rename carry, removed files keep orphan records, filters empty
result, thumbnail error placeholder, key handling while typing.
