# SVG to upload — response pass 3: research and redesign

Status: **plan only**. Nothing in `src/` changed in this pass. The numbers below
were measured in this repository on 2026-10-26 against the real panel
(`src/upload/UploadPanel.tsx` mounted whole), the real reducers, the real
`lib/svgpreview` / `lib/upload/prepare` code and the real row components. Every
temporary probe was deleted before the commit; the method is reproducible from
§2 and the budgets in §7 are written as gates a later implementation pass must
meet.

Supersedes nothing. Companion pages:

- current measured state and the accepted budgets: `docs/current/sor/upload-performance.md`
- the selection standards this pass inherits: `docs/archive/2026-10-26-selection-response-v2/README.md`
- history entry: `docs/HISTORY_INDEX.md`

---

## 1. Scope

The user reports that **Selection V2 and Generate SVG are now fast** and that
**SVG to upload is still slow**. This pass therefore researches only the upload
tab, with the standards the first two passes set:

- findings measured against the real architecture, not a mock;
- row click / arrow, checkbox, zoom + view settings, settings/metadata edits and
  badge edits all covered;
- ordered steps with acceptance criteria, budgets, risks;
- acceptance at 1,000 and 5,000 rows;
- no production code in this pass.

Two facts decided the shape of the redesign and both are measured, not assumed:

1. **Selection gestures in this tab are already fast.** At 1,000 rows a row
   click commits in **5.0 ms**, ArrowDown in **3.8 ms** and a checkbox in
   **5.2 ms**, with **zero** document reads, zero `buildSvgPreview` calls, zero
   `settingsFingerprint` calls and zero `prepareExportSvg` calls in the gesture
   window. The 2026-10-26 Round 2 work (`useAppSlice`, `selectiondelta`,
   `checkedrows`) reached this tab too; re-working the selection path is not
   where the remaining seconds are.
2. **Mount and every preview-affecting gesture are still seconds.** The same
   panel, same fixture: mount **5,980 ms** wall / **3,391 ms** React at 1,000
   rows, and **one zoom step costs 918 ms React / 1,209 ms wall**. At 5,000 rows
   the mount does not finish: the worker is killed after ~114 s (§3.7).

So the redesign target is the **preview pipeline and the whole-list fan-out**,
not the selection machinery. RULE 25, I-73, one history entry per gesture and
the existing selection contract stay exactly as they are.

---

## 2. Method

Fixtures (the rule that broke earlier probes): a pair becomes a row only when
the SVG beside the AI image is named `svgStem(ai.name)` — `icon-0000_AI.svg`
beside `icon-0000_AI.png`, with `icon-0000_AI.svg.json` carrying one approved
version. A file named `icon-0000.svg` makes discovery report *"the approved SVG
is missing or invalid"* and the list renders empty.

Harness:

- vitest + happy-dom, `--pool=forks`, `IS_REACT_ACT_ENVIRONMENT = true`;
- a fresh host and a fresh `createRoot` per case, whole `UploadPanel` inside
  `<Profiler onRender>`; scan settled through `waitUntil`, timers through the
  repo's `settle()` helper;
