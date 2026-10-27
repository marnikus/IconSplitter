import { open } from "node:fs/promises";
import { readJpegDimensions } from "../../src/lib/upload/jpeg";
import type { TransferFile } from "../../src/lib/stockupload/types";
/** Fixed-size header/footer probes; never interpret or execute submitted artwork. */
export async function checkStagedMedia(path: string, file: TransferFile): Promise<void> {
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(Math.min(file.bytes, 256 * 1024)), tail = Buffer.alloc(Math.min(file.bytes, 128));
    await handle.read(head, 0, head.length, 0); await handle.read(tail, 0, tail.length, file.bytes - tail.length);
    if (file.kind === "jpg") {
      const dims = readJpegDimensions(head);
      if (!dims || dims.width * dims.height < 4_000_000 || tail[tail.length - 2] !== 255 || tail[tail.length - 1] !== 217) throw new Error("Invalid stock JPEG");
    } else checkEpsHeader(head.toString("ascii"), tail.toString("ascii"));
  } finally { await handle.close(); }
}
function checkEpsHeader(head: string, tail: string): void {
  const box = /^%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/m.exec(head);
  if (!head.startsWith("%!PS-Adobe") || !box || !/%%EOF\s*$/.test(tail)) throw new Error("Invalid stock EPS");
  const width = Number(box[3]) - Number(box[1]), height = Number(box[4]) - Number(box[2]);
  if (width <= 0 || height <= 0 || width * height < 4_000_000 || width * height > 25_000_000) throw new Error("Invalid EPS artwork bounds");
}
