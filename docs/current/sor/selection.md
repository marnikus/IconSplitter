# Selection / Selection V2 — current behaviour

See [invariants/selection.md](invariants/selection.md), [path invariants](invariants/paths.md), [selection selectors](../selectors/selection.md), [pair-file deep dive](topics/pair-files.md), [storage](STORAGE.md) and [test owners](TESTS.md).

## Behaviour

Selection:

* Recursive scan pairs `name.ext` with `name_AI.ext` incl. numeric tails
  (`name_AI_9_01.ext`; stable `pair_<hash>` ids, dir-scoped); unpaired files surface as
  "AI result missing" / "Original missing", never silently dropped.
* **The scan is deterministic and atomic (2026-10-05).** `walkTree` sorts
  every folder itself (case-insensitive name order), so the filesystem's own
  enumeration order — which the File System spec explicitly leaves
  unspecified — never reaches the algorithm. `pairEntries` is a function of
  the file *set*: for one pair id the raster result beats the `.svg` artifact,
  the list comes out in `(folder, base, suffix)` order, and a versioned output
  (`X_AI_v2.svg`) is ignored rather than invented as a source row. The shared
  scan also excludes only this app's regenerated image artifacts: a canonical
  `_AI` stem followed by positive `_vN.png`, directly in the case-insensitive
  `AI source regeneration versions` folder (or at its picked root). Other files
  in that folder and similarly named files elsewhere remain reviewable.
* A read that fails (locked / being replaced mid-write) is **not** data: the
  walk retries once, then marks the file `unreadable` with its path — `size 0`
  alone is never evidence, an unreadable file is never reported as changed or
  gone, and a scan performs **zero writes** inside the root (the decision file
  is created by the first save, not by opening a folder).
* One scan may commit: a monotonic ticket (`lib/scanseq`) means an older scan
  that resolves later commits nothing, and an unchanged snapshot commits
  nothing at all (no row replacement, no churn). A completed scan is committed
  in one block, after which only the best-effort id→path cache write is left.
* Review list: thumbnail, filename, relative folder, creation date, status
  chip with text + glyph; search, month / custom-range date filters, status
  filter, sorting by date/status/name/path in both directions, counters.
* Comparison: side-by-side panes with preserved aspect ratio, dims / format /
  size / path per side, 1:1 zoom with synced scrolling, hotkeys A/D/arrows/
  Space/Ctrl+K, auto-advance to the next pending after each decision.
* Decisions persist in each pair’s own `<stem>.svg.json` (I-41); the old root
  `review-decisions.json` is read only as a legacy fallback (I-42). Corrupt files
  warn without destroying in-memory decisions; a failed per-pair write stays
  in memory with a Retry action.
* Rescan diffs added/renamed/removed/unchanged; decisions travel across
  renames via size+mtime identity; orphan records are retained so a
  transiently missing file never destroys a decision.
* Rescan is explicit; an age counter updates without performing a background scan.

Selection V2 (adds to, never replaces, the rules above):

* Two layouts over one state: **List review** (full width, no comparison
  panel, one pair per row showing BOTH an Original and an AI result thumbnail,
  each labelled) and **Comparison** (the V1 `CompareView` panes + a pair
  picker). Layout, filters, selection and decisions survive switching.
* Thumbnail zoom: range slider **48–800 px, step 4, default 84** with a live
  "128 px" readout and both bounds shown; row and thumbnail height follow it
  while dragging, width comes from the image's own aspect ratio (never
  stretched, never upscaled past natural height, never capped). Persisted
  across restarts. This and Generate SVG's `svg-thumb` are the SAME control:
  the range, the clamp and the box rule live in `src/lib/zoom.ts`, the two-slot
  layout in `src/ui/PairedThumbs.tsx`, and neither tab may compute a box of its
  own (I-55) — an 800 px pair is honoured by letting the list scroll sideways,
  which is why the preview column is `max-content` at every breakpoint.
* Checkbox selection is separate state keyed by `pair_<hash>`: new rows start
  unchecked; sorting/filtering keep valid checks, including hidden ones. Header
  checkbox (checked / unchecked / indeterminate) toggles **visible** checks;
  Select visible adds those rows and Deselect all clears hidden checks too.
  Live counts distinguish selected, visible, checked-but-hidden and
  checked-but-incomplete (RULE 25, I-73).
* Bulk review — **Approve selected / Decline selected / Reset selected** only:
  the affected count is `checked ∩ visible ∩ complete` (I-15), shown before
  the button arms; Escape or Cancel disarms. One operation = one transition and
  one summary toast, with a file write per affected pair. Failed writes keep
  decisions in memory with Retry. There is no approve/reset-visible action.
* The **active row** (keyboard target, `aria-current`, scrolled into view) is
  distinct from a **checked row** (bulk target). Plain row click activates and
  sets the Shift anchor **without changing checks**; checkbox/Shift/modified
  clicks follow [Batch's matrix](../rules/BEHAVIOR.md#rule-25). `A` / `D`
  decide the active row; "Next pending after a decision" advances it.
* Extra filter: **Pairing** = all / complete / missing pair.

Everything above runs client-side; nothing is uploaded anywhere.

## State

Selection V2 model (`useSelectionV2` wraps `useSelection`, so decision,
filter and persistence state are V1's and stay single-owned):

```
core: SelectionApi      discovery, pairs + decisions, filter, sort,
                        active row (core.selectedId), write status
checked: string[]       checkbox selection (pair ids) — never a decision
prefs: ReviewPrefs      { mode: "list"|"compare", thumbHeight: 48..800 }
derived                 header check state, bulk scope
                        { affected, blocked, hidden }
```
