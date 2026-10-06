// output.ts — pure batch output planning (spec §5; RULE 23 never-overwrite).
// Owns: month/timestamp layout, per-source folder allocation with _vNN
// collision handling. The actual directory/file writes live in src/lib/fs.ts.

import { batchPath, splitFolderName, withVariation } from "./naming";

export interface BatchSource {
  relPath: string; // "Category-A/icon_AI.png"
  name: string; // "icon_AI.png"
  relDir: string; // "Category-A" ("" at root)
  refRelPath: string | null;
}

export interface PlannedItem {
  sourceRelPath: string;
  relDir: string;
  folder: string; // final folder name incl. variation suffix
  relFolder: string; // "<batchPath>/<relDir>/<folder>"
  refRelPath: string | null;
}

export interface BatchPlan {
  relBase: string; // "YYYY-MM/YYYY-MM-DD_HH-mm-ss"
  items: PlannedItem[];
}

/**
 * Plans the output tree for one batch. `existing(relDir)` returns folder names
 * already present in that destination directory, so the plan never overwrites.
 */
export function planBatch(sources: BatchSource[], existing: (relDir: string) => string[], date: Date): BatchPlan {
  const relBase = batchPath(date);
  const taken = new Map<string, Set<string>>();
  const items = sources.map((s) => planOne(s, relBase, existing, taken));
  return { relBase, items };
}

function planOne(
  s: BatchSource, relBase: string, existing: (relDir: string) => string[], taken: Map<string, Set<string>>,
): PlannedItem {
  const set = takenFor(s.relDir, existing, taken);
  const folder = allocateFolder(splitFolderName(s.name), set);
  set.add(folder.toLowerCase());
  return {
    sourceRelPath: s.relPath,
    relDir: s.relDir,
    folder,
    relFolder: join(relBase, join(s.relDir, folder)),
    refRelPath: s.refRelPath,
  };
}

function takenFor(relDir: string, existing: (d: string) => string[], taken: Map<string, Set<string>>): Set<string> {
  let set = taken.get(relDir);
  if (!set) {
    set = new Set(existing(relDir).map((n) => n.toLowerCase()));
    taken.set(relDir, set);
  }
  return set;
}

/** First free of name, name_v02, name_v03… (case-insensitive, never overwrite). */
function allocateFolder(base: string, taken: Set<string>): string {
  for (let v = 1; v < 10000; v++) {
    const candidate = withVariation(base, v);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return withVariation(base, Date.now() % 1000000); // unreachable safety net
}

function join(a: string, b: string): string {
  if (a === "") return b;
  if (b === "") return a;
  return `${a}/${b}`;
}
