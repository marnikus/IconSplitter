// persist.ts — glue between the review model and review-decisions.json
// (spec §8, §9). Owns: loading + syncing the file on every scan (a missing file
// is created with every pair pending), flushing in-memory decisions without
// dropping the history of files that are gone, and the explicit corrupt reset.

import { blankReviewFile, syncRecords, upsertRecord, type ReviewFile } from "../lib/reviewfile";
import { backupReviewFile, loadReviewFile, readReviewText, saveReviewFile, type ReviewStatus } from "../lib/reviewio";
import type { DirHandleLike } from "../lib/fs";
import type { ReviewPair } from "../lib/review";
import { recordForItem, type ReviewItem } from "../lib/reviewmerge";

export interface FileState {
  status: ReviewStatus | "write-error";
  file: ReviewFile;
  reason: string | null;
}

/** Reads the file and reconciles it with the fresh scan; creates it on demand. */
export async function loadAndSync(root: DirHandleLike, pairs: ReviewPair[], now: string): Promise<FileState> {
  const loaded = await loadReviewFile(root);
  if (loaded.status === "corrupt") return { status: "corrupt", file: loaded.file, reason: loaded.reason ?? "Unreadable review file" };
  const synced = syncRecords(loaded.file, pairs.map(toRef), now);
  if (loaded.status === "ok" && synced.added === 0) return { status: "ok", file: synced.file, reason: null };
  return save(root, synced.file);
}

/** Writes the in-memory decisions, keeping records of vanished pairs intact. */
export async function flushItems(root: DirHandleLike, items: ReviewItem[], now: string): Promise<void> {
  await saveReviewFile(root, await merged(root, items, now));
}

/** Backs the corrupt payload up, then writes a fresh file. Returns backup name. */
export async function resetReviewFile(root: DirHandleLike, items: ReviewItem[], now: string, stamp: string): Promise<string> {
  const raw = await readReviewText(root);
  const backup = raw?.trim() ? await backupReviewFile(root, raw, stamp) : "";
  await saveReviewFile(root, await merged(root, items, now));
  return backup;
}

async function merged(root: DirHandleLike, items: ReviewItem[], now: string): Promise<ReviewFile> {
  const loaded = await loadReviewFile(root);
  const base = loaded.status === "corrupt" ? blankReviewFile() : loaded.file;
  const synced = syncRecords(base, items.map(toRef), now).file;
  return items.reduce((file, item) => upsertRecord(file, recordForItem(item, item.status, item.reviewedAt ?? now)), synced);
}

async function save(root: DirHandleLike, file: ReviewFile): Promise<FileState> {
  try {
    await saveReviewFile(root, file);
    return { status: "ok", file, reason: null };
  } catch (e) {
    return { status: "write-error", file, reason: `Could not write the review file — ${messageOf(e)}` };
  }
}

function toRef(item: ReviewPair | ReviewItem) {
  return { id: item.id, source: item.source?.relPath ?? null, ai: item.ai?.relPath ?? null };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
