# SVG to upload — response

Measured state of the "SVG to upload" tab's response at 1,000+ approved pairs,
and the budgets the 2026-10-26 redesign pass accepted. Plan, method and full
evidence: `docs/archive/2026-10-26-upload-response-v2/README.md`. Selection
standards shared with the other tabs: [selection-performance](selection-performance.md).

## 1. Behaviour (unchanged)

The tab lists one row per approved pair, paints each row's live export preview in
a shadow root, and writes nothing until an export is confirmed (RULE 25 and
I-73 are untouched by this work). Every row stays mounted; there is no
virtualization and no hidden control.

## 2. What is already fast

At 1,000 rows, one gesture, measured on the real panel: row click **5.0 ms**,
ArrowDown **3.8 ms**, checkbox **5.2 ms**, each with **0** document reads,
parses, fingerprints and prepares in the gesture window. The Round 2 work
(`useAppSlice`, `selectiondelta`, `checkedrows`) covers this tab; selection is
not the open problem.

## 3. What is slow (today)

| @1,000 rows | measured |
|---|---|
| mount | 5,980 ms wall / 3,391 ms React; 1,000 reads, 1,000 prepares, 5,000 parses |
| mount, no document work (DOM floor) | 1,866–2,006 ms React |
| one zoom step | 918 ms React / 1,209 ms wall; 1,000 parses, 1,000 fingerprints |
| one background-preset click | re-fingerprints every row |
| one dispatch with decorations on | 27.6–28.9 ms @1,000, 138–142 ms @5,000 |
| mount @5,000 | does not complete (worker killed after ~114 s) |

Like-for-like in the same harness, the tab mounts 3–7× slower than Selection V2
at the same row count with *fewer* DOM nodes per row, so the cost is the per-row
document pipeline, not the row markup.

Causes, in order of size: every row reads, prepares and parses its document on
mount (`UploadPreview`); a box-only change (`thumb`) re-parses every document
(`ratioOf` depends on `thumb`); `useExportPreview` hashes the document and the
settings on every render of every row; `rowSettings()` allocates a new object
per render so the row/preview memos never hit; `visibleRows` and the panel's
banner/counters re-derive the whole list per render; a badge toggle writes
localStorage and notifies the whole tab synchronously.

## 4. Accepted targets (not implemented yet)

Counts, at 1,000 rows — the primary gate because they are harness-independent:

| | today | target |
|---|---:|---:|
| reads on mount | 1,000 | ≤60 |
| prepares on mount | 1,000 | ≤60 |
| parses on mount | 5,000 | ≤120 |
| parses / fingerprints on a zoom step | 1,000 / 1,000 | 0 / 0 |
| prepares on a settings edit | 1,000 | ≤60 |
| row renders on a settings or badge edit | 1,000 | ≤60 |

Times, same fixture: zoom step ≤90 ms React (−90 %); preview-attributable mount
≤150 ms (−90 %); mount wall ≤2,400 ms @1,000 and **completes ≤12 s @5,000 with no
commit over 400 ms**. The ~1,900 ms mount floor is the row DOM itself (22 nodes ×
1,000); the user-facing "≥80 % faster mount" acceptance is therefore measured in
the browser lane, where per-node cost is a browser's and the preview pipeline is
the dominant share.

## 5. The redesign in one paragraph

Parse each document once into a cached artifact keyed by content, and take the
zoom box from that artifact's ratio, so a box change parses nothing; key the
export preview by a memoized content key so no render hashes a document or a
settings object; cache the row's effective settings and its fingerprint by
content and let the stale check compare keys instead of re-hashing; deliver
`thumb`/`bg` through a context so a view-only change re-renders previews, not
rows; and gate the read → prepare → parse → paint pipeline to rows within about
1.5 viewports, with a same-size placeholder keeping layout identical (the row,
its checkbox and its actions are always mounted — this is deferred drawing, not
virtualization). Large lists mount in ordered chunks so no commit blocks.

## 6. Invariants this work must keep

- RULE 25 gesture semantics and I-73 cross-tab undo: unchanged
  ([RULE 25](../rules/BEHAVIOR.md#rule-25), [I-73](invariants/shared.md#i-73)).
- RULE 24: a preview never paints another folder's or another row's document;
  the new cache is keyed by content, `useSvgText` keeps its identity contract
  ([usesvgtext](../../../src/svg/usesvgtext.ts)).
- RULE 20: documents still render only in the row's own shadow root.
- RULE 10: one preview implementation for both tabs.
- No row is hidden, no control moves, nothing is written before a confirmed
  export.

## 7. Tests that will hold the line

`tests/upload_response.test.tsx` (call counts per gesture),
`tests/upload_perf_budgets.test.tsx` (the tables above, with a fake
`IntersectionObserver`), plus the existing `tests/upload_*` family for behaviour
(previews, staleness, badges, metadata, export, download, hotkeys). Browser
numbers come from `tools/upload-response-bench.mjs`, which needs the external
browser-tools install.
