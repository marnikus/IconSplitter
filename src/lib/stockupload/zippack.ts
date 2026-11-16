// zippack.ts — builds or reads `<stem>.zip` for one exported item (RULE 15/23).
// Includes ONLY verified exported representations from `export/`, never `export.json`.

import JSZip from "jszip";
import { readBytesAt, type DirHandleLike } from "../fs";
import type { ExportedFileRef, ExportedItem } from "./types";

export type ZipPackResult =
  | { ok: true; fileName: string; bytes: Uint8Array }
  | { ok: false; reason: string };

const FIXED_ZIP_DATE = new Date("2026-01-01T00:00:00.000Z");

function siblingsToBundle(item: ExportedItem): ExportedFileRef[] {
  return [item.files.raster, item.files.svg, item.files.eps].filter((f): f is ExportedFileRef => f !== null);
}

export async function buildRepresentationZip(root: DirHandleLike, item: ExportedItem): Promise<ZipPackResult> {
  const fileName = `${item.stem}.zip`;
  if (item.files.zip !== null) {
    const existing = await readBytesAt(root, item.files.zip.relPath);
    if (existing !== null && existing.byteLength > 0) return { ok: true, fileName: item.files.zip.fileName, bytes: existing };
    return { ok: false, reason: `${item.files.zip.fileName} could not be read from export/` };
  }
  const refs = siblingsToBundle(item);
  if (refs.length === 0) return { ok: false, reason: `no exported files available to package into ${fileName}` };

  const zip = new JSZip();
  for (const ref of refs) {
    const data = await readBytesAt(root, ref.relPath);
    if (data === null || data.byteLength === 0) {
      return { ok: false, reason: `${ref.fileName} could not be read while building ${fileName}` };
    }
    zip.file(ref.fileName, data, { date: FIXED_ZIP_DATE });
  }
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return bytes.byteLength > 0 ? { ok: true, fileName, bytes } : { ok: false, reason: `empty archive for ${fileName}` };
}
