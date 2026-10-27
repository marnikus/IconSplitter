import { readJpegDimensions } from "../upload/jpeg";
import { verifyEpsDocument } from "../upload/epsdoc";
import type { StockArtifact } from "./types";
export async function checkStockMedia(artifact: StockArtifact, file: File): Promise<void> {
  if (artifact.kind === "jpg") {
    const dims = readJpegDimensions(new Uint8Array(await file.arrayBuffer()));
    if (!dims || dims.width * dims.height < 4_000_000) throw new Error(`${artifact.name}: JPEG must contain at least 4 megapixels`);
  } else if (artifact.kind === "eps") {
    const check = verifyEpsDocument(await file.text());
    if (!check.ok || !check.boundingBox) throw new Error(`${artifact.name}: invalid EPS document`);
    const box = check.boundingBox, pixels = (box.urx - box.llx) * (box.ury - box.lly);
    if (pixels < 4_000_000 || pixels > 25_000_000) throw new Error(`${artifact.name}: EPS artwork bounds must be 4–25 megapixels at 72 DPI`);
  } else throw new Error("Unsupported Shutterstock format");
}
