// scan.ts — pure scanning logic over an abstract tree (RULE 3, RULE 8).
// Owns: recursive walk with ignore list, AI-image eligibility, reference
// linking, and diff between a previous scan and the current one.
// The tree (TreeNode) is produced by src/lib/fs.ts from real directory handles.

import { isImageExt, parseAiName, referenceName, type AiName } from "./naming";

export interface TreeNode {
  name: string;
  dir: boolean;
  size?: number;
  mtime?: number;
  children?: TreeNode[];
}

/** A scanned file with its path relative to the selected root. */
export interface FileEntry {
  name: string;
  relPath: string; // "Category-A/star_AI.png"
  dirPath: string; // "Category-A" ("" at root)
  size: number;
  mtime: number;
}

/** An eligible AI source image plus its parsed name and linked reference. */
export interface AiImageEntry extends FileEntry {
  ai: AiName;
  refRelPath: string | null; // null when the reference image is missing
}

export interface PrevRecord {
  relPath: string;
  size: number;
  mtime: number;
  hash?: string;
}

export interface ScanDiff {
  added: AiImageEntry[];
  changed: AiImageEntry[];
  kept: AiImageEntry[];
  missing: PrevRecord[];
}

/** Recursively flattens the tree into file entries, skipping ignored dirs. */
export function walkTree(tree: TreeNode, ignore: string[]): FileEntry[] {
  const out: FileEntry[] = [];
  collect(tree, "", ignore, out);
  return out;
}

function collect(node: TreeNode, parentPath: string, ignore: string[], out: FileEntry[]): void {
  for (const child of node.children ?? []) {
    if (child.dir) {
      if (isIgnored(child.name, ignore)) continue;
      collect(child, joinPath(parentPath, child.name), ignore, out);
    } else {
      out.push(toEntry(child, parentPath));
    }
  }
}

function isIgnored(name: string, ignore: string[]): boolean {
  return ignore.some((x) => x.toLowerCase() === name.toLowerCase());
}

function joinPath(parent: string, name: string): string {
  return parent === "" ? name : `${parent}/${name}`;
}

function toEntry(node: TreeNode, dirPath: string): FileEntry {
  return {
    name: node.name,
    relPath: joinPath(dirPath, node.name),
    dirPath,
    size: node.size ?? 0,
    mtime: node.mtime ?? 0,
  };
}

/** Keeps only files whose name parses as an eligible _AI image. */
export function collectAiImages(entries: FileEntry[]): AiImageEntry[] {
  return entries.flatMap((e) => {
    const ai = parseAiName(e.name);
    return ai && isImageExt(ai.ext) ? [{ ...e, ai, refRelPath: null }] : [];
  });
}

/** Fills refRelPath by looking for base.ext in the same folder. */
export function linkReferences(images: AiImageEntry[], all: FileEntry[]): AiImageEntry[] {
  const existing = new Set(all.map((e) => e.relPath.toLowerCase()));
  return images.map((img) => ({ ...img, refRelPath: findRef(img, existing) }));
}

function findRef(img: AiImageEntry, existing: Set<string>): string | null {
  const refName = referenceName(img.ai);
  const refPath = joinPath(img.dirPath, refName);
  return existing.has(refPath.toLowerCase()) ? refPath : null;
}

/** Compares previous records against the current scan (spec §6). */
export function diffScan(prev: PrevRecord[], curr: AiImageEntry[]): ScanDiff {
  const byPath = new Map(prev.map((p) => [p.relPath.toLowerCase(), p]));
  const seen = new Set<string>();
  const diff: ScanDiff = { added: [], changed: [], kept: [], missing: [] };
  classifyCurrent(curr, byPath, seen, diff);
  collectMissing(prev, seen, diff);
  return diff;
}

function classifyCurrent(
  curr: AiImageEntry[], byPath: Map<string, PrevRecord>, seen: Set<string>, diff: ScanDiff,
): void {
  for (const img of curr) {
    const key = img.relPath.toLowerCase();
    seen.add(key);
    const prev = byPath.get(key);
    if (!prev) diff.added.push(img);
    else if (prev.size !== img.size || prev.mtime !== img.mtime) diff.changed.push(img);
    else diff.kept.push(img);
  }
}

function collectMissing(prev: PrevRecord[], seen: Set<string>, diff: ScanDiff): void {
  for (const p of prev) {
    if (!seen.has(p.relPath.toLowerCase())) diff.missing.push(p);
  }
}
