// reviewio.ts — reads, writes and backs up review-decisions.json on the split
// root (spec §8; RULE 13, RULE 23).
// Owns: missing/corrupt detection (a corrupt payload is reported, never
// overwritten), the atomic delivery — write a temp file, rename it with
// FileSystemFileHandle.move() when the browser has it, else fall back to
// createWritable() whose close() replaces the file atomically — and the
// timestamped backup that keeps a corrupt payload recoverable.

import { nameExists, tryGetFile, writeFileNew, writeFileOverwrite, type DirHandleLike, type FileHandleLike } from "./fs";
import { blankReviewFile, parseReviewFile, serializeReviewFile, type ReviewFile } from "./reviewfile";

export const REVIEW_FILE = "review-decisions.json";
export const CORRUPT_PREFIX = "review-decisions.corrupt-";

export function tmpName(): string {
  return `${REVIEW_FILE}.tmp`;
}

export type ReviewStatus = "ok" | "missing" | "corrupt";
export type SaveStrategy = "moved" | "written";

export interface LoadedReview {
  status: ReviewStatus;
  file: ReviewFile; // blank whenever the file is missing or corrupt
  reason?: string;
}

/** Raw text of the decision file, or null when it does not exist yet. */
export async function readReviewText(root: DirHandleLike): Promise<string | null> {
  const handle = await tryGetFile(root, REVIEW_FILE);
  if (!handle) return null;
  try {
    return await (await handle.getFile()).text();
  } catch {
    return null; // vanished between the lookup and the read
  }
}

export async function loadReviewFile(root: DirHandleLike): Promise<LoadedReview> {
  const text = await readReviewText(root);
  if (text === null || text.trim() === "") return { status: "missing", file: blankReviewFile() };
  const parsed = parseReviewFile(text);
  if (parsed.ok) return { status: "ok", file: parsed.file };
  return { status: "corrupt", file: blankReviewFile(), reason: parsed.reason };
}

export async function saveReviewFile(root: DirHandleLike, file: ReviewFile): Promise<SaveStrategy> {
  const blob = jsonBlob(file);
  await writeFileOverwrite(root, tmpName(), blob);
  if (await tryMoveIntoPlace(root)) return "moved";
  try {
    await writeFileOverwrite(root, REVIEW_FILE, blob);
  } finally {
    await removeTemp(root);
  }
  return "written";
}

interface MovableFile extends FileHandleLike {
  move?(name: string): Promise<void>;
}

async function tryMoveIntoPlace(root: DirHandleLike): Promise<boolean> {
  const handle = (await tryGetFile(root, tmpName())) as MovableFile | null;
  if (!handle || typeof handle.move !== "function") return false;
  try {
    await handle.move(REVIEW_FILE);
    return true;
  } catch {
    return false;
  }
}

interface RemovableDir extends DirHandleLike {
  removeEntry?(name: string): Promise<void>;
}

async function removeTemp(root: DirHandleLike): Promise<void> {
  try {
    await (root as RemovableDir).removeEntry?.(tmpName());
  } catch {
    // best effort: a leftover temp file is overwritten by the next save
  }
}

/** Copies a corrupt payload aside; never overwrites an existing backup. */
export async function backupReviewFile(root: DirHandleLike, raw: string, stamp: string): Promise<string> {
  const base = `${CORRUPT_PREFIX}${stamp}`;
  const name = await freeName(root, base);
  await writeFileNew(root, name, new Blob([raw], { type: "application/json" }));
  return name;
}

async function freeName(root: DirHandleLike, base: string): Promise<string> {
  for (let v = 1; v <= 50; v++) {
    const name = v === 1 ? `${base}.json` : `${base}-${v}.json`;
    if (!(await nameExists("file", root, name))) return name;
  }
  throw new Error(`No free backup name for ${base}`);
}

function jsonBlob(file: ReviewFile): Blob {
  return new Blob([serializeReviewFile(file)], { type: "application/json" });
}
