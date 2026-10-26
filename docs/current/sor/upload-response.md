# SVG to upload — response redesign

Status (2026-10-26): **researched/proposed, not implemented**. The shared
[selection response design](selection-performance.md) is already shipped; the
Upload-specific work below remains separate. No controls or production behavior
change in this research delivery.

## Evidence and scope

The full `UploadPanel` with `HistoryProvider`, real discovery/assembly/reducer and
preview hooks was exercised with 100/1,000 local rows, seeded committed package
records and zero/sparse/full saved local pins. Only filesystem/handle storage and
unavailable transport were replaced. No provider calls. Real AS-IS settings isolate
warm gestures; these results do **not** measure cold prepared geometry or rendering
of complex artwork. Source/record hashes in the seeded package helper are synthetic;
these are orchestration fixtures, not export correctness evidence.

On each measured warm gesture the existing implementation reloaded saved settings,
read five boot keys and ran a metadata summary and a full download plan, even on
active-only changes. With 1,000 saved full local snapshots, settings reload alone
cost 16–21 ms in the diagnostic run. Opening global settings with 1,000 checked
icons called `rowSettings` 3,000 times (three decoration summaries).

A separate **zero-row**, real-reducer diagnostic isolated override-map copying:
1,000 existing pins took 232 ms to patch and 1,234 ms to reset in one run. Each
batch iteration spreads the current map, giving quadratic work when map and patch
sizes grow together. These numbers exclude row stale projection and persistence.

All times are Node/Happy DOM diagnostics with spies, **not browser event→paint,
medians, a production speedup or universal budgets**. Method, raw observations,
limitations and detailed implementation sequence:
[research record](../../archive/2026-10-26-upload-response-research/README.md).

## Proposed invalidation boundaries

| Change | Work allowed | Work excluded |
|---|---|---|
| Active id only | Active/detail projection | Boot reads, row selection summaries, download planning, geometry |
| Checked ids | Header, selection-sort when relevant, selected summaries | Boot reads, cold SVG rebuilds |
| One metadata/run update | Changed row and affected summaries | Re-fingerprinting every unchanged row |
| Local settings batch | One map copy and changed ids' stale projection | One whole-map clone per id |
| Global defaults | One necessary inheritor pass, previews when visual key changes | Rebuilding unaffected pinned rows |
| Closed settings dialog | No selected decoration summaries | Eager popup derivation |
| Download confirmed | Exact committed-artifact/collision-safe plan | UI-count shortcuts used as an execution plan |

## Implementation order / acceptance (not yet implemented)

1. **P0: isolate boot.** Lazy mount initialization for boot and refs; validate
   stored payloads on mount exactly as today. No global cache that leaks keys,
   roots or settings across remounts. Regression: zero boot/settings reads during
   warm active/check/header/dialog gestures; reload honors newly persisted values.
2. **P0: batch maps once.** One immutable clone, then apply all pins/removals;
   preserve empty/null deletion, applied-decoration semantics and one undo entry.
   Property-read/work-count regressions should establish linear map work, not a
   flaky millisecond threshold. Preserve originals and no-op/unknown-id behavior.
3. **P1: narrow summary dependencies.** Explicit rows/checked/overrides/committed
   record dependencies, not the whole `UploadApi`. Active, toast, progress and
   dialog changes must not rebuild summaries. Compute metadata categories in one
   pass. Count committed artifacts without allocating destination plans; execute
   the unchanged exact planner only when downloading. Prove count/plan parity
   for SVG/JPEG/EPS, missing/partial records and name collisions.
4. **P1: target row invalidation.** Single-row metadata/run updates recompute only
   the changed row; local batches only changed ids. Global settings still require
   correct inheritor invalidation. Audit the existing stale projection's omission
   of `applied` decorations as a distinct correctness issue before changing it;
   do not preserve a wrong stale decision merely for identity stability.
5. **P2: dialog derivation.** Resolve effective settings once per selected id and
   feed shadow/badge/size-guide aggregators; preserve mixed values, hidden checks,
   inherited defaults, local pins and explicit Apply-as-local. Closed guard stays.
6. **P2, conditional on browser evidence: preview scheduling.** Profile distinct
   complex SVGs and cold settings changes before picking an executor. Existing
   120 ms per-row timers debounce but do not limit aggregate synchronous work;
   the cache holds 400 results. Consider a bounded, active/visible-priority queue
   with key-based in-flight deduplication, yielding between exact prepare jobs,
   stale-result protection and bounded memory. Do not replace export geometry,
   suppress offscreen work forever or label an old source as a prepared result.
   Workers require a DOM/native dependency audit first, not an assumed speedup.

## Verification and next measurement

Owners: `useUpload.ts`, `UploadPanel.tsx`, `statemodel.ts`, `rowmodel.ts`,
`downloadactions.ts`, decoration-selection helpers and `exportpreview.ts`.
Diagnostic owners: `tests/upload_response_research.test.tsx` and
`tests/upload_response_reducer_research.test.ts`. Existing gesture/history,
selection-sort, metadata, decoration and real export suites remain mandatory.
No new selector handles; research uses the existing Upload row/check/header and
settings-open/backdrop handles.

Before each production phase: fail its semantic/work-budget regression first,
then implement and rerun unchanged gates. Browser acceptance needs actual complete
UploadPanel event→paint p50/p95 for active/checkbox/header, typing, bulk apply/reset,
settings-open and cold previews at 100/1,000+ distinct icons, saved snapshots and
committed packages. Capture input during queued previews and ongoing progress;
compare the same build/workload/hardware. No Chromium binary was available for
this investigation, so those measurements and any ≥80% latency claim remain open.
Preserve visible controls, nearest-pending order, accepted-metadata approval,
request-local/full cancellation, completion audio, global undo and exact exports.
