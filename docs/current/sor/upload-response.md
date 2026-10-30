# SVG to upload — response redesign

Status (2026-10-26): **implemented** for the measured orchestration, bulk settings,
stale projection and settings-dialog bottlenecks. Builds on the shipped shared
[selection response design](selection-performance.md). All controls and exact
export preparation remain in place. This is not a browser latency guarantee.

## Runtime boundaries

| Change | Work allowed | Work excluded |
|---|---|---|
| Active id only | Active/detail projection | Boot reads, selected summaries, download planning, geometry |
| Checked ids | Header, selected summaries, selection-sort when relevant | Boot reads, cold SVG rebuilds |
| One metadata/run update | Changed row's stale projection, affected summaries | Fingerprinting every unchanged row |
| Local settings batch | One map copy per layer; changed ids' stale projection | One map clone per id |
| Global defaults | One inheritor pass, affected previews | Fingerprinting unchanged pinned/applied rows |
| Closed settings dialog | No selected-decoration summaries | Eager popup derivation |
| Download confirmed | Exact record-artifact/collision-safe plan | UI counts substituted for an execution plan |

## Implementation and ownership

- `useUpload.ts`: lazy mount-owned boot and refs. Saved settings/config/prefs/prompt/
  presets still validate on mount, including after unmounted undo or remount.
  There is no global boot/settings/credential cache. Action context memo depends
  on its actual fields, not the freshly allocated parameter object.
- `UploadPanel.tsx` / `bulksummary.ts`: one selected-row pass for metadata categories
  and record-listed artifact counts, memoized by **rows + checked**. The separate
  local-pin count depends on **checked + overrides**, including hidden/unloaded
  checks as before. Active, dialog, toast and progress-only changes do not recount.
- `lib/upload/download.ts`: count-only render path shares artifact eligibility
  with the real planner. It does not construct destination names/items. Execution
  still uses `downloadactions.ts` / `planDownload`, with collision suffixes,
  missing-record/partial-output handling and the existing copy/readback rules.
- `lib/upload/settingspatch.ts`: one atomic immutable map replacement for local
  pins and applied values (`mergeApplied` remains a compatible alias). Null/empty
  entries delete; nonempty entries replace, not merge. Unknown/unloaded ids remain
  in the maps. Empty/undefined patches preserve the original map. One bulk gesture
  still records one global undo entry; default settings/checks are not mutated.
- `staleprojection.ts` / `statemodel.ts`: metadata/run updates project only their
  id; local patches project the union of override/applied ids. Rows outside that
  set retain identity. The array traversal remains O(rows), but effective-settings
  allocation and fingerprinting are O(changed loaded ids), not O(all rows).
  Global changes compare nested settings semantically and project only rows that
  inherit changed fields; equal defaults do no fingerprint work. Running status,
  errors and committed record status retain their prior lifecycle semantics.
- Stale checks now use **defaults → applied decorations → local pins**, exactly
  like assembly, previews and export. This fixes the old omission of `applied`
  on metadata/run/default/local updates; local false/null pins remain authoritative.
- `UploadDialogs.tsx` / `decorationselection.ts`: the guarded open-dialog child
  resolves each checked id once and memoizes by checked/defaults/overrides/applied.
  Shadow dimensions, badge and size-guide summaries share those effective values.
  Empty/default, mixed, hidden-check and local-over-applied semantics are unchanged.
  The three standalone selection helper APIs remain compatible.
- `exportpreview.ts`: an already-scheduled debounce callback rechecks the result
  cache before preparing. Identical subscribers therefore reuse a result produced
  by an earlier timer while it remains cached. Distinct keys remain independent;
  superseded/unmounted jobs still cancel. Exact `prepareExportSvg`, the 120 ms
  debounce, 400-entry bound and failure/source fallback are unchanged.

## Evidence and regression owners

Historical full-panel baseline: [research](../../archive/2026-10-26-upload-response-research/README.md).
TDD, before/after observations, verification and remaining limitations:
[implementation record](../../archive/2026-10-26-upload-response-implementation/README.md).

- `tests/upload_response_research.test.tsx`: actual `UploadPanel + HistoryProvider`,
  discovery/assembly/reducer/preview hooks at 100/1,000 rows with none/sparse/full
  persisted pins and seeded package records. Asserts zero warm boot reloads and
  planner calls, zero active-only selected summaries, one summary for changed checks,
  one effective-settings resolution per selected icon on popup-open, and fresh
  persisted defaults on remount. No network; real AS-IS previews isolate warm work.
- `tests/upload_response_model.test.ts`: single-row/batch/global stale work budgets,
  stable unaffected rows, applied precedence, running state and immutable inputs.
- `tests/upload_response_summary.test.ts`: all eight SVG/JPEG/EPS artifact subsets,
  collisions and missing records; parity with original metadata selectors; atomic
  map replacements and shared decoration summaries.
- `tests/upload_response_reducer_research.test.ts`: real zero-row reducer diagnostic
  at 100/1,000/2,000 existing pins, with input immutability and complete reset checks.
- `tests/upload_preview_dedup.test.tsx`: real preparation, identical subscribers,
  distinct keys and superseded/unmounted jobs. Fake time controls debounce only;
  no substituted geometry or cached-success test bypass.
- Existing Apply-as-local, undo, download, live preview, compact controls, metadata,
  accepted-approval sorting, real export/format fixtures and native alarms remain
  required. No selector/control changes; existing Upload handles are reused.

## Measurement limits / cold previews

Original 1,000-key zero-row patch/reset samples: 231.719 / 1,233.745 ms; isolated
post-change samples: 5.950 / 1.002 ms. These are **Node/Happy DOM diagnostics**,
not browser frames or universal performance budgets. Warm settings reloads dropped
from one per gesture to zero; popup settings resolutions from 3N to N. Stale-work
budgets establish one projection for a single-row event, rather than N.

The retained seeded package helper uses synthetic source/record hashes; it is
orchestration evidence, not export-byte correctness evidence. Three isolated
post-change warm runs and the earlier mixed-run outliers are retained in the
implementation record, not hidden. No statistically controlled browser p50/p95
comparison or ≥80% overall latency claim is established.

No Chromium binary was available. A different cold-preview executor/worker remains
**conditional on browser profiling**, not an unfinished production change: distinct
complex SVG preparation can still be expensive. Per-row timers already separate
jobs but do not cap total geometry work. Do not replace the exact algorithms,
virtualize controls, defer checked state, suppress previews forever or label source
fallback as prepared output. Capture complete-tab event→paint and input during
cold previews/progress before choosing queue/worker/offscreen policies.
