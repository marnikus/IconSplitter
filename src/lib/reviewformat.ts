// reviewformat.ts — display text for the review UI (pure, tested).
// Owns: list/compare labels (filename, folder, date, byte size), the rescan
// summary line and the filename-safe timestamp used for corrupt backups.

import { pad2 } from "./naming";
import { diffPairs, type ReviewPair } from "./review";
import type { ReviewItem } from "./reviewmerge";

/** `YYYY-MM-DD HH:mm` in local time — the review list date column. */
export function formatStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/** The pair's file name: the AI result when it exists, else the source. */
export function displayName(item: ReviewItem): string {
  return item.ai?.name ?? item.source?.name ?? item.base;
}

export function folderLabel(item: ReviewItem): string {
  return item.dirPath === "" ? "root" : item.dirPath;
}

export function dimensions(width: number, height: number): string {
  return `${width} × ${height}`;
}

/** One-line rescan summary: totals plus what changed since the last scan. */
export function rescanNote(prev: ReviewPair[], next: ReviewPair[]): string {
  if (prev.length === 0 && next.length === 0) return "No images found";
  const diff = diffPairs(prev, next);
  return [
    `${next.length} pairs`,
    `+${diff.added.length} new`,
    `−${diff.removed.length} removed`,
    `~${diff.changed.length} changed`,
    `${diff.renamed.length} renamed`,
  ].join(" · ");
}

/** `2026-10-01T12-00-05` — safe inside a backup file name. */
export function stampName(date: Date): string {
  const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const time = `${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
  return `${day}T${time}`;
}
