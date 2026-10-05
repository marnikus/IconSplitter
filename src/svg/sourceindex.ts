// sourceindex.ts — the id -> path index the cross-tab undo path needs.
// A history entry names stable source ids, but the sidecar files are found by
// path, so the panel records the mapping it discovered on every scan. The index
// is a cache: when it is stale the undo simply reports "nothing changed"
// instead of guessing (RULE 12/13).

import { readKey, writeKey } from "../state/safestorage";
import { isRecord } from "../lib/isrecord";
import type { SvgSource } from "./sources";

const INDEX_KEY = "iconSplitter.svg.index.v1";

export interface IndexEntry {
  id: string;
  relPath: string;
  name: string;
  fingerprint: string;
}

export function saveSourceIndex(entries: readonly IndexEntry[]): void {
  writeKey(INDEX_KEY, JSON.stringify({ v: 1, entries }));
}

export function loadSourceIndex(): Map<string, IndexEntry> {
  const text = readKey(INDEX_KEY);
  if (!text) return new Map();
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || !Array.isArray(raw.entries)) return new Map();
    return new Map(raw.entries.flatMap((e) => (isEntry(e) ? [[e.id, e] as [string, IndexEntry]] : [])));
  } catch {
    return new Map();
  }
}

function isEntry(value: unknown): value is IndexEntry {
  return isRecord(value) && typeof value.id === "string" && typeof value.relPath === "string"
    && typeof value.name === "string";
}

/** Index entry -> the source shape the sidecar IO needs. */
export function sourceFromIndex(entry: IndexEntry): SvgSource {
  const slash = entry.relPath.lastIndexOf("/");
  const name = entry.name || entry.relPath.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  return {
    id: entry.id,
    name,
    stem: dot > 0 ? name.slice(0, dot) : name,
    relPath: entry.relPath,
    dirPath: slash > 0 ? entry.relPath.slice(0, slash) : "",
    fingerprint: entry.fingerprint,
    problems: [], // a cached index entry carries no scan problems; a scan re-derives them
  };
}
