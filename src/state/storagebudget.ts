// storagebudget.ts — room for the restart snapshot when localStorage is full
// (2026-11-08). The field log showed every session write refused, so a reload
// kept bringing back the last snapshot that still fitted. The small snapshot
// wins over caches: a refused write first evicts REBUILDABLE caches (rebuilt by
// the next scan), then asks registered stores to compact themselves (the log
// keeps only its newest entries — deleting its key would just be refilled from
// memory). The undo timeline and user data are never touched. A blocked or
// unreadable storage is reported as such, never as "full".
import { hasKey, readKey, removeKey, writeKeyChecked } from "./safestorage";

/** Rebuilt by the next scan when gone. */
export const EVICTABLE_KEYS: readonly string[] = [
  "iconSplitter.upload.sourceHash.v1", // source-hash cache
  "iconSplitter.svg.index.v1", // id -> path index
];

/** A store that can shrink what it persists; returns a label of what it freed, or null. */
type Compactor = () => string | null;
const compactors: Compactor[] = [];

export function registerStorageCompactor(fn: Compactor): void {
  if (!compactors.includes(fn)) compactors.push(fn);
}

export interface RoomedWrite { ok: boolean; freed: string[]; reason: "quota" | "unavailable" | null }

/** Writes `text` under `key` (one plain retry), making room step by step while the quota refuses it. */
export function writeWithRoom(key: string, text: string): RoomedWrite {
  const freed: string[] = [];
  let outcome = writeKeyChecked(key, text);
  if (outcome !== "ok") outcome = writeKeyChecked(key, text);
  for (const step of roomSteps(key)) {
    if (outcome !== "quota") break;
    const label = step();
    if (label === null) continue;
    freed.push(label);
    outcome = writeKeyChecked(key, text);
  }
  return { ok: outcome === "ok", freed, reason: outcome === "ok" ? null : outcome };
}

function roomSteps(key: string): Compactor[] {
  const evict = EVICTABLE_KEYS.filter((k) => k !== key).map((k) => () => (hasKey(k) ? (removeKey(k), k) : null));
  return [...evict, ...compactors];
}

/** The largest stored keys (chars ≈ bytes / 2), for an honest "storage is full" report. */
export function largestKeys(top = 6): { key: string; chars: number }[] {
  const out: { key: string; chars: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null) out.push({ key, chars: key.length + (readKey(key) ?? "").length });
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.chars - a.chars).slice(0, top);
}

export function describeLargest(top = 6): string {
  const list = largestKeys(top).map((k) => `${k.key} ${(k.chars / 1024).toFixed(0)} k`).join(", ");
  return list === "" ? "storage could not be read" : list;
}
