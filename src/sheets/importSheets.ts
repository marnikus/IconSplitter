import { analyzeAsync, detectAsync, type Analysis, type Box } from "../lib/detect";
import { loadImage } from "../lib/dom";
import { yieldToUI } from "../lib/yield";
import { withCompletionSound } from "../ui/completionSound";

export interface Sheet {
  id: string; name: string; base: string; url: string; img: HTMLImageElement;
  an: Analysis; boxes: Box[]; autoFrac: number; usedFrac: number;
  manual: boolean; excluded: number[];
}
interface ImportSink {
  busy: (message: string | null) => void;
  add: (sheet: Sheet) => void;
  select: (id: string) => void;
  say: (message: string, error?: boolean) => void;
}

/** One import process, with independent failures, never one cue per image. */
export async function importSheets(files: FileList | File[], sink: ImportSink): Promise<void> {
  const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
  if (!list.length) return sink.say("Please choose image files (PNG, JPG, WEBP…)", true);
  await withCompletionSound(async () => {
    let lastId: string | null = null;
    try {
      for (const file of list) {
        sink.busy(`Detecting icons in ${file.name}…`);
        await new Promise((r) => setTimeout(r, 30));
        try { const sheet = await detectSheet(file); sink.add(sheet); lastId = sheet.id; }
        catch (error) { sink.say(`${file.name}: ${(error as Error).message}`, true); }
        await yieldToUI();
      }
    } finally { sink.busy(null); }
    if (lastId) sink.select(lastId);
  });
}

async function detectSheet(file: File): Promise<Sheet> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const an = await analyzeAsync(img);
    await yieldToUI();
    const det = await detectAsync(an, null);
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "sheet";
    return { id: crypto.randomUUID(), name: file.name, base, url, img, an,
      boxes: det.boxes, autoFrac: det.autoFrac, usedFrac: det.usedFrac, manual: false, excluded: [] };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
