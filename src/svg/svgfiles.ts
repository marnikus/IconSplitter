// svgfiles.ts — the files that live beside an AI image (prompt §13, I-41).
// Owns: listing the SVG versions on disk and reading an SVG file's text for the
// code dialog and the previews. The pair file itself (`<stem>.svg.json`) is read
// and written by `selection/pairstore` + `lib/pairmeta`, so this module never
// guesses at its content.

import { probePath, type DirHandleLike } from "../lib/fs";
import { resolveFile } from "../selection/handles";
import type { SvgSource } from "./sources";

/** Names of every SVG version currently on disk for this source. */
export async function listSvgFiles(root: DirHandleLike, source: SvgSource): Promise<string[]> {
  const dir = await dirOf(root, source.dirPath);
  if (!dir) return [];
  const names: string[] = [];
  for await (const [name] of dir.entries()) {
    if (name.toLowerCase().endsWith(".svg")) names.push(name);
  }
  return names;
}

/** A saved SVG document and the file's own modification time, when readable. */
export interface SvgFileText {
  code: string;
  /** Epoch ms the file was last written; null when the browser hides it. */
  lastModified: number | null;
}

/** Reads a saved SVG with its own time; null when the file is gone or unreadable. */
export async function readSvgFile(root: DirHandleLike, relPath: string): Promise<SvgFileText | null> {
  const fh = await resolveFile(root, relPath);
  if (!fh) return null;
  try {
    const file = await fh.getFile();
    const code = await file.text();
    const time = file.lastModified;
    return { code, lastModified: Number.isFinite(time) && time > 0 ? time : null };
  } catch {
    return null;
  }
}

/** Reads a saved SVG document; null when the file is gone or unreadable. */
export async function readSvgText(root: DirHandleLike, relPath: string): Promise<string | null> {
  return (await readSvgFile(root, relPath))?.code ?? null;
}

function dirOf(root: DirHandleLike, dirPath: string): Promise<DirHandleLike | null> {
  return dirPath === "" ? Promise.resolve(root) : probePath(root, dirPath);
}
