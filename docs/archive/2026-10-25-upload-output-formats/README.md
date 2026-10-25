# Select SVG/JPEG/EPS export formats — plan (2026-10-25)

## Request and contract

Add Export SVG and Export JPEG checkboxes beside existing Also write EPS in
Export settings. SVG and JPEG default ON, EPS keeps its current default OFF.
Only checked formats are delivered. Existing saved settings/packages without
the new fields keep SVG+JPEG enabled; default fingerprints must not churn.

Use the existing settings/overrides model: globals remain live for inheritance,
row edits pin fields, Apply as local captures format choices for checked batches,
Reset restores inheritance and settings undo/redo/persistence preserve flags.

SVG may still be prepared IN MEMORY as the common source for JPEG/EPS when SVG
output is off. Never save that intermediate SVG or render JPEG when JPEG is off.
All seven nonempty format combinations work, including EPS-only and JPEG-only.
Every requested artifact keeps existing validation, metadata and atomic readback.

All formats OFF: report a clear preflight/settings error, write nothing, preserve
the previous package. Export-selected must not solicit paid metadata for rows
with no requested output; mixed batches still settle those rows independently.
An EPS-only conversion failure is a failed export, not a falsely green empty
package. EPS failure with other successful formats keeps the established partial
behavior.

Disabled formats detach from the NEW committed record and Download all on the
next successful export. Earlier files are not deleted just because a checkbox
was unchecked (same policy as existing disabled EPS); the record is authoritative,
so retained old bytes cannot leak into the new package/download plan. Existing
superseded-name housekeeping remains separate from format selection.

## Steps (TDD)

1. Add genuine failing settings/UI and full-pipeline combination tests. Cover
   compatibility/default fingerprint, selected batch pins, all-off/no side effects,
   disabled JPEG render count0, actual on-disk artifacts, metadata readback,
   selective retries/no-op, re-enable, disabled stale files excluded from records/
   downloads, failed EPS-only and existing partial behavior.
2. Add includeSvg/includeJpeg boolean settings (true defaults), validated reads,
   override fields and conditional fingerprint suffix; centralize enabled-format
   semantics including legacy absent fields.
3. Extend planner to build only enabled outputs (shared in-memory geometry is
   allowed), ignore missing disabled outputs and persist format detachments.
4. Make preflight/probes/commit honor formats; reject no-format work before I/O,
   avoid paid metadata for no-output rows, preserve EPS-only failure honesty.
5. Add checkbox controls in both settings scopes with inherited/overridden markers
   and explanatory no-format note. Existing EPS label/behavior remains compatible.
6. Update owning current contract, selector/source/test/storage routes, <=9KB
   current pages and <5KB router; append measured ledger entry unread.
7. Run focused RED→GREEN, types, lint, changed-quality, fast/full verification,
   preserve all native/coverage gates; scoped attributed commit and branch push.

No source SVG edits, no live provider calls, no dependencies, no altered EPS/JPEG
algorithms, no weaker assertions/coverage/budgets, no generated artifacts committed.

## Implementation note

EPS-only introduced an existing optimistic-summary edge: helper-unavailable
warnings promised partial output even without SVG/JPEG, and the batch toast
counted failed rows as exported. Added separate failing UI/summary tests before
fixing those paths. Retain successful/partial/cancel wording where unchanged;
count actual failures in mixed/failed batches. No provider calls were made.

## Completed and verified

- All seven requested combinations delivered with actual file/carrier validation;
  SVG/JPEG default-on compatibility and default hash preserved. No new dependencies.
- Fresh RED: 12 failing format tests before implementation; further EPS-only
  helper warning and failed-batch summary tests also witnessed RED before fixes.
- Focused final:128 tests/10 files PASS, including real supplied SVG EPS-only,
  inherited/local format pins, persistence/history and mixed-batch isolation.
- Types PASS; lint0 errors/23 pre-existing warnings; changed-quality vs c9a99d7
  PASS. verify:fast PASS and full verify PASS:2894 tests/275 files, native30/5,
  production single-file build. Coverage statements95.37%, branches89.81%,
  functions98.21%, lines98.29%; new formats module100% throughout.
- No tests skipped, source/threshold changes, live provider requests, generated
  artifacts or source artwork edits. Disabled old bytes are retained safely.
