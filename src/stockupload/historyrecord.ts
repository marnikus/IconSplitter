// historyrecord.ts — collect task outcomes and commit one history record per target.

import { fullStockFilePath, type StockUploadBatch, type StockUploadHistoryFile } from "../lib/stockupload/batchhistory";
import type { PlannedTransfer, StockUploadPlan } from "../lib/stockupload/plan";
import { appendStockUploadBatch } from "./batchhistorystore";

interface TargetHistoryDraft { files: StockUploadHistoryFile[]; failedCount: number }
export interface UploadRunHistoryDrafts { rootPath: string; byTarget: Map<string, TargetHistoryDraft> }

export function newUploadRunHistory(rootPath: string): UploadRunHistoryDrafts {
  return { rootPath, byTarget: new Map() };
}

export function recordUploadTaskResult(
  history: UploadRunHistoryDrafts, task: PlannedTransfer, result: { ok: true } | { ok: false; reason: string },
): void {
  const draft = history.byTarget.get(task.targetId) ?? { files: [], failedCount: 0 };
  if (result.ok) draft.files.push({ itemId: task.itemId, fileName: task.fileName, format: task.format,
    relPath: task.relPath, fullPath: fullStockFilePath(history.rootPath, task.relPath) });
  else draft.failedCount += 1;
  history.byTarget.set(task.targetId, draft);
}

export function saveUploadRunHistory(
  plan: StockUploadPlan, history: UploadRunHistoryDrafts, run: { runId: string; cancelled: boolean },
): void {
  const uploadedAt = new Date().toISOString();
  for (const target of plan.targets) {
    const draft = history.byTarget.get(target.id) ?? { files: [], failedCount: 0 };
    const batch: StockUploadBatch = { id: `${run.runId}-${target.id}`, stockId: target.id, stockName: target.name,
      uploadedAt, uploadedCount: draft.files.length, failedCount: draft.failedCount, cancelled: run.cancelled,
      rootPath: history.rootPath, files: draft.files };
    appendStockUploadBatch(batch);
  }
}
