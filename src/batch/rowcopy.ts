// rowcopy.ts — per-row copy actions of the Batch list: the file's folder
// ("Open in File Explorer" fallback) and the processed splits folder
// (the Location button). Glue only; the rules live in lib/copypath.

import { copyFolderText, copySplitFolderText } from "../lib/copypath";
import type { BatchView } from "./useBatchView";

type View = BatchView;

export function copyPath(v: View, relPath: string): void { void copyFolderText(v.core.rootRef.current, relPath, v.core.say); }

export function locateSplits(v: View, relPath: string): void {
  const row = v.core.s.rows.find((r) => r.relPath.toLowerCase() === relPath.toLowerCase());
  if (!row?.outRel) return;
  void copySplitFolderText(v.core.destRef.current, v.core.rootRef.current, row.outRel, v.core.say);
}
