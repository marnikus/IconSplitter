// storagebudget.ts — room for the restart snapshot when localStorage is full
// (2026-11-08). The reported bug: every session write was refused
// (`session.save-refused`), so a reload kept bringing back the last snapshot
// that still fitted. The snapshot is small and must win over caches: a refused
// write frees the stores below — REBUILDABLE caches first, the log and the undo
// timeline last — retrying after each, and never touches user data (metadata
// cache, upload batches, presets, prompts, keys).

/** Evicted in this order; each is rebuilt or only shortened when gone. */
export const EVICTABLE_KEYS: readonly string[] = [
  "iconSplitter.upload.sourceHash.v1", // source-hash cache — rebuilt on the next scan
  "iconSplitter.svg.index.v1", // id → path index — rebuilt on the next scan
  "iconSplitter.log.v1", // global activity log — the live log keeps running in memory
  "iconSplitter.history.v1", // stored undo timeline — the live timeline keeps running in memory
];

export interface RoomedWrite { ok: boolean; freed: string[] }

/** Writes `text` under `key` (one plain retry), freeing evictable stores one by one until it lands. */
export function writeWithRoom(key: string, text: string): RoomedWrite {
  const freed: string[] = [];
  if (tryWrite(key, text) || tryWrite(key, text)) return { ok: true, freed };
  for (const victim of EVICTABLE_KEYS) {
    if (victim === key || !has(victim)) continue;
    remove(victim);
    freed.push(victim);
    if (tryWrite(key, text)) return { ok: true, freed };
  }
  return { ok: false, freed };
}

/** The largest stored keys (chars ≈ bytes / 2), for an honest "storage is full" report. */
export function largestKeys(top = 6): { key: string; chars: number }[] {
  const out: { key: string; chars: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null) out.push({ key, chars: key.length + (localStorage.getItem(key) ?? "").length });
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

function tryWrite(key: string, text: string): boolean {
  try {
    localStorage.setItem(key, text);
    return localStorage.getItem(key) === text;
  } catch {
    return false;
  }
}

function has(key: string): boolean {
  try { return localStorage.getItem(key) !== null; } catch { return false; }
}

function remove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* nothing more can be done */ }
}
