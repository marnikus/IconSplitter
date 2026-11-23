// sheetwriter.ts — writes an artboard sheet into the scanned root (2026-11-14):
//   <variant>/metadata.json + preview.png   when its metadata is generated
//   <variant>/export/<stem>.svg|.jpg|.eps|.png + export.json   on export
// (`<variant>` = sheetfolders.ts `artboardFolder`). Each file is written whole.
// Every JSON file the builder reads back remembers its fingerprint (2026-11-22,
// filesigstore.ts), so a later change made outside the app is recognised.
import { ensureDirPath, listChildNames, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import type { SheetMetadata } from "../lib/svgBuilder/types";
import { rememberSig } from "./filesigstore";
import { jsonText } from "./sheetfiles";
import type { SheetFile } from "./sheetpackage";

export interface SheetMetaFile {
  metadata: SheetMetadata;
  artboardTitle: string;
  prompt: string;
  model: string;
  /** The exact image sent (data URL). */
  preview: string;
  at: string;
}

function bytesOfDataUrl(url: string): Uint8Array {
  const comma = url.indexOf(",");
  const binary = atob(comma < 0 ? "" : url.slice(comma + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

const blob = (bytes: Uint8Array | string, type: string) => new Blob([bytes as BlobPart], { type });

/** One JSON file, whole, with its fingerprint remembered. */
async function writeJson(dir: DirHandleLike, folder: string, name: string, json: Record<string, unknown>): Promise<void> {
  const text = jsonText(json);
  await writeFileOverwrite(dir, name, blob(text, "application/json"));
  rememberSig(`${folder}/${name}`, text);
}

/** metadata.json (Title, Description, Tags, Title-Artboard, the prompt and model) and preview.png beside it. */
export async function writeSheetMetadata(root: DirHandleLike, folder: string, file: SheetMetaFile): Promise<void> {
  const dir = await ensureDirPath(root, folder);
  await writeJson(dir, folder, "metadata.json", {
    v: 1, at: file.at, state: file.metadata.state, title: file.metadata.title, description: file.metadata.description,
    tags: file.metadata.tags, artboardTitle: file.artboardTitle, validation: file.metadata.validation, prompt: file.prompt, model: file.model,
  });
  await writeFileOverwrite(dir, "preview.png", blob(bytesOfDataUrl(file.preview), "image/png"));
}

/** A new artboard's folder (2026-11-16): made at once with a metadata.json stub (no preview yet); an existing file is kept. */
export async function writeArtboardSeed(root: DirHandleLike, folder: string, json: Record<string, unknown>): Promise<void> {
  const dir = await ensureDirPath(root, folder);
  try { await dir.getFileHandle("metadata.json"); return; } catch { /* not there yet */ }
  await writeJson(dir, folder, "metadata.json", json);
}

/** The template's blueprint (2026-11-16): `<template folder>/template.json`, the sheet preset. */
export async function writeTemplateBlueprint(root: DirHandleLike, folder: string, json: Record<string, unknown>): Promise<void> {
  await writeJson(await ensureDirPath(root, folder), folder, "template.json", json);
}

/** The export package into `<variant>/export/`. Removes superseded artifact files after writing. */
export async function writeSheetExport(root: DirHandleLike, folder: string, files: readonly SheetFile[]): Promise<void> {
  const dir = await ensureDirPath(root, `${folder}/export`);
  const kept = new Set(files.map((f) => f.name));
  for (const f of files) await writeFileOverwrite(dir, f.name, blob(f.bytes, f.name.endsWith(".json") ? "application/json" : "application/octet-stream"));
  for (const existing of await listChildNames(dir)) {
    if (!kept.has(existing) && /\.(?:svg|png|jpe?g|eps|zip)$/i.test(existing)) {
      try { await dir.removeEntry?.(existing); } catch { /* ignore */ }
    }
  }
}
