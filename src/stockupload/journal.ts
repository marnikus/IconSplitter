// journal.ts — crash-recovery journal for in-flight FTPS uploads (RULE 13/20).
// Stores ONLY itemId, targetId and timestamp — never credentials or bytes.
// On restart, unfinished transfers are marked `interrupted` once and never resent.

import { isRecord } from "../lib/isrecord";
import { readKey, writeKey } from "../state/safestorage";
import { recordSiteUploadStatus } from "./historystore";

export const STOCK_JOURNAL_KEY = "iconSplitter.stockUpload.journal.v1";

interface JournalEntry {
  itemId: string;
  targetId: string;
  startedAt: string;
}

let recoveredThisBoot = false;

function readEntries(): JournalEntry[] {
  const text = readKey(STOCK_JOURNAL_KEY);
  if (!text) return [];
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.entries)) return [];
    return raw.entries.filter((e): e is JournalEntry =>
      isRecord(e) && typeof e.itemId === "string" && typeof e.targetId === "string" && typeof e.startedAt === "string",
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: readonly JournalEntry[]): void {
  writeKey(STOCK_JOURNAL_KEY, JSON.stringify({ v: 1, entries }));
}

export function markUploadInFlight(itemId: string, targetId: string, startedAt = new Date().toISOString()): void {
  const rest = readEntries().filter((e) => !(e.itemId === itemId && e.targetId === targetId));
  writeEntries([...rest, { itemId, targetId, startedAt }]);
}

export function clearUploadInFlight(itemId: string, targetId: string): void {
  const rest = readEntries().filter((e) => !(e.itemId === itemId && e.targetId === targetId));
  writeEntries(rest);
}

export function recoverInterruptedUploads(): number {
  if (recoveredThisBoot) return 0;
  recoveredThisBoot = true;
  const open = readEntries();
  if (open.length === 0) return 0;
  writeEntries([]);
  for (const entry of open) {
    recordSiteUploadStatus(entry.itemId, entry.targetId, {
      status: "interrupted",
      formats: [],
      uploadedAt: entry.startedAt,
      error: "interrupted before completion — never resent automatically",
    });
  }
  return open.length;
}

export function resetUploadJournal(): void {
  recoveredThisBoot = false;
  writeEntries([]);
}
