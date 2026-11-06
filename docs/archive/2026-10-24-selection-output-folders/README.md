# Selection V2: exclude output folder trees

## Request and acceptance contract

Selection V2 must not discover review rows from `export`,
`AI source regeneration versions`, or `SVG versions`. Match whole directory
names case-insensitively, at every depth, and prune every descendant regardless
of filename/extension (including metadata). Picking an excluded directory itself
must produce an empty review scan without reading its contents. Ordinary source
pairs, similarly named source folders, and `_split_output` remain reviewable.
An excluded tree must not establish split scope or contribute outside counts.

## Dependency map / boundaries (before implementation)

- `selection/rootsource.ts` owns Selection V2's scan, decisions, scope, source
  index and checked-id reconciliation. Its narrow `imageartifact` filter is the
  bug: exported SVGs and noncanonical/nested version files survive it.
- `lib/fs.ts:readDirTree` and `lib/scan.ts:walkTree` already accept whole-name,
  case-insensitive directory ignore lists; the filesystem adapter prunes before
  descending or reading files. Neither rejects the picked root itself.
- `lib/svgimgreg.ts:IMAGE_REGEN_DIR` owns the image-version folder spelling.
  `lib/svgfile.ts:svgFileName` and `svg/saveversion.ts` currently write SVG
  versions beside the pair, not into a version directory. Honor the requested
  `SVG versions` directory name without changing that storage layout; keep the
  existing versioned SVG filename filter outside excluded folders.
- `selection/pairstore.ts` reads the scanned sidecars plus a legacy root file.
  An excluded picked root must bypass both traversal and metadata loading.
- `selection/state.ts:applyScan` builds rows from the scanned pairs only.
  `lib/session.ts:pruneIds` deliberately treats an empty set as an unknown
  scan; completed empty scans instead need authoritative checkbox reconciliation
  in rootsource so stale output-only checks disappear.
- `svg/svgfiles.ts`, image-main resolution, sidecar version references, Upload,
  generic pairing, and general filesystem reads must remain unchanged.

## Planned steps (TDD)

1. Update the two superseded narrow image-folder scan assertions. Add regression
   coverage for every excluded name, root picks, mixed-case/deep subtrees,
   multiple media types, unreadable files/metadata, near-miss source names,
   split-scope isolation and stale checked rows. Add a real V2 DOM regression
   reproducing exported phantom rows under a batch split. Witness RED.
2. Add a small pure review-folder policy; use it for Selection traversal and
   flattening, bypass excluded picked roots, and reconcile checked ids against
   every completed scan (including empty scans). Witness GREEN, keeping direct
   version reads and source pairing tests intact.
3. Update the Selection owning contract and current docs router. Run types,
   lint, changed-function quality against 4616d1e, focused tests, fast and full
   verification, preserving thresholds, isolation, native gates and assertions.
4. Record measured outcomes here and append the quality ledger without reading
   it. Stage only scoped source/tests/docs; commit with verification/attribution
   and push the active feature branch. Exclude generated dist/dependency churn.

## Results

- Implemented the pure `lib/reviewfolders.ts` policy and Selection-only pruning
  before traversal, media/metadata reads and split-scope discovery. An excluded
  picked root bypasses both the walk and legacy decision-file loading.
- Removed Selection's obsolete narrow image-artifact filter; its separate SVG
  discovery consumers remain intact. No version storage/read/write layout,
  generic pairing, filesystem defaults or Upload discovery was changed.
- Completed scans now reconcile checks and the range anchor even when no pairs
  remain, while preserving valid selection state by reference.
- Witnessed **13 RED regressions** (56 passed) before implementation. The real
  V2 DOM fixture reproduced **13 rows instead of one**. With folder pruning in
  place, the stale-anchor and empty-scan checkbox regressions still failed;
  fixed them in the completed-scan reconciliation. Corrected the new DOM test's
  zero-attention expectation to match the existing hidden-at-zero badge.
- Focused GREEN: **200 tests / 10 files**, including Selection, pairing,
  session/checkbox rules, SVG scan/runner, image versions and direct file reads.
- Standalone `npx tsc --noEmit`, `npm run lint` (0 errors, 23 existing warnings),
  and `npm run quality:changed -- --base 4616d1e` passed. Both changed production
  files pass the size/complexity gate; the new policy is 100% covered.
- Initial `verify:fast` failed one unchanged Upload T2 restore assertion
  (`Interrupted` status was absent). No Upload or harness change was made:
  its full isolated suite passed **73/73**, then the complete fast rerun and
  full verification both passed. Initial failure and reruns are retained in
  `/home/user/selection-output-folders/{fast,upload-check,fast-rerun,full}.log`.
- `npm run verify:fast -- --base 4616d1e`: all five lanes PASS; **2581 tests /
  246 files**. `npm run verify -- --base 4616d1e`: all six lanes PASS, including
  uninstrumented native performance **30 tests / 5 files**, then the same full
  coverage suite. No skips, reduced scope, threshold or assertion relaxation.
- Coverage: src/lib **98.03% lines**, 98.02% functions, 94.98% statements,
  89.28% branches (unchanged rounded aggregate). `reviewfolders.ts`: 100% on
  every metric. Build: **1723.61 kB**, gzip **509.79 kB**.
- Updated owning behaviour, invariants/scope, selectors, owners/tests inventory
  and the current router. Append-only measured ledger entry; generated dist,
  dependencies, coverage/caches and evidence logs are not staged.
- Existing blocked Requesty catalog-fetch diagnostics appeared in verification;
  no explicit provider generation/edit request was initiated for this work.
