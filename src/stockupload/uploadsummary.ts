// uploadsummary.ts — user-facing outcome text for one multi-target upload run.

import type { UploadBatchSummary } from "./batchtypes";

function reuploadNote(summary: UploadBatchSummary): string {
  const icons = summary.reuploadIcons ?? 0;
  return icons > 0 ? ` — ${icons} icon(s) need re-upload` : "";
}

export function summarizeUploadRun(summary: UploadBatchSummary, targetCount: number): { text: string; err: boolean } {
  const reupload = reuploadNote(summary);
  if (summary.cancelled) return { text: `Upload cancelled (${summary.uploadedFiles} file(s) sent)${reupload}`, err: false };
  if (summary.failedFiles > 0) return { text: `Uploaded ${summary.uploadedFiles} file(s), ${summary.failedFiles} failed: ${summary.lastError ?? ""}${reupload}`, err: true };
  if (summary.stagedDir) return {
    text: `Staged ${summary.uploadedFiles} file(s) + getty_esp_metadata.csv into ${summary.stagedDir}/ — drag into esp.gettyimages.com or DeepMeta 4`, err: false,
  };
  if (summary.lastError) return { text: `Uploaded ${summary.uploadedFiles} file(s) across ${targetCount} stock site(s) — ${summary.lastError}`, err: true };
  return { text: `Uploaded ${summary.uploadedFiles} file(s) across ${targetCount} stock site(s)`, err: false };
}
