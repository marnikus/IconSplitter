// sidecar.ts — per-file SVG metadata IO (prompt §13).
// Owns: reading and writing <stem>.svg.json beside each AI image, listing the
// SVG versions on disk, and reading an SVG file's text for the code dialog.
// There is no global decision file: every source owns its history. A missing
// sidecar means "not generated yet"; a corrupt one is reported and the SVG
// files on disk are left untouched. Writes follow the tmp -> verify ->
// overwrite -> cleanup protocol used by the decision file (RULE 23).

import { probePath, tryGetFile, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { parseSidecar, sidecarName, serializeSidecar, type SvgSidecar } from "../lib/svgfile";
import { resolveFile } from "../selection/handles";
import type { SvgSource } from "./sources";

export interface SidecarLoad {
  sidecar: SvgSidecar | null;
  /** true when the file exists but could not be parsed — never destructive. */
  corrupt: boolean;
}

export async function loadSidecar(root: DirHandleLike, source: SvgSource): Promise<SidecarLoad> {
  const dir = await dirOf(root, source.dirPath);
  const fh = dir ? await tryGetFile(dir, sidecarName(source.stem)) : null;
  if (!fh) return { sidecar: null, corrupt: false };
  const parsed = parseSidecar(await (await fh.getFile()).text());
  return parsed.ok ? { sidecar: parsed.sidecar, corrupt: false } : { sidecar: null, corrupt: true };
}

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

/** Reads a saved SVG document; null when the file is gone or unreadable. */
export async function readSvgText(root: DirHandleLike, relPath: string): Promise<string | null> {
  const fh = await resolveFile(root, relPath);
  if (!fh) return null;
  try {
    return await (await fh.getFile()).text();
  } catch {
    return null;
  }
}

/** Atomic-ish sidecar write; throws so the caller can offer a retry. */
export async function saveSidecar(root: DirHandleLike, source: SvgSource, sidecar: SvgSidecar): Promise<void> {
  const dir = await dirOf(root, source.dirPath);
  if (!dir) throw new Error("source folder is gone");
  const text = serializeSidecar(sidecar);
  await writeAndVerify(dir, source.stem, text);
  await writeFileOverwrite(dir, sidecarName(source.stem), new Blob([text]));
  await removeTmp(dir, source.stem);
}

async function writeAndVerify(dir: DirHandleLike, stem: string, text: string): Promise<void> {
  const tmp = await dir.getFileHandle(`${stem}.svg.tmp.json`, { create: true });
  const w = await tmp.createWritable();
  await w.write(new Blob([text]));
  await w.close();
  const back = await (await tmp.getFile()).text();
  if (!parseSidecar(back).ok) throw new Error("sidecar tmp verify failed");
}

async function removeTmp(dir: DirHandleLike, stem: string): Promise<void> {
  try {
    await dir.removeEntry?.(`${stem}.svg.tmp.json`);
  } catch {
    // a leftover tmp is harmless — the next save overwrites it
  }
}

function dirOf(root: DirHandleLike, dirPath: string): Promise<DirHandleLike | null> {
  return dirPath === "" ? Promise.resolve(root) : probePath(root, dirPath);
}
