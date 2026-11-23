// uploadnamestore.ts — local per-file storage for upload file names before and
// across export (`iconSplitter.upload.names.v1`, RULE 13). Keyed by item ID
// (`pair.id` / `artboard.id`) so all three tabs stay synchronized live (RULE 24).

import { useSyncExternalStore } from "react";
import { isRecord } from "../lib/isrecord";
import { sanitizeUploadName } from "../lib/upload/uploadname";
import { readKey, writeKey } from "../state/safestorage";

export const UPLOAD_NAMES_STORAGE_KEY = "iconSplitter.upload.names.v1";
const MAX_ENTRIES = 10_000;

export type UploadNameMap = Readonly<Record<string, string>>;

let snapshot: UploadNameMap | null = null;
const listeners = new Set<() => void>();

function parseStored(raw: string | null): Record<string, string> {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.v !== 1 || !isRecord(parsed.names)) return {};
    const out: Record<string, string> = {};
    for (const [id, val] of Object.entries(parsed.names)) {
      if (id === "" || typeof val !== "string") continue;
      const clean = sanitizeUploadName(val);
      if (clean !== "") out[id] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

function ensureLoaded(): UploadNameMap {
  if (snapshot === null) snapshot = parseStored(readKey(UPLOAD_NAMES_STORAGE_KEY));
  return snapshot;
}

function commit(next: Record<string, string>): void {
  const entries = Object.entries(next).slice(-MAX_ENTRIES);
  const bounded = Object.fromEntries(entries);
  snapshot = bounded;
  writeKey(UPLOAD_NAMES_STORAGE_KEY, JSON.stringify({ v: 1, names: bounded }));
  for (const listener of listeners) listener();
}

export function getUploadNames(): UploadNameMap {
  return ensureLoaded();
}

export function getUploadName(id: string): string | null {
  return ensureLoaded()[id] ?? null;
}

export function setUploadName(id: string, rawName: string | null, workName?: string): string | null {
  const cur = ensureLoaded();
  const clean = typeof rawName === "string" ? sanitizeUploadName(rawName) : "";
  const effective = clean === "" || clean === workName ? null : clean;
  if ((cur[id] ?? null) === effective) return effective;
  const next = { ...cur };
  if (effective === null) delete next[id];
  else next[id] = effective;
  commit(next);
  return effective;
}

export function setUploadNamesBatch(entries: ReadonlyArray<{ id: string; uploadName: string | null; workName?: string }>): void {
  const next = { ...ensureLoaded() };
  let changed = false;
  for (const e of entries) {
    const clean = typeof e.uploadName === "string" ? sanitizeUploadName(e.uploadName) : "";
    const effective = clean === "" || clean === e.workName ? null : clean;
    if ((next[e.id] ?? null) === effective) continue;
    changed = true;
    if (effective === null) delete next[e.id];
    else next[e.id] = effective;
  }
  if (changed) commit(next);
}

export function subscribeUploadNames(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useUploadNames(): UploadNameMap {
  return useSyncExternalStore(subscribeUploadNames, getUploadNames, getUploadNames);
}

/** Tests only: drops the in-memory cache so the next read re-parses localStorage. */
export function clearUploadNamesInMemory(): void {
  snapshot = null;
}
