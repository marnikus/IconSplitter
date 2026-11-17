# Upload — "Limit" (2026-11-05)

[Upload owner](stock-upload.md) · [router](../README.md)

A number box `Limit` (`stock-upload-limit`) beside `Random batches` on the
Upload tab's bulk bar. Above 0, a run uploads **only that many icons**, drawn
**at random** from the selection, in random 100-icon batches; the other
selected icons are not touched and stay for a later run. Empty / 0 = no limit.
Counted in icons (a JPEG and its matching EPS are one icon).

| Selected | Limit | Batches sent | Left |
|---|---|---|---|
| 200 | 150 | 100 + 50 | 50 |
| 200 | 70 | 70 | 130 |
| 40 | 100 | 40 | 0 |

## Contract

- **Drawn once, on the plan** (`src/lib/stockupload/uploadlimit.ts`
  `limitStockUploadPlan`): before the confirmation, so the dialog states it
  (`stock-upload-limit-note`: "Limit N: X of Y icons drawn at random … Z stay
  for a later run") and every checked site gets the same chosen icons. Only
  icons with something to upload are drawn from; all their files and sites stay.
- **Random batches is implied**: `uploadIsRandomized` = Random batches ticked or
  a limit set; the Random batches chip shows ticked and disabled while a limit is
  set. The run's own batching (`planIconBatches`) then splits the drawn icons
  into 100s.
- Stored as `uploadLimit` in `iconSplitter.stockUpload.prefs.v1`, validated on
  read (`parseUploadLimit`: whole number > 0, else 0).
- Wired in `src/stockupload/panelops.ts` (plan + randomize flag),
  `StockUploadBulkBar.tsx` (`LimitOption`), `StockUploadDialogs.tsx` (`LimitNote`).

## Tests

`stockupload_limit.test.ts` (parse, prefs, the draw, same icons per site,
end-to-end batches 10 + 5 of 15 and one batch of 7);
`stockupload_limit_ui.test.tsx` (control, implied Random batches, confirmation
note, wiring).