- native value setter for the zoom range (`range.value = …` plus `input`/`change`
  does fire React's `onChange` only with the prototype setter);
- per-gesture counters by wrapping the real modules (`buildSvgPreview`,
  `prepareExportSvg`, `settingsFingerprint`, `readSvgText`) and comparing the
  counter delta inside the gesture window;
- exact test ids: `[data-testid^="upload-row-"]` also matches
  `upload-row-count`, `[data-testid^="upload-check-"]` also matches
  `upload-check-all`; every count below is taken with `:not(...)` or by index
  into the filtered list.

Timing rule inherited from the previous two passes: happy-dom wall-clock is a
*ratio* instrument, not a browser. Per-node DOM cost in happy-dom is roughly
80 µs against a browser's few µs, so the harness **over-weights** DOM and
**under-weights** nothing else. That is why §3.3 measures the DOM floor
separately and §7 splits the budget into counts (exact, harness-independent),
harness ratios, and a browser lane.

---

## 3. Measurements

All at 1,000 rows unless stated; "React" is the Profiler's committed
`actualDuration`, "wall" is `Date.now()` around mount + settle.

### 3.1 Selection gestures — already at target

| Gesture | React | reads | parses | fingerprints | prepares |
|---|---:|---:|---:|---:|---:|
| row click | 5.0 ms | 0 | 0 | 0 | 0 |
| ArrowDown | 3.8 ms | 0 | 0 | 0 | 0 |
| checkbox | 5.2 ms | 0 | 0 | 0 | 0 |
| select-all/deselect-all | (Round 2 shipped the projection) | 0 | 0 | 0 | 0 |

This is the same order as the Round 2 numbers in
`docs/current/sor/selection-performance.md`, and it settles two earlier
disagreements in this pass's own probing: the "300 row renders / 600
fingerprints per gesture" figure came from a probe whose mocks broke the row
memo (a fresh actions object), and the 200–285 ms render probe measured the
*scan* commit rather than the gesture. Neither is a baseline.

### 3.2 Mount

| Case | wall | React | reads | prepares | parses | fingerprints |
|---|---:|---:|---:|---:|---:|---:|
| 1,000 rows, cold | **5,980 ms** | **3,391 ms** | 1,000 | 1,000 | 5,000 | 2,000 |
| 1,000 rows, second mount (module caches warm) | 3,077 ms | 2,393 ms | 1,000 | 0 | 3,000 | 1,000 |
| 200 rows (React only) | not recorded | 210 ms | 200 | 0 | 600 | — |

Per row that is **one file read, one export prepare, five document parses and
two settings fingerprints**, plus 22 DOM elements. The warm run shows what the
module-level `exportpreview` cache already buys (1,000 prepares → 0) and what it
does not: the reads and the parses repeat because they are keyed by render
identity, not by content. (The 200-row mount shows 0 prepares only because it
finished before the 120 ms preview debounce fired; at 1,000 rows the mount
lasts long enough for the debounced prepares to land inside the measured
window.)

Like-for-like, in the same harness, from the bench fixture
(`tools/perf/selection-response.tsx`, `selectionLoad`):

| Tab at 1,000 rows | React | wall | DOM nodes | nodes/row |
|---|---:|---:|---:|---:|
| Selection V2 (`ReviewList`) | 2,182 ms | 3,020 ms | 24,034 | 24 |
| SVG to upload (`UploadList`) | **6,195 ms** | **21,967 ms** | 22,033 | 22 |

The upload list has *fewer* nodes per row than the tab the user calls fast, yet
mounts 3–7× slower. The difference is the per-row document pipeline and the
whole-list scans, not the row markup.

### 3.3 The DOM floor

Same 1,000-row panel with `readSvgText` returning `null`, so no prepare, no
parse and no shadow paint ever run:

| Case | wall | React | rows |
|---|---:|---:|---:|
| floor, first mount | 2,399 ms | 1,866 ms | 1,000 |
| floor, second mount | 2,495 ms | 2,006 ms | 1,000 |

Commit profile at 500 rows with the same stub: **38.8 / 19.7 / 908.9 / 35.9 ms**
— one commit mounts every row (`908.9 ms` for 500 rows ≈ 1.8 ms/row), the rest
is scan plumbing. So at 1,000 rows the floor is ~1.9 s React and the preview
pipeline is ~1.5 s React on top; at 5,000 the floor alone is ~9 s in one commit.

Consequence for the budget: **the harness mount time can never reach 20 % of
today by fixing previews alone** — the floor is 55 % of today's cost. §7
therefore budgets the floor and the preview share separately, and puts the
"≥80 % faster" acceptance on the browser lane, where per-node cost is what a
browser pays and the preview pipeline is the dominant share.

### 3.4 Zoom and view settings

One zoom step (`thumb` 84 → 86), 1,000 rows:

| | React | wall | parses | fingerprints | prepares |
|---|---:|---:|---:|---:|---:|
| step 1 | **918 ms** | **1,209 ms** | **1,000** | **1,000** | 0 |
| step 2, 200 rows | 136 ms | — | 200 | 200 | 0 |
| background preset click, 100 rows | 61.7 ms | — | 0 | **200** | 0 |

Zoom is a pure *box* change — the document does not change, the export text does
not change — yet every row re-parses its document and recomputes its settings
fingerprint. The background preset is cheaper only because the frame colour is a
CSS style; it still fingerprints two settings per row (§3.6). (The 200-row
gesture probe did not find the preset button, so only the 100-row measurement is
quoted.)

### 3.5 Unit costs (happy-dom, relative)

| Function | Cost |
|---|---:|
| `settingsFingerprint` (no decorations) | 4.99 µs |
| `settingsFingerprint` (badge template on) | 32.8 µs |
| `fnv1a32` over a 10 KB document | 22.7 µs |
| `buildSvgPreview`, 1 KB / 4 KB source | 0.94 ms / 2.83 ms |
| `prepareExportSvg`, 1 KB / 4 KB / 16 KB source | 34.2 / 96.7 / 398.6 ms |
| `staleOf` (one row) | 1.2 µs |
| `rowSettings` (one row) | 0.39 µs |
| `knownBadges` (one row, 40-badge catalog) | 1.46 µs |

`prepareExportSvg` and `buildSvgPreview` are DOM-parse work and happy-dom
inflates both by roughly two orders of magnitude against a browser; the *counts*
are the transferable fact, the microseconds are not. `fnv1a32` and
`settingsFingerprint` are plain string hashing and transfer almost unchanged.

### 3.6 Whole-list work per dispatch and per render

From the reducer isolation probes (pure state, no DOM):

| Work @1,000 / @5,000 | Cost |
|---|---|
| one dispatch, rows without records | 0.19–0.39 ms / — |
| one dispatch, rows with records | 1.2–2.2 ms / — |
| one dispatch, records **+ `badgeEnabled`** | **27.6–28.9 ms / 138–142 ms** |
| `visibleRows` | 0.98 ms / 2.85 ms |
| `countsOf` + the four bulk scans | 0.68 ms / 0.88 ms |
| header scans | 0.16 ms / 0.23 ms |

`thumb` dispatch is 0.3 µs — the zoom cost lives entirely in the preview
rebuild, not in state.

### 3.7 5,000 rows

Mounting the real panel at 5,000 rows did not complete in this sandbox: the
vitest worker was **SIGKILLed after 113.75 s** with `--max-old-space-size=8192`,
and an earlier attempt died with a V8 OOM (`SIGABRT`). 5,000 rows is 110,000 row
DOM nodes plus 5,000 reads, 5,000 prepares, 25,000 parses and 5,000 shadow
paints. Today the tab has no 5,000-row state to measure; the acceptance in §7 is
"completes, bounded, no single commit over the ceiling".

### 3.8 Where a gesture's time goes

```
zoom step (1,000 rows)
  dispatch: 0.3 µs
  UploadPanel re-render  → g (visible/derived) unchanged, rowBadges unchanged
   └─ UploadList: a = useRowPresentation({ …thumb }) changes
       └─ base = useMemo([g.visible, a, register]) → MISS → 1,000 new elements
           └─ UploadRowView (memo, a changed) → RowContent (memo, a changed)
               ├─ rowSettings()          fresh object per row
               ├─ UploadPreview          (no memo)
               │   ├─ useExportPreview → keyOf()   fnv1a32(source) + settingsFingerprint
               │   └─ ratioOf(shown.svg)           buildSvgPreview  ← the parse
               └─ SvgPreviewBox → buildSvgPreview(code)  ← the same parse again
```

Every arrow in that tree is a call site measured in §3.4: 1,000 fingerprints
(`keyOf`) and 1,000 parses (`ratioOf`, because its memo depends on `thumb`).

---

## 4. Root causes

### RC-1 — The preview pipeline is eager: every row reads, prepares and paints on mount

`UploadPreview` (`src/upload/UploadPreview.tsx`) unconditionally calls
`useSvgText` (one `readSvgText` per row), `useExportPreview` (one
`prepareExportSvg` per row when the effective settings are not "as is" — and the
default artboard is *content*, not *source*, so the default state is **not** as
is), `ratioOf` and `SvgPreviewBox` (two `buildSvgPreview` calls per rendered
text), then writes `PREVIEW_CSS + html` into a new shadow root per row.

Measured: 1,000 reads, 1,000 prepares, 5,000 parses for 1,000 rows; wall 5,980 ms
cold, 3,077 ms warm; 5,000 rows never completes. This is the single largest
item and the reason the tab, not the selection, feels slow.

### RC-2 — A box-only change re-parses every document

`const box = useMemo(() => zoomBoxFit(thumb, ratioOf(shown.svg)), [thumb, shown.svg])`
depends on `thumb`, so **every zoom step re-parses 1,000 documents** (918 ms
React / 1,209 ms wall). The ratio is a property of the document, not of the box;
it only needs to be computed once per document and reused for every box size.

### RC-3 — Hashing per render: `settingsFingerprint` and `fnv1a32(source)`

`useExportPreview` computes `keyOf(source, settings)` during render:
`fnv1a32(source)` (22.7 µs per 10 KB document) plus `settingsFingerprint`
(5.0–32.8 µs, because it hashes the 10,033-character badge template and the
2,240-character size-guide template on every call) — per row, per render. At
1,000 rows that is 1,000 × 2 string hashes for a gesture that changed neither
the document nor the settings.

In state, `restaleRows` (`src/upload/statemodel.ts`) re-derives each row's
effective settings and re-fingerprints it on **every dispatch**:
27.6–28.9 ms @1,000 and 138–142 ms @5,000 with decorations on.

### RC-4 — Fresh objects defeat the memo boundaries

`rowSettings()` returns a new object on every render, `UploadPreview` is not
memoized, `UploadRowBadges` is not memoized and receives the whole
`RowBadgeState`, and `a = useRowPresentation(presentation)` changes identity
whenever `thumb`, `bg`, `defaults`, `overrides`, `applied` or `rowBadges`
changes — so a view-only change re-renders every row. `RowContent` and
`SettingsCell` each call `rowSettings()` for the same row.

### RC-5 — The list is derived again per consumer

`visibleRows` (0.98 ms @1,000, 2.85 ms @5,000) is memoized on
`rowBadges.assigned` object identity, so any badge edit re-derives the list;
`ListHead`, `ListFooter`, `bannerNotes`, `useBulkSummary` and
`UploadProgressHeaders` each filter all rows again; `countsOf` is computed even
when nothing that feeds it changed.

### RC-6 — Badge writes fan out synchronously to the whole tab

`rowbadgestore.setRowBadgeState` writes localStorage and notifies every listener
inside the gesture; the store's snapshot object changes identity, `derived`
rebuilds, `visible` rebuilds, `a` changes, all rows re-render, and (RC-3) all
previews re-fingerprint. One chip toggle costs the whole list.

**Not the bottleneck** (measured, do not "optimise" again): `rowSettings` spread
(0.39 µs), `knownBadges` over the catalog (1.46 µs), `countsOf` + bulk scans
(0.68 ms @1,000), the `thumb` dispatch (0.3 µs), and the selection path
(§3.1).

---

## 5. Design

### D1 — One parse per document, cached by content

Add a cached entry point next to the pure parser:

```ts
// src/lib/svgpreview.ts (kept pure) + src/svg/previewart.ts (cached)
export interface PreviewArt { ok: boolean; ratio: number; html: string; error: string | null }
export function previewArt(text: string): PreviewArt   // LRU, keyed by fnv1a32(text) + length
```

`ratioOf` and `SvgPreviewBox` both read `previewArt(code)`; the ratio and the
html come from the **same** artifact, so a row parses once per document text
instead of twice, and a re-render with the same text parses zero times. Both
tabs share it (RULE 10) — `SvgThumbs`' `buildSvgPreview` call site switches to
`previewArt` in the same step, with no behaviour change.

Cache: LRU, same capacity rule as `exportpreview` (400 entries), evict oldest;
key includes the text hash *and* length so a collision cannot paint the wrong
document (RULE 24's identity rule is unchanged — the cache is keyed by content,
and `useSvgText` still refuses to hand back another folder's text).

### D2 — The box is a function of the ratio, not of a parse

`UploadPreview` keeps `art` (D1) and computes `zoomBoxFit(thumb, art.ratio)`
with a plain `useMemo([thumb, art])`. A zoom step then costs one multiply per
row. No parse, no fingerprint, no read.

### D3 — Memoized preview, primitive props, content keys

- `UploadPreview` is `memo`'d and its props are primitives plus one stable
  object: `{ path, settingsKey, version, testid, label, previewKey }`.
- `thumb` and `bg` are **not** props of the row. They arrive through
  `PreviewViewContext` (a provider memoized on `{thumb, bg}` in `UploadList`), so
  a zoom re-renders only the previews, never the rows.
- `useExportPreview` receives a precomputed `settingsKey` (D4) and a precomputed
  `sourceHash` (module cache keyed by the source string), so render-time hashing
  drops to zero. `keyOf` becomes a string concatenation.

### D4 — Content-keyed row settings, and a stale check without hashing

```ts
// src/lib/upload/decorations.ts
export function rowSettingsCached(defaults, overrides, applied, id): { settings: UploadSettings; key: string }
```

- The cache is keyed by the three source objects (WeakMap) + `id`; the returned
  object is frozen and its `settingsFingerprint` is computed **once** per key.
- `settingsFingerprint` itself stops hashing templates per call: the badge,
  size-guide and shadow template sub-hashes are computed once per template
  string (module memo) and composed per field. Target: ≤1 µs typical.
- `restaleRows` compares `record.settings.fingerprint !== row.settingsKey` and
  the source fingerprint, instead of building an object and hashing it per row
  per dispatch. Badge-enabled dispatch: 27.6 ms → ≤1 ms @1,000.

### D5 — Window-gated document work (no virtualization)

Rows stay exactly as they are: every row element, checkbox and action is
mounted, in order, with its full markup; nothing is hidden and no control moves.
What is deferred is the **drawing** of the document:

- The preview area always renders a placeholder with the **final box**
  (`zoomBoxFit(thumb, ratioHint)` where `ratioHint` defaults to 1 until known),
  so layout, scrolling and the checkbox/action columns never shift. For rows the
  window has already painted, the placeholder is replaced by the frame.
- `usePreviewWindow(ref, ids)` observes the list scroller with
  `IntersectionObserver` and a generous `rootMargin` (≈1.5 viewports), plus the
  active row and any row the user has interacted with. Only eligible ids pass
  `readSvgText` / `useExportPreview` / `previewArt` / shadow paint.
- **Fallback:** when `IntersectionObserver` is unavailable (happy-dom, old
  browsers) eligibility is "all rows", exactly today's behaviour, so no test or
  user loses a preview. The perf test installs a fake observer that marks a
  ~40-row window; this is the only place the harness simulates layout.
- Deferred paint is chunked through `startTransition`/idle so a scroll does not
  produce one long task.

`upload-prev-<id>` keeps its test id in both states; the placeholder carries
`data-state="pending"` and the painted frame `data-state="painted"`, so existing
assertions keep working and a test can prove the deferral.

### D6 — One derivation, stable fan-out

- `visibleRows` is memoized on a **content key** (`rows` version + filter + sort
  + badge-assignment version), not on object identity; badge edits bump the
  version once.
- `headerState` and the panel's counters come from the Round 2 slice/selector
  machinery (`useAppSlice`, `panelcounts`); `ListHead`, `ListFooter`,
  `bannerNotes` and `useBulkSummary` read those numbers instead of filtering
  `rows` again. `UploadProgressHeaders` receives the already-computed counts.
- `UploadRowBadges` is memoized on `(pairId, assigned ids, catalog version)` and
  `knownBadges` results are cached per `(state version, pairId)`.
- `rowbadgestore` writes localStorage once per gesture (deferred microtask, the
  Round 2 timeline pattern) and notifies once; the snapshot changes identity only
  when an assignment actually differs.

### D7 — Chunked first mount for large lists

At 5,000 rows the DOM floor is one ~9 s commit. `UploadList` mounts rows in
ordered chunks (400 rows per commit, `startTransition`), so the list paints
early, stays interactive, and no single commit exceeds the ceiling. Order, keys
and semantics are unchanged; `settle()` in tests already drains the queued work,
and `upload-row-count` is rendered from `g.visible.length` (not from the mounted
chunk) so counts never read as partial. This is **not** virtualization: after
the last chunk every row is mounted, exactly as today.

### D8 — Measurements that can fail

- `tests/upload_response.test.tsx`: call-count assertions (reads, prepares,
  parses, fingerprints, row renders) per gesture, on a fixture with records and
  decorative defaults.
- `tests/upload_perf_budgets.test.tsx`: the §7 table as work budgets with a fake
  `IntersectionObserver`.
- `tools/perf/upload-response.tsx` + `tools/upload-response-bench.mjs`: the
  browser lane, modelled on `tools/selection-response-bench.mjs` (needs
  `SELECTION_BROWSER_TOOLS`; this sandbox has no Chromium, so the lane is
  documented and run where the tools exist).

### Rejected alternatives

| Alternative | Why not |
|---|---|
| Virtualize the list (mount only visible rows) | Contradicts the preserved "no virtualization / all rows real" decision from the two selection passes; scroll height, find-in-page, select-all semantics and dozens of tests depend on every row existing |
| Precompute every export text during scan and persist it | Nothing is written before an export is confirmed (the tab's promise: one honest write per confirmed run); a 10 KB prepared text per row in localStorage would also be a second source of truth |
| Move the pipeline to a Worker | `DOMParser` is not available in workers in every target browser, the repo's tests run in happy-dom, and the biggest win (doing 40 rows instead of 1,000) needs no concurrency |
| Keep `UploadPreview` eager but memoize harder | 1,000 reads and 1,000 prepares still happen on mount; memoization cannot skip work that has already been decided |
| Drop the per-row live preview entirely (icon + name only) | Changes what the tab is for; the preview is the export contract's face. Deferring the drawing keeps every row's preview, just not before it is on screen |

---

## 6. Ordered steps

Each step is TDD: the test that must fail is named first, then the change, then
the gate. `npm run quality:changed` after every step; `npm run verify` at the
end.

**Step 0 — Witness the cost (no production change)**
`tests/upload_response.test.tsx` + `tests/upload_perf_budgets.test.tsx`, fixture
with records + decorative defaults, fake observer. Record the baseline in the
test names/output (`mount 5,980 ms, zoom 918 ms, 1,000 reads, 1,000 prepares,
5,000 parses`). They must fail against today's code and pass at Step 8.

**Step 1 — D1 `previewArt` cache**
Failing test: mount 1,000 rows → `buildSvgPreview` (pure parser) called ≤ 120
times. Change: `src/svg/previewart.ts` (LRU 400, key `fnv1a32(text):length`),
`UploadPreview.ratioOf` and `SvgPreviewBox` read it; `SvgThumbs` shares it.
Gate: parse count; preview html/ratio parity on the `tests/svg*` suite.

**Step 2 — D4 fingerprint + row-settings cache**
Failing test: `restaleRows` at 1,000 rows with `badgeEnabled: true` calls
`settingsFingerprint` 0 times and costs ≤1 ms; `settingsFingerprint` ≤1 µs
typical. Change: template sub-hashes, `rowSettingsCached`, `settingsKey` on the
row, `restaleRows` key comparison. Gate: the stale parity table (record
fingerprint, source fingerprint, badge/size-guide toggles) stays exact.

**Step 3 — D3 memo boundaries**
Failing test: one zoom step → 0 fingerprints, 0 parses, ≤60 preview renders and
**0 row renders** for rows outside the window. Change: `memo(UploadPreview)`,
`PreviewViewContext`, primitive props, `keyOf` from memoized hashes.

**Step 4 — D2 box-only zoom**
Failing test: 1,000-row zoom step ≤ 90 ms React with 0 parses. Change:
`zoomBoxFit(thumb, art.ratio)` inside the preview; delete the `ratioOf` parse
path.

**Step 5 — D5 window**
Failing test: with 1,000 rows and a 40-row window, mount issues ≤60 reads and
≤60 prepares; a scroll that brings 40 more rows in issues 40 more; a row that
never intersects issues none. Change: `usePreviewWindow`, placeholder with the
final box, `data-state`, idle chunking. Migrate upload tests that read a preview
of a far-away row (set the fake window to "all", or scroll that row in).

**Step 6 — D6 fan-out**
Failing test: badge chip toggle → ≤60 row renders, 0 full-list `visibleRows`
derivations, one localStorage write; background preset → 0 fingerprints.
Change: content-keyed `visibleRows`, counts from `panelcounts`, memoized
`UploadRowBadges`, deferred badge-store write.

**Step 7 — D7 chunking**
Failing test: 5,000 rows → every row mounted, no commit over 400 ms in the
Profiler stream, first chunk painted before the last. Change: ordered chunking
with `startTransition`; mounts from `g.visible` slices.

**Step 8 — Budgets and browser lane**
Turn Step 0's tests green; add `tools/upload-response-bench.mjs`; record the
harness numbers in the SOR page; write the archival results section.

---

## 7. Budgets and acceptance

### 7.1 Exact counts (harness-independent — the primary gate)

| @1,000 rows | today | target |
|---|---:|---:|
| reads on mount | 1,000 | ≤60 |
| `prepareExportSvg` on mount | 1,000 | ≤60 |
| document parses on mount | 5,000 | ≤120 |
| parses on one zoom step | 1,000 | **0** |
| fingerprints on one zoom step | 1,000 | **0** |
| fingerprints per dispatch, badges on | 1,000 | 0 |
| `prepareExportSvg` on a settings edit | 1,000 | ≤60 |
| row renders on a settings/zoom edit | 1,000 (the 1,000 fingerprints prove every row re-rendered) | ≤60 |
| row renders on a badge toggle | 1,000 | ≤60 |
| reads/prepares/parses on row click, arrow, checkbox | 0 | 0 (unchanged) |

### 7.2 Harness time (same fixture, same runner)

| @1,000 rows | today | target | note |
|---|---:|---:|---|
| mount wall | 5,980 ms | **≤2,400 ms** | floor alone is ~1,900 ms |
| mount React | 3,391 ms | ≤1,950 ms | floor 1,870 + ≤80 |
| preview-attributable mount (mount − floor) | ~1,520 ms | **≤150 ms (−90 %)** | the part this pass owns |
| zoom step React | 918 ms | **≤90 ms (−90 %)** | |
| settings edit React | ≈1,000 ms (not driven separately; same row path as zoom plus prepares) | ≤150 ms | windowed prepares |
| badge toggle React | whole-list | ≤120 ms | |
| row click / arrow / checkbox | 5.0 / 3.8 / 5.2 ms | ≤10 ms | no regression |

| @5,000 rows | today | target |
|---|---|---|
| mount | does not finish (SIGKILL 114 s) | **completes ≤12 s** |
| longest single commit | (n/a) | **≤400 ms** |
| reads on mount | (n/a) | ≤60 |
| zoom step | (n/a) | ≤150 ms |
| row click / arrow / checkbox | (n/a) | ≤15 ms |

### 7.3 Browser lane (the user-facing acceptance)

Measured with `tools/upload-response-bench.mjs` on the same fixture family and
the same 1,000/5,000 rows, where per-node cost is a browser's:

| Metric | Target |
|---|---|
| mount to first paint | ≤ 20 % of today's (≥80 % faster) |
| zoom slider step p95 | ≤ 50 ms |
| settings keystroke p95 | ≤ 16 ms |
| badge toggle p95 | ≤ 50 ms |
| 5,000-row mount | completes, no task over 250 ms |

If the browser lane shows mount still above 20 % after Steps 1–7, the remaining
cost is the row DOM floor (22 nodes × rows). The next lever there is fewer nodes
per row, which changes no behaviour but does change the markup contract; that
would be proposed separately rather than smuggled into this pass.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| A deferred preview shows the wrong/past document | `previewArt` and `useExportPreview` are content-keyed; `useSvgText` keeps its (folder token, path) identity contract; the placeholder never paints a document |
| Layout shift while scrolling | The placeholder gets the final box from the cached ratio (ratio 1 until known), and the frame replaces it in place — no width/height change after paint |
| Cache memory (400 documents) | 400 × (10 KB text + html) ≈ 4–8 MB ceiling, LRU eviction; the prepared-text cache already uses the same cap |
| `IntersectionObserver` missing in happy-dom | Fallback "all eligible" = today's semantics; the perf test installs a fake observer, the only place layout is simulated |
| Tests that assert a far-away row's preview | Step 5 migrates them explicitly (fake window "all" or scroll the row in); `upload-prev-<id>` and `data-version` are unchanged |
| RULE 20 (shadow isolation) | The paint path is untouched: same `PREVIEW_CSS + html` write into a per-row shadow root; the cache stores the sanitized artifact only |
| RULE 24 (identity) | The cache is keyed by content, never by path; a folder rescan still re-reads (`rootToken` in `useSvgText`) |
| RULE 25 / I-73 | No change to selection, gestures or history; the gesture tests in Step 0 assert the unchanged 0-work gesture window |
| RULE 16 size gates | New modules stay small and single-purpose; `UploadPreview`/`UploadRow` do not grow past the gate |
| Chunked mount hides rows from a synchronous assertion | `upload-row-count` comes from `g.visible.length`; `settle()` drains chunks; the acceptance test counts every row after settle |
| Decoration template hashes drifting | Step 2's parity test compares the composed fingerprint against today's for a matrix of fields, so a stale sub-hash fails loudly |

---

## 9. Gates for the implementation pass

1. `npx tsc --noEmit`, `npm run lint`, `npm run quality:changed`,
   `npm run verify:fast` at every step; `npm run verify` before the push.
2. `tests/docs_navigation.test.ts` stays green (this page and the SOR page are
   linked from the router; current pages stay under 9 KB, the router under 5 KB).
3. The full suite's upload family (`tests/upload_*`) keeps its behaviour:
   previews, staleness, badges, metadata, export, download, hotkeys.
4. Step 0's count assertions plus §7.2 budgets are the definition of done for
   §7.1/§7.2; §7.3 needs the external browser tools and is reported separately.

---

## 10. Status

- [x] Research: measurements, root causes, rejected alternatives
- [x] Redesign: D1–D8, ordered steps, budgets, risks
- [ ] Implementation (Steps 0–8) — not started, this pass is documentation only

No file under `src/`, `tests/` (except the deleted probes) or `tools/` was
modified in this pass.
