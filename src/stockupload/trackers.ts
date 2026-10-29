// trackers.ts — per-item upload bookkeeping shared by the run and the status flush.

import type { UploadFormatKey } from "../lib/stockupload/types";

export interface ItemTracker {
  expected: number;
  succeeded: UploadFormatKey[];
  missingCount: number;
  lastError: string | null;
}
