# Selection review V2 — design (2026-10-01)

A second Selection surface built from the prepared template
`design temp/selection tab V2/v2 selection tab.html`: a **full-width list
review** with paired Original/AI thumbnails, a zoom slider, real
multi-selection and bulk approve — plus a switchable **comparison** layout.
V1 (`src/selection/`) stays untouched and keeps its own tab; V2 becomes a
fourth Workbench tab (`Selection V2`) that **reuses** V1's discovery,
filtering, sorting, decision reducers and atomic persistence. TDD; RULE 16/18
budget on every new file (fn ≤ 30 LOC, ≤ 4 params via prop objects, files ≤ 300).

## Layering decision — why V2 wraps V1

The spec's four states must stay separate ("keep view state, selection state,
decision state and persistence separate"). They already have owners:

| State | Owner (existing) | V2 addition |
|---|---|---|
| decision + discovery | `src/selection/state.ts` reducers, `reviewstore.ts` IO | none (reused as-is) |
| filter + sort | `lib/reviewfilter.ts`, `lib/reviewsort.ts` | `pairing` filter added |
| checkbox selection | — | `lib/reviewselect.ts` (new, pure) |
| view prefs (mode, zoom) | — | `lib/reviewprefs.ts` (new, pure) + `selectionv2/prefsstore.ts` |
| bulk transition | — | `withBulkDecision` in `selection/state.ts` + `lib/reviewbulk.ts` rule |

`useSelectionV2()` calls `useSelection()` and adds only what V1 lacks. No
second scan, no second decision writer (RULE 1/3, no duplication §16.4).

## New pure modules — `src/lib/`

### reviewselect.ts — checkbox selection (never the review status)

```
toggleChecked(checked, id)        -> string[]      // add or remove one
setChecked(checked, ids, on)      -> string[]      // add/remove many (select all / deselect)
checkState(visibleIds, checked)   -> "none"|"some"|"all"   // header checkbox incl. indeterminate
checkedInView(visibleIds, checked)-> string[]      // what a bulk action may touch
```

Selection is keyed by **stable pair id**, so sorting/filtering never lose it
(spec §9). Checked items stay checked when filters change, but a bulk action
only ever applies to `checked ∩ visible` — hidden items are counted and
reported, never silently changed (spec §5).

### reviewbulk.ts — the bulk rule

```
planBulk(pairs, ids)  -> { eligible, skipped }   // incomplete pairs (a side missing) are skipped
bulkMessage(out)      -> "3 approved · 2 skipped (incomplete) · save failed"
```

Missing pairs are never approved silently (spec §6). One summary string for
the whole operation → one toast, not one per image.

### reviewprefs.ts — persisted view prefs (RULE 13)

```
THUMB_MIN 48 · THUMB_MAX 240 · THUMB_STEP 4 · THUMB_DEFAULT 84
ViewMode "list" | "compare"
clampThumb(n)          -> clamped, step-snapped px
thumbLabel(px)         -> "128 px"
parsePrefs(text|null)  -> ReviewPrefs   // corrupt/absent -> DEFAULT_PREFS, never throws
serializePrefs(p)      -> JSON string
```

`selectionv2/prefsstore.ts` owns the localStorage key
`iconSplitter.selectionV2.prefs.v1` (read via `parsePrefs`, so a corrupt
payload costs one ignored load).

### reviewfilter.ts — `pairing` filter added

`ListFilter` gains `pairing: "all" | "complete" | "incomplete"`; `ALL_FILTER`
defaults to `"all"`, so V1 behaviour is unchanged. "incomplete" surfaces
*AI result missing* / *Original missing* pairs (spec §8 missing-pair filter).

## Decision/state additions

* `selection/state.ts` → `withBulkDecision(s, ids, d, nowIso)` →
  `{ state, applied, skipped }`: one state transition for the whole batch,
  records rebuilt once.
