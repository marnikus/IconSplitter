# Import named coloured Upload row badges

## Request and preimplementation plan

Bring the feature from `arena/54da14bf-iconsplitter` into the active branch,
without switching branches. Source commit: `10f6776fa3aa76d56f2f30a51fef120c92c2d104`;
common base `bcdf9a8`. The source has one unique commit: named coloured Upload
row labels, catalog management, per-row and checked-set assignment, filtering,
local persistence and global undo/redo. These are organizational labels, not
export artwork badges and not sent to providers.

1. Import the source regression tests first and run them against the current
   implementation to witness the missing feature (including missing modules).
2. Apply the source commit's delta, not its full file snapshots, excluding the
   append-only quality ledger. Resolve conflicts against the active branch,
   keeping Download all shared progress/cancel, collapsed decoration groups and
   four independent padding controls. Never replace current files wholesale
   with older versions or touch generated build/dependency artifacts.
3. Review the extracted dialog owner and all intersecting UI/action/context
   wiring. Add integration coverage that combines row labels with current
   padding/disclosure and download-progress contracts as appropriate.
4. Merge current documentation links/owners/invariants/selector/storage/test
   maps, keeping all pages within existing budgets. Preserve the source design
   as historical evidence and append this import's measured results here.
5. Run focused regressions, types, lint, changed quality, documentation checks,
   fast and full verification with all existing assertions/budgets intact.
   Append the quality ledger unread; commit with source attribution and push
   only `arena/cf992ba5-iconsplitter`.

## Status

Plan recorded before production changes; implementation and verification pending.

## Import results

Applied the source commit's delta with three-way conflict handling, not old
whole-file snapshots. The source quality-ledger edit was excluded without
reading it; this integration gets its own append-only entry. Source design and
all original source test assertions were retained. Conflicts in the panel and
documents were resolved by combining current behavior and the imported feature:
Download all still owns toolbar Cancel while downloading, current progress
headers remain, and the extracted dialog renders the current settings owners.
No branches were switched or created.

Added two current-branch UI regressions: bulk labels include hidden checked
rows without altering their checks, and dialog extraction preserves independent
four-side padding, collapsed groups/rerender state and separate label/settings
undo/redo. A third regression first failed against the source CSS because its
extra filter columns also changed Generate SVG's shared grid. The columns are
now scoped to `.up .svg-filters` at both existing breakpoints; the original
shared grid is unchanged. This is the only source-feature layout adaptation.

Verification evidence:

- Source tests imported before production: all **3 files failed collection**
  because their feature modules were missing; no behavior assertions ran in
  this RED (`/home/user/rowbadge-import-red.log`). After import, **17/17** source
  tests passed (`rowbadge-import-green.log`).
- CSS scope regression: **1 RED -> 1 GREEN**, logs
  `/home/user/rowbadge-import-style-red.log`, `rowbadge-import-integration.log`.
- Focused domain/store/UI/apply/rowmodel/disclosure/padding: **87/87 in 7 files**.
  A nonexistent download-progress filename pattern in this first command did
  not run a download file; the subsequent command used the actual filename.
- Final focused integration (including actual `upload_download_ui.test.tsx`,
  live preview, row-label UI, style and docs): **43/43 in 5 files**.
- Current docs navigation: **4/4 PASS**, after condensing near-budget list/test
  pages without removing contracts or changing byte limits. Router 4993 B,
  test map 8987 B, list selectors 8979 B. Source feature docs/owners/storage/
  invariants and new import integration links are merged with current padding.
- Types, lint (**0 errors / 23 existing warnings**) and changed quality vs
  `5d579cf`: PASS (18 changed production TS/TSX files).
- Initial fast check: **2838/2839**, failing only the known timing-sensitive
  existing missing-API-key toast assertion in `tests/upload_ui.test.tsx:1852`.
  All imported/integration tests passed. No toast implementation, harness,
  assertions or thresholds were changed to obtain a pass; failed evidence is
  retained in `/home/user/rowbadge-import-fast.log`.
- Full `npm run verify -- --base 5d579cf`: **ALL LANES PASSED**, functional
  **2839 tests / 264 files**, native **30 tests / 5 files**, unchanged budgets.
  Evidence `/home/user/rowbadge-import-full.log`. The known toast failure did
  not reproduce; this is not a claimed fix for that intermittent test.
- src/lib coverage **95.32% statements / 89.72% branches / 98.20% functions /
  98.29% lines**; row-badge domain **100% functions/lines**. Single-file build
  **1808.95 kB / gzip 560.34 kB**. No real-browser layout probe performed.

Final post-documentation fast gate and delivery recorded below.

Final fast gate: `npm run verify:fast -- --base 5d579cf` **ALL LANES PASSED**,
**2839 tests / 264 files**, on unchanged production/tests after the full pass.
Evidence `/home/user/rowbadge-import-fast-final.log`. Earlier failed evidence is
retained and the toast timing issue is not claimed resolved. Ready for scoped
commit with source provenance/attribution and push on the active branch only;
no generated build/dependency artifacts included.

Final whitespace gate caught extra blank lines at the imported `rowlist.ts`
EOF. Removed only those blank lines; no program tokens or behavior changed.
