# Independent export padding: Left, Right, Top, Bottom

## Request and plan (before production changes)

Replace the single uniform padding input in the export settings popup with four
independent percentage inputs, in both global and per-icon scopes. Keep the
existing percentage basis: content = largest painted artwork side; pinned
artboard = largest artboard side. Centre proportionally inside the remaining
padded rectangle, not the whole artboard. Never stretch or crop the artwork.

1. Add failing real-domain/geometry/export and real-dialog tests first.
2. Extend the existing `paddingPct` setting to accept either its legacy number,
   null (source margins), or `{left,right,top,bottom}`. Keep legacy numbers and
   fingerprints byte-compatible; equal four-side values canonicalize to the
   legacy number. Validate stored defaults/overrides. Compare padding objects
   by their actual four values, not the artboard-object comparator; this also
   preserves undo, persistence, selective re-export and preview invalidation.
3. Extend shared artboard fitting, measured placement and wide-stroke fallback
   to use each side. Content/MP fits include the exact individual margins;
   pinned fits letterbox within the inset rectangle, including asymmetric
   centring. Return an honest no-fit when padding consumes the pinned artboard.
   Preview, SVG, JPEG and EPS all use the same prepared export geometry.
4. Extract a small padding UI owner with four labelled inputs and one existing
   Default toggle. Retain live clamping 0–50%; Default retains source margins,
   toggling back gives four 8s. The first numeric edit from source-default starts
   the other sides at 8%, explicitly shown. A per-icon edit pins the padding
   group only; Reset returns the group to inherited values. Preserve all other
   settings, folded decoration groups and originals. Show all sides in row text.
5. Adapt existing uniform-edit UI tests to fill all four fields (keep original
   assertions); cover per-side edits, inheritance/reset, defaults, corruption,
   fingerprint/undo equality, exact placement, strokes, Shadow and MP scaling.
6. Update bounded current docs (split a focused padding page rather than exceed
   limits), owner/test/selector/storage/router links. Run focused, types, lint,
   changed quality, fast and full verification without modifying budgets or the
   test harness. Append the quality ledger unread, scoped commit and push only
   the active feature branch.

## Status

Plan recorded before implementation. Tests and results pending.

## Completed implementation and verification

Implemented the planned backward-compatible padding domain and shared geometry,
including the bounded measured wide-stroke fallback. The dialog has four
independently labelled inputs in a compact 2×2 grid. Both scopes retain the
existing Default, All default, group marker, settings write paths and Reset.
The row text displays L/R/T/B. Legacy uniform/null settings and equal-sided
fingerprints remain compatible; factory fingerprint is still `36232c04`.

Plan clarification: existing UI tests now edit **Left** instead of the removed
uniform input and assert all four values (the other three stay at 8), rather
than performing four uniform edits. This preserves their original one-gesture
undo/reset/selection checks; no assertions were removed. The new preview tests
separately edit every side and verify persisted reload and exact undo/redo.

Measured evidence:

- Initial 27 new tests: **25 failed / 2 passed** before production changes,
  `/home/user/padding-red.log`. Missing controls, rejected settings, NaN fitting,
  wrong pinned centre and no-fit failure were observed. All 27 passed after
  implementation, `/home/user/padding-green.log`.
- Added final export/preview and actual wide-stroke fixtures: **34 new tests**
  total (19 domain/fit/export-geometry, 10 dialog, 3 full-package, 2 preview).
  Domain/fit tests include both supplied lightbulb failure SVGs at stroke 50.
- Focused nine-file regression group: **248/248 passed** before adding the final
  two wide-stroke cases; those **19/19 domain tests** then passed separately.
  Logs `/home/user/padding-focused-confirmed.log` and
  `/home/user/padding-wide-strokes.log`. Final full run includes all of them.
- Initial additional-test failures were test assumptions, corrected without
  production workarounds: a reused package is `processed` with empty stages
  (not a nonexistent `skipped` run status); gesture history uses real Date,
  whereas the quiet helper advances timers only. The distinct-gesture test now
  waits the existing 900 ms coalescing window with a real timer. Neither harness
  nor history/coalescing implementation or budgets were changed.
- Actual fixture `tests/assets/SVG to JPEG or EPS export tests/icon-handshake-heart_7_03_v2.svg`
  passes the complete pipeline at 5500×3100 with asymmetric margins, optimization
  on/off, clean SVG, validated JPEG, genuine vector-only EPS, unchanged originals,
  XMP/IPTC verification and selective re-export. Only browser canvas/encoding
  transport is injected; no real-browser raster visual/Adobe ingestion claim.
- `npx tsc --noEmit`, lint (**0 errors, 23 existing warnings**), changed quality
  vs `7fa8ffb`, docs navigation (**4/4**) and whitespace checks: PASS. Nine changed
  production TSX/TS files pass unchanged RULE 16/ratchet limits.
- `npm run verify:fast -- --base 7fa8ffb`: **ALL LANES PASSED**.
- `npm run verify -- --base 7fa8ffb`: **ALL LANES PASSED**, **2817 tests / 260 files**
  plus **30 native tests / 5 files**, unchanged performance budgets. Evidence:
  `/home/user/padding-fast.log`, `/home/user/padding-full.log`.
- src/lib coverage: **95.28% statements / 89.67% branches / 98.16% functions /
  98.26% lines** (prior 95.25/89.62/98.14/98.25). New `padding.ts` is **100%**
  across all four metrics. Production single-file build **1796.66 kB**, gzip
  **557.47 kB**.
- Bounded current docs updated: new padding owner page, settings/geometry,
  selectors, invariants, storage, owners, test map and root route. Ledger appended
  unread. No generated build/dependency artifacts staged. Scoped delivery on
  `arena/cf992ba5-iconsplitter` only.
