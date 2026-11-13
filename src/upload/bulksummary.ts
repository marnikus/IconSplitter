// Selected-row counts are independent of active id, dialogs, progress and toasts.
// Exact destination planning belongs to the confirmed download action, not render.
import { committedArtifactCount } from "../lib/upload/download";
import { needsMetadataAcceptance } from "./metaaccept";
import type { UploadRow } from "./types";

export function uploadBulkSummary(rows: readonly UploadRow[], checked: readonly string[]) {
  const wanted = new Set(checked);
  let needed = 0, withMeta = 0, awaiting = 0, download = 0;
  for (const row of rows) {
    if (!wanted.has(row.source.id)) continue;
    if (row.meta.metadata === null) needed++;
    else withMeta++;
    if (needsMetadataAcceptance(row.meta)) awaiting++;
    download += committedArtifactCount(row.record);
  }
  return { needed, withMeta, awaiting, download };
}
