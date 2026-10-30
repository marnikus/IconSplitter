# Getty Images Upload Batching Strategy (Max 200 files / 100 pairs)

## Problem Statement
Getty Images contributor web interface limits uploads to **200 files (100 pairs)** per batch. If a user selects **200+ files (100+ pairs)**, the application must:
1. Select and upload the **first 100 pairs** (200 files) into Batch 1.
2. Close/Submit the batch on the web interface.
3. Automatically start the next batch (Batch 2) with the next 100 pairs.
4. Repeat until all files are uploaded across multiple batches.
5. Track unsuccessful uploads during batches and add them to a **re-upload list**.
6. Execute a **final/last batch** to re-upload the failed files (second attempt).

## Proposed Solution Architecture
- Modify `executeStockUploadBatch` and `runGettyWebIcons` in `src/stockupload/runupload.ts` to handle chunking.
- Implement a batch loop in `performConfirmUpload` (`src/stockupload/panelops.ts`) specifically for Getty Web targets.
- Maintain a `reuploadList` across iterations.
- Update `StockUploadPlan` or create a runtime chunked plan for each batch.
- Ensure `finishGettyWebRun` and `submitGettyBatch` handle batch closure correctly.
- Update `UploadBatchSummary` and `UploadProgressStep` to aggregate results across batches.

## Implementation Steps

### Step 1: Define Batch Chunking Logic
- Create a utility `chunkItems(items: ExportedItem[], maxPairs: number = 100)` that splits the `selectedRows` into chunks of max 100 pairs (200 files).
- Each chunk will generate its own `StockUploadPlan` or a subset of the original plan.

### Step 2: Update `runupload.ts` (Core Execution)
- Modify `runGettyWebIcons` to accept a subset of icons (already handled by `groupEspTasks` but we need to split `input.icons` before calling it).
- Modify `uploadGettyWebRun` to process only the current batch chunk.
- Update `executeStockUploadBatch` to support a loop:
  - Input: Original Plan.
  - Logic:
    1. Identify Getty Web targets.
    2. If Getty Web target exists and `selectedRows.length > 100`:
       - Split `selectedRows` into batches of 100.
       - For each batch:
         - Build a sub-plan for the batch.
         - Run `runNetworkTargetGroup` / `runGettyWebIcons`.
         - Collect failures into `reuploadList`.
         - Call `submitGettyBatch` to close the batch on the web.
       - If `reuploadList` is not empty:
         - Create a final batch from `reuploadList`.
         - Run upload and submit again.
    3. If standard target or <= 100 pairs: proceed with existing logic (single batch).

### Step 3: Update `panelops.ts` (UI & Orchestration)
- Update `performConfirmUpload` to handle the loop and progress reporting for multiple batches.
- Ensure `progress` state reflects current batch (e.g., "Batch 1/3: Uploading...", "Batch 2/3...", "Re-uploading failed files...").
- Update `summarizeBatch` to aggregate total uploaded/failed across all batches.

### Step 4: Update `gettywebtransfer.ts` & `gettywebfinish.ts`
- Ensure `uploadGettyWebRun` returns specific failure reasons per icon to populate `reuploadList`.
- Ensure `finishGettyWebRun` closes the specific batch ID/session correctly.

### Step 5: State Management & Progress
- Update `StockUploadModel` progress to show multi-batch status.
- Ensure `AbortController` stops all current and pending batches.

### Step 6: Testing & Verification
- Unit tests for chunking logic.
- Integration tests for multi-batch flow (mocking Getty Web bridge).
- Verify re-upload list logic (failed icons from Batch 1 -> Batch N).

## Detailed Flow Diagram

1. **Start Upload Flow** (`performStartUpload` in `panelops.ts`)
   - Build initial `StockUploadPlan`.
   - Check if `plan.selectedRows.length > 100` AND `target.protocol === 'getty-web'`.

2. **Batch Loop** (Inside `performConfirmUpload`)
   - `currentBatchIndex = 0`, `reuploadList = []`, `totalUploaded = 0`, `totalFailed = 0`.
   - **While** `remainingRows.length > 0` OR `reuploadList.length > 0`:
     - If `reuploadList` is not empty and `remainingRows` is empty:
       - `batchRows = reuploadList` (clear `reuploadList`).
       - Label: "Re-uploading failed files (Batch N)..."
     - Else:
       - `batchRows = remainingRows.slice(0, 100)`.
       - `remainingRows = remainingRows.slice(100)`.
       - Label: "Uploading Batch N/Total..."
     - Build sub-plan for `batchRows`.
     - Execute `executeStockUploadBatch` (modified to return `reuploadList` for Getty).
     - `totalUploaded += summary.uploadedFiles`.
     - `totalFailed += summary.failedFiles`.
     - Add failed item IDs from `summary` to `reuploadList`.
     - `submitGettyBatch` (closes the web batch).
     - Update UI progress.
   - Final Summary: Aggregate all batches.

### Step 7: Code Changes (Files)
- `src/stockupload/runupload.ts`:
  - Modify `uploadGettyWebRun` to return `failedIcons` list (IDs/stems).
  - Modify `runGettyWebIcons` to process chunks.
  - Create `executeStockUploadBatchMulti` (or update existing) to handle the loop.
- `src/stockupload/panelops.ts`:
  - Update `performConfirmUpload` to orchestrate the loop.
  - Update `summarizeBatch` to handle multi-batch results.
- `src/lib/stockupload/plan.ts`:
  - (Optional) Add helper for sub-plan creation.
- `src/stockupload/batchtypes.ts`:
  - Update `UploadBatchSummary` to optionally include `batchIndex` or `reuploadCount`.

## Re-upload Logic Details
- During each batch, `outcomeOf` in `gettywebtransfer.ts` identifies failures.
- These failures (item IDs + tasks) are collected in `reuploadList`.
- The loop continues until `reuploadList` is empty OR a max retry limit is reached (e.g., 3 attempts per file) to prevent infinite loops.

## Closing Batches on Web
- `finishGettyWebRun` in `src/stockupload/gettywebfinish.ts` must be called at the end of **each** batch iteration to submit/close the batch on the Getty contributor page.
- The session key should be unique per batch or reused if the bridge supports it (usually unique per run, so we might need to close/re-open or use a new session key per batch).

## Constraints
- Max 200 files (100 pairs) per batch.
- Getty Web protocol specific.
- Other protocols (FTP/SFTP/ESP) remain single-batch unless specified otherwise (currently only Getty Web has the 200 file limit constraint mentioned).

## Next Steps (No Coding Now)
1. Review existing `executeStockUploadBatch` signature and return types.
2. Design the chunking function.
3. Plan the loop structure in `panelops.ts`.
4. Define how `reuploadList` is tracked (item IDs + tasks).
5. Prepare for implementation in `arena/2c5410e6-iconsplitter`.
