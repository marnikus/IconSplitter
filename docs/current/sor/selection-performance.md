# Large-list selection presentation

Part of [shared state](shared.md); gestures remain [RULE 25](../rules/BEHAVIOR.md#rule-25) / [I-73](invariants/shared.md#i-73). Applies to Batch, Selection V2, Generate SVG and SVG to upload. Sheets has no checkable image list.

## One state, inexpensive projection

Canonical checked ids stay in existing React/app-store arrays, with unchanged
history/session formats. Lists never keep an independent selection state.
`ui/checkedrows.ts` registers mounted row/input bindings. A layout effect projects
each committed snapshot to native checkbox **properties** and the existing
`.selected` row class before paint. Only changed properties/classes are written.
All rows/controls remain mounted; no virtualization, deferred/chunked selection,
hidden rows or provider/file work on selection. Filtering unmounts bindings,
not hidden checked ids; remounting projects the current snapshot.

Row shells no longer receive checked arrays. A 1000-item select-all updates one
indexed registry instead of rerendering 1000 checkbox/presentation trees.
A row-data/active change reapplies selection after React updates its base class.
Active scrolling, keyboard/checkbox events, eligibility, anchors, bulk scopes and
undo/redo still use their existing handlers. Row background changes are instant:
bulk selection must not launch 1000 simultaneous colour animations. Zoom sizing
behaviour remains unchanged.

## Presentation boundaries and invalidation

`ui/rowpresentation.ts` bridges event callbacks to the latest committed handler
without changing their identities. Ordinary data remains reactive; function-valued
render dependencies such as thumbnail loaders explicitly retain their identities.
Memoized row contents preserve image/preview trees and local UI state during
selection. Source, metadata, versions, status, zoom, background, export settings,
root generation, badges and preview entries still invalidate their consumers.
Batch compares every row data field except its legacy `selected` processing
mirror; reconciliation reads that flag directly, never searches the whole list
for every row. Its preview-freshness lookup uses an indexed path map. Shared
visible deselection and SVG affected-scope derivation use Set membership.

## Verification and timing

- `tests/checkedrows.test.tsx`: 1000-row projection without shell renders,
  data/class updates, restoration, filtering/remount and binding cleanup.
- `tests/rowpresentation.test.tsx`: fresh callbacks/return values, reactive loaders,
  full data comparison, source/status/preview invalidation.
- `tests/selection_response.test.tsx`: real four-list preview/format algorithms,
  zero selection-only presentation work, native checks/classes, linear Batch
  reconciliation and no per-row background animations. Spies delegate to real code.
- Existing all-tab selection/history/preview suites protect semantics.

Reproducible Chromium fixture/runner: `tools/perf/selection-response.html`,
`tools/selection-response-bench.mjs`; production build config
`tools/perf/vite.selection.config.ts`. [Plan, methodology and measured results](../../archive/2026-10-26-selection-response/README.md).
Timing results are fixture/browser measurements, not universal hardware guarantees.
