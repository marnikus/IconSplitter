# Remove the original Selection tab — plan and steps

Date: 2026-10-24. Written before implementation.

## Scope and dependency findings

Keep exactly five tabs: Single sheets, Batch folders, Selection V2, Generate
SVG, SVG to upload. Remove the original Selection navigation, render branch
and exclusive panel/header/filter/sidebar/list UI. Remove its sidebar-collapse
state, undo handling and single-sided row-thumbnail resolver.

Selection V2 already uses the original directory's review engine, comparison
panes, formatting, side thumbnails, banners and pair-file persistence. Generate
SVG, Upload, Batch and global history also import some of these. Those modules
are NOT legacy-only functionality: preserve them and their existing paths to
avoid breaking consumers or manufacturing a broad rename/ratchet change.
Keep V2's list/comparison layouts, checks, filters, zoom, hotkeys, bulk arming,
undo, scan/root restore, decisions, SVG metadata and export behavior intact.

## Data compatibility

Remove `selection` from the live tab type/registry. A saved `tab: "selection"`
opens Selection V2 rather than a blank screen or unrelated sheets view. Keep
session schema/key and the `selection` JSON view slice: it is V2's current
filters/sort/active pair/comparison preferences, not an old tab implementation.
Read old snapshots without losing these settings or V2 checked rows/anchors;
drop the obsolete collapsed-sidebar field on parse/serialize. Preserve shared
root handle `__selection__`, pair sidecars and historical decision undo records;
do not delete user files/storage. Old collapse-only history applies nothing.

## TDD and implementation sequence

1. RED shell tests: exactly five tabs, V2 still opens, legacy saved tab migrates;
   RED session tests: live ids omit V1, migration preserves V2 data and removes
   collapsed state; source inventory asserts deleted V1-only modules stay gone.
2. Remove V1 shell and four exclusive components; remove exclusive thumbnail
   hook/collapse state. Implement minimal session-tab compatibility mapping.
3. Port the three original UI smoke cases to V2 rather than throw away review
   regression coverage; retain comparison/status checks in V2 comparison mode.
   Update cross-tab, layout, log and scrolling fixtures to the remaining tabs.
4. GREEN focused shell/session/store/review/history/navigation tests; types,
   lint and changed quality gate. Then complete fast/full verification and build.
5. Update current behavior/selector/owner/storage/test docs and five-tab overview,
   router/README/agent entry. Preserve historical archives; append measured
   ledger entry without reading it. Scoped commit/push on the fixed branch.

## Acceptance

No original Selection tab, route, standalone UI or sidebar-collapse functionality
remains. Existing V2 decisions and shared consumers still work; old saved tab
opens V2 with valid view/check state intact. No data deletion, disabled V2
capability, skipped assertions or gratuitous shared-module move.

## Implemented / verified

Removed the four exclusive UI components (418 source lines), navigation/render
branch, one-sided thumbnail hook and sidebar-collapse state/undo field. Kept
shared review paths, root/sidecar/session keys and V2's list/comparison controls.
Old saved Selection sessions migrate to V2 with filters, active row, comparison
settings, checked ids and anchor intact; obsolete collapsed state is discarded.
All three original UI smoke cases now exercise V2; no test file or assertion
family was discarded to make the removal pass.

Witnessed initial RED: 6 failing tests (old tab inventory, old-session mapping,
sidebar state, exclusive-source inventory), then focused GREEN 140 tests in
12 files. Final standalone types, lint (0 errors, 23 existing warnings), changed
quality vs c403c22, fast (five lanes) and full (six lanes) verification PASS.
Full suite: **2568 tests / 245 files**, original native **30 / 5** separately
PASS, **98.03% src/lib line coverage**. Production single-file build PASS,
1723.38 kB (509.74 kB gzip), reduced from the previous 1737.56 kB. No intentional
live provider request or user data deletion. Existing blocked-network diagnostic
logs remain unrelated to the tab removal. Generated dist/dependency churn is
excluded from the scoped commit.
