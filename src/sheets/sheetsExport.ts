// sheetsExport.ts — renders the checked sheets' included icons and delivers
// them as one ZIP or into a chosen folder. One failed icon is skipped and
// counted (RULE 5, I-4); it never aborts the other sheets.
import JSZip from "jszip";
import { canvasToBlob, renderIconAsync, squareInfo, type ExportOpts } from "../lib/render";
import { includedBoxes } from "../lib/sheetsel";
import { ensureDirPath, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import type { Sheet } from "./importSheets";

export interface ExportFile { path: string; blob: Blob }
export interface Collected { files: ExportFile[]; failed: number }
type Progress = (done: number, total: number) => void;

const pad2 = (n: number) => String(n).padStart(2, "0");
const breathe = () => new Promise((r) => setTimeout(r, 0));

/** I-6: sanitized sheet base + `-icon-NN.png`, NN = position among included icons. */
export function iconFileName(sheet: Pick<Sheet, "base">, n: number): string {
  return `${sheet.base}-icon-${pad2(n + 1)}.png`;
}

/** Every included icon of every given sheet; sub-folders per sheet when several. */
export async function collectIcons(sheets: readonly Sheet[], opts: ExportOpts, onProgress?: Progress): Promise<Collected> {
  const multi = sheets.length > 1;
  const total = sheets.reduce((a, s) => a + includedBoxes(s).length, 0);
  const out: Collected = { files: [], failed: 0 };
  let done = 0;
  for (const s of sheets) {
    const inc = includedBoxes(s);
    const sq = squareInfo(inc.map((x) => x.b), opts.padding);
    for (let n = 0; n < inc.length; n++) {
      try {
        const blob = await canvasToBlob(await renderIconAsync(s.img, s.an, s.boxes, inc[n].b, sq, opts));
        if (blob.size > 0) out.files.push({ path: (multi ? `${s.base}/` : "") + iconFileName(s, n), blob });
        else out.failed++;
      } catch { out.failed++; }
      onProgress?.(++done, total);
      await breathe();
    }
  }
  return out;
}

export async function buildZip(files: readonly ExportFile[]): Promise<Blob> {
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.path, f.blob));
  return zip.generateAsync({ type: "blob" });
}

/** Writes each file under its relative path, re-saving over an earlier export. */
export async function writeToFolder(dir: DirHandleLike, files: readonly ExportFile[], onProgress?: Progress): Promise<void> {
  for (let k = 0; k < files.length; k++) {
    const parts = files[k].path.split("/");
    const sub = await ensureDirPath(dir, parts.slice(0, -1).join("/"));
    await writeFileOverwrite(sub, parts[parts.length - 1], files[k].blob);
    onProgress?.(k + 1, files.length);
  }
}

export function zipName(sheets: readonly Pick<Sheet, "base">[]): string {
  return sheets.length === 1 ? `${sheets[0].base}-icons.zip` : "icons.zip";
}

/** The honest result line: how many were delivered and how many were skipped. */
export function exportSummary(done: string, c: Collected): string {
  return c.failed ? `${done} · ${c.failed} icon${c.failed === 1 ? "" : "s"} could not be rendered` : done;
}
