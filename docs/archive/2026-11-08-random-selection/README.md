# Random selection — SVG to upload & Upload (2026-11-08)

## Request

Add a **Select random** button and an integer count field (greater than 1) to
both upload tabs. A draw replaces the checked set with N distinct random items:

- no checks: the pool is the whole listed set (including rows hidden by filters);
- existing checks: the pool is only those checked items;
- requested N above the pool size: draw the whole pool instead.

## Design

- `src/lib/randomorder.ts` owns the existing Fisher–Yates `randomBatchOrder`
  (moved out of `lib/stockupload/gettyweb.ts`, re-exported there for compatibility).
- `src/lib/randomselect.ts` owns count normalization, pool choice and the draw.
- `src/ui/RandomSelectControl.tsx` is the shared button + draft number field +
  scope line. Handles: `<prefix>-select-random`, `<prefix>-random-count`,
  `<prefix>-random-scope`. The count is local UI state (default 2), not a new
  persisted preference.
- Each tab adds one `selectRandom(count)` action through its existing selection
  commit path (`uploadChecked` / `stockUploadChecked`), so one draw is one global
  undo entry and active/anchor stay untouched. No provider or file work.

## Verification

Focused: `tests/random_select.test.ts`, `tests/random_select_ui.test.tsx`,
existing `getty_web_chunk`, `upload_row_gestures`, `stockupload_ui`,
`invert_selection`. Full gates recorded in `docs/current/QUALITY_RECHECK.md`.
