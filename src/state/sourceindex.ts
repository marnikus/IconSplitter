// sourceindex.ts — the id -> path index the cross-tab undo paths need.
// A history entry names stable pair ids, but a pair's file is found by path, so
// a scan records the mapping it discovered (both tabs use the same cache). The
// index is a cache: when it is stale the undo reports "nothing changed" instead
// of writing into a folder the pair does not live in (RULE 12/13).

import { readKey, writeKey } from "./safestorage";
import { metaPathForAi } from "../lib/pairmeta";
import { isRecord } from "../lib/isrecord";

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

/** Where the pair file of an indexed source lives (`<root>/<dir>/<stem>.svg.json`). */
export function metaPathOfEntry(entry: IndexEntry): string {
  return metaPathForAi(entry.relPath);
}

function isEntry(value: unknown): value is IndexEntry {
  return isRecord(value) && typeof value.id === "string" && typeof value.relPath === "string"
    && typeof value.name === "string";
}
