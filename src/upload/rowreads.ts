// rowreads.ts — what SVG to upload reads for each row, fast (2026-11-06). The
// row assembly used to read every pair's export.json and every source SVG and
// hash it ONE ROW AT A TIME, each lookup resolved from the root again — and
// again after every restart. Now:
//   - a reader shares folder lookups inside one assembly (each folder is
//     resolved once, whatever number of files are read from it);
//   - source hashes are kept by (SVG path, size:mtime fingerprint) in this
//     browser across restarts, so an unchanged SVG is never read or hashed
//     again; a changed fingerprint reads and hashes it anew.
// The store is validated on read: anything malformed is ignored (RULE 13).

import type { DirHandleLike, FileHandleLike } from "../lib/fs";
import { createLimiter } from "../lib/limiter";
import { sha256HexText } from "../lib/upload/hash";
import { exportDirOf, parseExportRecord, type ExportRecord } from "../lib/upload/export";
import { readKey, writeKey } from "../state/safestorage";
import type { UploadRowSource } from "./discovery";

export const SOURCE_HASH_KEY = "iconSplitter.upload.sourceHash.v1";
/** File operations one assembly keeps in flight, whatever number of rows run. */
const READ_CONCURRENCY = 24;
/** Enough for many workspaces; the oldest entries leave first. */
const MAX_HASHES = 10_000;

interface Known { fp: string; hash: string }

let memory: Map<string, Known> | null = null;

/** One stored entry, `[fingerprint, "sha256:…"]`, or null when it is not one. */
function knownOf(value: unknown): Known | null {
  if (!Array.isArray(value) || typeof value[0] !== "string" || typeof value[1] !== "string") return null;
  return value[1].startsWith("sha256:") ? { fp: value[0], hash: value[1] } : null;
}

function parseStore(text: string | null): Map<string, Known> {
  const out = new Map<string, Known>();
  if (text === null) return out;
  try {
    const raw = JSON.parse(text) as { v?: unknown; entries?: unknown };
    if (raw.v !== 1 || raw.entries === null || typeof raw.entries !== "object") return out;
    for (const [path, value] of Object.entries(raw.entries as Record<string, unknown>)) {
      const known = knownOf(value);
      if (known !== null) out.set(path, known);
    }
  } catch {
    // a damaged store is an empty one: every hash is simply computed again
  }
  return out;
}

function store(): Map<string, Known> {
  memory ??= parseStore(readKey(SOURCE_HASH_KEY));
  return memory;
}

/** Writes the known hashes back (once per assembly), newest kept within the cap. */
export function flushSourceHashes(): void {
  const entries = [...store()].slice(-MAX_HASHES);
  writeKey(SOURCE_HASH_KEY, JSON.stringify({ v: 1, entries: Object.fromEntries(entries.map(([p, k]) => [p, [k.fp, k.hash]])) }));
}

/** Tests only: what a restart does to the in-memory copy. */
export function forgetSourceHashesInMemory(): void {
  memory = null;
}

export interface RowReader {
  record(dirPath: string): Promise<ExportRecord | null>;
  sourceHash(source: Pick<UploadRowSource, "svgPath" | "fingerprint">): Promise<string | null>;
}

/**
 * File bytes under `root` with every folder resolved once per reader (a row's
 * export.json and SVG share their folder's lookups) and at most
 * READ_CONCURRENCY operations in flight. null = absent or unreadable.
 */
function folderReader(root: DirHandleLike): (relPath: string) => Promise<Uint8Array | null> {
  const limit = createLimiter(READ_CONCURRENCY);
  const dirs = new Map<string, Promise<DirHandleLike | null>>([["", Promise.resolve(root)]]);
  const dirAt = (path: string): Promise<DirHandleLike | null> => {
    const hit = dirs.get(path);
    if (hit !== undefined) return hit;
    const at = path.lastIndexOf("/");
    const parent = at < 0 ? "" : path.slice(0, at);
    const next = dirAt(parent).then((dir) => (dir === null ? null : limit(() => dir.getDirectoryHandle(path.slice(at + 1))).catch(() => null)));
    dirs.set(path, next);
    return next;
  };
  const bytesAt = async (relPath: string): Promise<Uint8Array | null> => {
    const at = relPath.lastIndexOf("/");
    const dir = await dirAt(at < 0 ? "" : relPath.slice(0, at));
    const fh: FileHandleLike | null = dir === null ? null : await limit(() => dir.getFileHandle(relPath.slice(at + 1))).catch(() => null);
    if (fh === null) return null;
    try { return await limit(async () => new Uint8Array(await (await fh.getFile()).arrayBuffer())); } catch { return null; }
  };
  return bytesAt;
}

/** One assembly's reads: shared folder lookups, hashes remembered by fingerprint. */
export function createRowReader(root: DirHandleLike): RowReader {
  const bytesAt = folderReader(root);
  return {
    async record(dirPath) {
      const bytes = await bytesAt(`${exportDirOf(dirPath)}/export.json`);
      if (bytes === null) return null;
      try { return parseExportRecord(JSON.parse(new TextDecoder().decode(bytes))); } catch { return null; }
    },
    async sourceHash(source) {
      const known = store().get(source.svgPath);
      if (known !== undefined && known.fp === source.fingerprint) return known.hash;
      const bytes = await bytesAt(source.svgPath);
      if (bytes === null) return null;
      const hash = `sha256:${await sha256HexText(new TextDecoder().decode(bytes))}`;
      store().delete(source.svgPath); // re-inserted last: the newest survives the cap
      store().set(source.svgPath, { fp: source.fingerprint, hash });
      return hash;
    },
  };
}