* `selection/useSelection.ts` → `decideBulk(ids, d)`: one `setS`, one
  `saveDecisions` call, one toast (spec §6 "one logical operation"). On write
  failure the in-memory change stays and `writeWarn` + Retry appear, and the
  toast names the affected count (partial-failure report).

## UI — `src/selectionv2/*` (template-faithful)

```
SelectionV2Panel   shell: source bar, banners, filters, mode switch, bulk bar,
                   list | comparison, status footer, hotkeys, toast/busy
SourceBar          path pill · Rescan · recursive note · total/pending/approved/
                   declined chips · view-mode segmented control
FilterGrid         date tabs (All/Month/Range) · From · To · Status (incl.
                   Missing pair) · Sort by · Order · "Showing N pairs" · Clear
BulkBar            header checkbox (checked/indeterminate) · "N selected" ·
                   "across N visible pairs" · Select visible · Deselect all ·
                   ZoomSlider · Approve selected (N) · Approve visible list (N)
ZoomSlider         range 48–240 step 4, min/max labels, live "128 px" output,
                   aria-label "Thumbnail maximum height", persisted
ReviewList         panel head (title + hotkey hints) · column header · rows ·
                   footer summary · empty/no-match states
ReviewRow          checkbox · Original+AI thumbnails · file/relPath/pairId ·
                   created · dimensions/format/size · status badge ·
                   Open Original / Open AI result · Decline / Approve
ThumbPair          two labelled thumbnails; height = slider value, width from
                   the image's own aspect ratio (never stretched, never
                   upscaled past natural size), decode failure -> placeholder
```

Comparison mode renders V1's `CompareView` unchanged (spec §10: same decision
state, side-by-side, per-side Open-in-Explorer). Status bar reuses V1's
`StatusFooter` (rescan age, diff counts, retry count, progress).

### Active row vs checked rows

* **Active** row = the keyboard target (`core.selectedId` from V1 state):
  violet background + inset left bar, `aria-current="true"`, roving
  `tabIndex`, scrolled into view on arrow navigation.
* **Checked** rows = bulk targets: checkbox + subtler background.
* Clicking the row body activates without clearing checks; the checkbox
  toggles a check without moving the active row.
* `A` approves / `D` declines the **active** row; with `autoNext` on the
  active row advances to the next pending pair (spec §7).

### Bulk confirmation

Both approve buttons carry the affected count in their label and use a
two-step arm/confirm (`Approve selected (3)` → `Confirm approve 3?` + Cancel),
so the number of affected items is visible before the decision is applied
(spec §6). Escape or another control disarms.

### A11y choices (deviation from the template, deliberate)

The template marks the row container `role="listbox"`/`option` with
`aria-selected`. An `option` may not contain focusable children, and every row
has a checkbox and four buttons — so V2 uses `role="list"` + `role="listitem"`
rows, a labelled checkbox per row, real button text for every action, and
`aria-current` for the active row. Status is always glyph **and** text
(`✓ Approved`, `⚠ AI result missing`), never colour alone.

## Storage map (additions)

| Where | What |
|---|---|
| localStorage `iconSplitter.selectionV2.prefs.v1` | `{ mode, thumbHeight }`, validated on read (RULE 13) |
| everything else | identical to V1 (`<root>/review-decisions.json`, IndexedDB root handle under the same `__selection__` key, so both tabs share one root) |

## Negative tests (must exist)

selection: single/multi/select-all/deselect-all/indeterminate, selection
surviving filter + sort changes, hidden checked items excluded from bulk;
bulk: eligible/skipped split, changed decision, partial save failure (applied
in memory + honest failure text), zero-eligible disabled state;
prefs: clamping at both ends, step snapping, corrupt/absent payload, restart
persistence; pairing filter: complete vs incomplete vs all;
DOM: view-mode switch, list has no comparison panel, both thumbnails per row
with labels, active-row highlight + A/D, slider min/max/value, select-all
scope after filtering, approve selected / approve visible, rescan keeping
decisions + zoom, empty root, empty result, missing side, corrupt JSON,
keyboard labels.
