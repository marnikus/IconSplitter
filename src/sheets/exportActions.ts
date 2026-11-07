// exportActions.ts — the Single-sheets export buttons: ZIP and Save to folder
// for the checked sheets, and Copy / Save for one icon. Progress goes to
// `busy` (RULE 5); the completion cue fires once per finished process.
import { download } from "../lib/dom";
import type { DirHandleLike } from "../lib/fs";
import { canvasToBlob, renderIconAsync, squareInfo, type ExportOpts } from "../lib/render";
import { includedBoxes } from "../lib/sheetsel";
import { startCompletionSound, withCompletionSound } from "../ui/completionSound";
import type { Sheet } from "./importSheets";
import { buildZip, collectIcons, exportSummary, iconFileName, writeToFolder, zipName } from "./sheetsExport";

export interface ExportCtx {
  sheets: Sheet[]; // the checked sheets, list order
  opts: ExportOpts;
  say: (msg: string, err?: boolean) => void;
  busy: (msg: string | null) => void;
}

type PickerWindow = { showDirectoryPicker?: (o: { mode: string }) => Promise<DirHandleLike> };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One export process: false = cancelled by the user (no success cue). */
async function run(ctx: ExportCtx, label: string, fn: () => Promise<void | false>) {
  const finish = startCompletionSound();
  let cancelled = false;
  try {
    ctx.busy(label);
    await sleep(20);
    cancelled = (await fn()) === false;
  } catch (e) {
    cancelled = (e as Error).name === "AbortError";
    if (!cancelled) ctx.say((e as Error).message || "Export failed", true);
  } finally {
    ctx.busy(null);
    finish(cancelled);
  }
}

export function exportZip(ctx: ExportCtx) {
  return run(ctx, "Building ZIP…", async () => {
    const c = await collectIcons(ctx.sheets, ctx.opts, (d, t) => ctx.busy(`Rendering ${d}/${t}…`));
    if (!c.files.length) throw new Error("No icon could be rendered");
    download(await buildZip(c.files), zipName(ctx.sheets));
    ctx.say(exportSummary(`ZIP with ${c.files.length} icons from ${ctx.sheets.length} sheet${ctx.sheets.length === 1 ? "" : "s"} downloaded`, c), c.failed > 0);
  });
}

export function exportFolder(ctx: ExportCtx) {
  return run(ctx, "Saving to folder…", async () => {
    const dir = await pickFolder(ctx);
    if (!dir) return false;
    const c = await collectIcons(ctx.sheets, ctx.opts, (d, t) => ctx.busy(`Rendering ${d}/${t}…`));
    await writeToFolder(dir, c.files, (d, t) => ctx.busy(`Saving ${d}/${t}…`));
    ctx.say(exportSummary(`Saved ${c.files.length} icons from ${ctx.sheets.length} sheet${ctx.sheets.length === 1 ? "" : "s"} to “${dir.name}”`, c), c.failed > 0);
  });
}

async function pickFolder(ctx: ExportCtx): Promise<DirHandleLike | null> {
  const w = window as unknown as PickerWindow;
  if (!w.showDirectoryPicker) { ctx.say("Folder saving needs Chrome/Edge. Use “ZIP” instead.", true); return null; }
  try { return await w.showDirectoryPicker({ mode: "readwrite" }); } catch (e) {
    if ((e as Error).name !== "AbortError") ctx.say("Folder access isn't allowed here. Use “ZIP” instead.", true);
    return null;
  }
}

/** One icon (detection index `i`) of one sheet, square-sized like its export. */
async function iconBlob(sheet: Sheet, i: number, opts: ExportOpts): Promise<{ blob: Blob; name: string }> {
  const inc = includedBoxes(sheet);
  const sq = squareInfo((inc.length ? inc.map((x) => x.b) : sheet.boxes), opts.padding);
  const n = inc.findIndex((x) => x.i === i);
  const blob = await canvasToBlob(await renderIconAsync(sheet.img, sheet.an, sheet.boxes, sheet.boxes[i], sq, opts));
  return { blob, name: n >= 0 ? iconFileName(sheet, n) : `${sheet.base}-detected-${String(i + 1).padStart(2, "0")}.png` };
}

export async function copyIcon(sheet: Sheet, i: number, ctx: Pick<ExportCtx, "opts" | "say">) {
  try {
    await withCompletionSound(async () => {
      const { blob } = await iconBlob(sheet, i, ctx.opts);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      ctx.say(`Icon ${i + 1} copied to clipboard`);
    });
  } catch {
    ctx.say("Clipboard is blocked by the browser – use Save instead", true);
  }
}

export async function saveIcon(sheet: Sheet, i: number, opts: ExportOpts) {
  await withCompletionSound(async () => { const r = await iconBlob(sheet, i, opts); download(r.blob, r.name); });
}
