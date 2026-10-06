# Exact file location — 2026-10-06

## Report and root cause

For `icon-bunny-face_AI_7_04_v2.svg`, the copied location ended at
`2026-10-05_18-45-20`, omitting `icon-bunny-face_AI_7/split_04`.
The prior I-28/I-48 contract and tests explicitly required that truncation;
changing path capture again would not repair it. Separately, Generate SVG
prefixed a root-relative version path with its source directory a second time.
The truncation masked that duplicated prefix inside batch trees.

## Design

Keep location copies as folder paths (not filenames), matching the requested
example. Join the captured root with the target's relative parent, dropping
only the filename. Delete all batch/run truncation heuristics. Reuse the same
helper for Batch, Selection V1/V2 and SVG; do not add controls or settings.
SVG uses the shown version's root-relative path directly, falling back to the
pair's root-relative metadata path before generation. Copy-code is unchanged.
Path capture, unknown-root fallback and blocked-clipboard reporting stay intact.

## TDD evidence

Before production edits, six parameterized cases exercised the exact reported
file through the real clipboard action with input/output/month/run/sheet/split
roots. Four failed with the exact reported truncation. Two real SVG panel
button cases covered generated/ungenerated rows; the generated case failed
with `architecture/architecture`. After the fix all eight pass. Old assertions
requiring the wrong ancestor were updated, including Selection V2's DOM test.

## Quality

The fix removes complexity rather than relocating it: four obsolete helpers
and the batch-layout import disappear. No new production functions, storage,
network activity or dependency changes. Required gates and final measurements
are recorded in `docs/current/QUALITY_RECHECK.md`.
