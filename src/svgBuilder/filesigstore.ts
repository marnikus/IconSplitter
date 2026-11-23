// filesigstore.ts — the fingerprints of the builder's JSON files (2026-11-22), one
// validated localStorage owner: path under the sheets root → the fingerprint of
// the text the app last wrote or read there (lib/svgBuilder/sheetsync.ts
// `sigOf`). A file whose text no longer matches was changed outside the app.
// Paths and fingerprints only — never file contents.
import { parseFileSigs, sigOf } from "../lib/svgBuilder/sheetsync";
import { readKey, writeKey } from "../state/safestorage";

export const FILE_SIGS_KEY = "iconSplitter.svgBuilder.fileSigs.v1";
/** Enough for every template and artboard file several times over; the oldest go first. */
const MAX_SIGS = 4000;

let cache: Map<string, string> | null = null;

function stored(): unknown {
  try { return JSON.parse(readKey(FILE_SIGS_KEY) ?? "null") as unknown; } catch { return null; }
}

function load(): Map<string, string> {
  cache ??= new Map(Object.entries(parseFileSigs(stored())));
  return cache;
}

/** The fingerprint remembered for this file (undefined: never written or read by this app). */
export function knownSig(path: string): string | undefined {
  return load().get(path);
}

/** Remembers the text the app just wrote or read at `path`. */
export function rememberSig(path: string, text: string): void {
  const sigs = load();
  sigs.delete(path);
  sigs.set(path, sigOf(text));
  for (const old of sigs.keys()) { if (sigs.size <= MAX_SIGS) break; sigs.delete(old); }
  writeKey(FILE_SIGS_KEY, JSON.stringify(Object.fromEntries(sigs)));
}

/** Forgets the in-memory copy (tests; the next read loads the store again). */
export function resetFileSigs(): void {
  cache = null;
}
