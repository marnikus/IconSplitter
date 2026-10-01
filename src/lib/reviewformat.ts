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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `Oct 01, 2026 at 08:32:14` — the discovery line under the panes. */
export function formatLongDateTime(ts: number): string {
  const d = new Date(ts);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${monthDay(d)}, ${d.getFullYear()} at ${time}`;
}

/** `Oct 01 · 08:32` — the compact date column of the list. */
export function formatShortDate(ts: number): string {
  const d = new Date(ts);
  return `${monthDay(d)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `just now` / `24 seconds ago` / `2 minutes ago` / `1 hour ago`. */
export function relativeTime(ts: number, now: number): string {
  const seconds = Math.round((now - ts) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

/** `2026-10-01T08:32` — the value a datetime-local input expects. */
export function stampForInput(ts: number): string {
  return formatStamp(ts).replace(" ", "T");
}

/** Root-relative path in the OS-look the design uses (`root\a\b.png`). */
export function windowsPath(rootName: string, relPath: string): string {
  const rel = relPath.split("/").join("\\");
  return rootName === "" ? rel : `${rootName}\\${rel}`;
}

/** Short, stable, display-only token for a pair id: `pair_74b08f3a`. */
export function pairToken(id: string): string {
  return `pair_${hash8(id.toLowerCase())}`;
}

/** The zoom badge of the comparison header (design: "1:1 SYNC"). */
export function zoomLabel(zoom: "fit" | "100"): string {
  return zoom === "100" ? "1:1 SYNC" : "FIT SYNC";
}

function monthDay(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${pad2(d.getDate())}`;
}

/** FNV-1a, 32 bit — deterministic across restarts, unlike a random id. */
function hash8(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** `2026-10-01T12-00-05` — safe inside a backup file name. */
export function stampName(date: Date): string {
  const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const time = `${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
  return `${day}T${time}`;
}
