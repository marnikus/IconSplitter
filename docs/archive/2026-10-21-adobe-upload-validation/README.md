# Adobe upload validation — investigation and plan

## Problem and findings before implementation

The user reports Adobe Stock imports neither titles nor keywords and supplies
`Contributors Uploaded Files.html` plus its saved resources in commit451dcc9.
The previous independent local reader proved file metadata, NOT Adobe ingestion.
That distinction must be executable in tests and visible in documentation.

Read-only inspection of the supplied frontend identifies a native file input,
`/uploads/presign`, multipart `file` upload and server-backed asset metadata.
The saved title/keyword textarea markup is empty, but the URL-encoded Redux
initializer contains nonempty titles/keywords for BOTH EPS filenames. This
cannot prove whether Adobe extracted or someone manually entered those values.
The supplied original EPS itself contains no XMP or IPTC. It is not evidence
about a fresh, latest-app export. No format change has a demonstrated cause yet.

The snapshot contains account/session initialization: never execute its scripts
or replay its tokens, and never copy its raw state into reports/test fixtures.
Only asset field names/values and public selector contracts are inspected.
A saved frontend lacks Adobe's server-side importer. A local shim that writes
expected metadata into its fields would be a fake acceptance test.

## Steps

1. Add failing tests using the actual saved HTML/bundles: extract only asset
   metadata, locate real upload/title/keyword controls, and recognize that a
   saved page cannot stand in for a new live upload. Preserve originals.
2. Add an opt-in live Playwright/CDP validator for the user's own authenticated
   browser. Require explicit --allow-upload, a live Adobe uploads tab and local
   CDP endpoint; never request credentials or copy a session from the snapshot.
3. Upload uniquely named copies of real JPEG/EPS bytes through Adobe's native
   input. Observe NEW Adobe JSON asset responses for that unique filename,
   wait for processing, identify the new thumbnail and READ Adobe's controls.
   Never fill Title/Keywords, patch metadata APIs, submit or delete assets.
4. Pass ONLY when both new server metadata and selected UI fields match expected
   Title/ordered Tags. Missing metadata, stale/wrong filename, backend failure,
   UI mismatch, timeout, missing login or offline page must fail, not skip/pass.
   Adobe's shown form has no Description field: don't pretend to validate it.
5. Test pure contracts and browser/network boundaries locally, clearly label
   them NOT Adobe importer acceptance. Document runnable live steps/blocked
   conditions, run gates, append measured ledger without reading it and push.

## Real validation requirements / safety

This sandbox has no Adobe account connection and cannot access Adobe hosts.
A saved HTML copy cannot supply the missing backend. Live acceptance must run
in the user's authenticated browser/environment; it creates draft test uploads
only, never publishes. Exact failing latest-export JPEG/EPS bytes are also
needed to diagnose the reported import failure. Do not claim an exporter fix
or successful Adobe ingestion without that evidence.

## Results

Implemented the saved-page regression and guarded live validator, not an
unproven exporter format change. `tools/adobe-stock/{contract,browser}.mjs`
extracts minimal asset fields, verifies live origin/new filename/server data and
reads the selected new thumbnail's actual UI fields. The CLI requires explicit
upload permission, local CDP, a manifest and an authenticated LIVE uploads tab.
It sends exact original bytes under unique draft names, records their hashes,
never fills metadata, never submits/deletes assets, and writes only NEW reports.

### Measured local checks

- TDD: the new contract suite failed before modules existed; final **10/10**
  Adobe contract/tool tests pass, including actual supplied HTML/bundles,
  permission/origin guards, stale/untrusted/missing-field responses, timeout
  failure, safe extraction and real CLI refusal without permission.
- Focused snapshot + existing page + docs: **23/23**, three files passed.
  Snapshot parsing keeps only form controls; captured external resources never
  load or execute. Initial full-DOM parsing was replaced after it exposed
  external stylesheet/resource requests in the harness.
- Supplied-original-EPS CLI preflight: expected nonzero exit, missing embedded
  metadata reported, before browser connection or any upload. This diagnoses
  the fixture only, not the user's as-yet-unprovided fresh failing files.
- `npm run verify:fast`: ALL FIVE LANES PASSED.
- `npm run verify`: ALL SIX LANES PASSED — types14.0s, lint10.8s,
  quality0.5s, native2.6s, coverage178.7s, build7.8s. **2464/2464 tests in
  231 files**, library lines97.96%. No production writer, dependency, threshold
  or supplied snapshot/artwork edits; generated dist excluded.
- Current guide `docs/current/sor/upload-adobe-validation.md` documents live
  invocation, evidence levels, privacy and NOT RUN status. Router budget stayed
  under5000bytes by shortening an existing label, without weakening the gate.

### Acceptance remains BLOCKED, not fixed

**Actual new Adobe upload/ingestion is NOT RUN.** Local contract tests and local
reader success are not substituted for it. This environment cannot reach Adobe
and has no authenticated Adobe browser. The exact reported-failing latest JPEG
and EPS bytes have not been provided (the original EPS fixture has no packets).
Run the opt-in live check in the user's own authenticated test browser and
inspect those actual failing files before claiming the reported issue resolved.
The saved state already contains Title/Keywords for both asset names, but their
provenance (automatic import vs earlier manual edits) cannot be established.
