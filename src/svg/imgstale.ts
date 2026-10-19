// imgstale.ts — a returned cell belongs only to the pair and the exact
// main-image bytes that were explicitly previewed and sent.

import type { DirHandleLike } from "../lib/fs";
import type { PairMeta } from "../lib/pairmeta";
import { mainImageOf } from "../lib/svgimgreg";
import { readReferenceImage } from "./imgregfiles";
import { fingerprintOf, type PreparedImageSource } from "./imgprepare";

export async function sourceChangeReason(root: DirHandleLike, source: PreparedImageSource, latest: PairMeta | null): Promise<string | null> {
  if (mainImageOf(latest, source.row.source.relPath) !== source.path || (latest?.imagePreferred ?? null) !== source.preferred) {
    return `${source.row.source.name}: the main image changed while the request was running`;
  }
  const now = await readReferenceImage(root, source.path);
  if (now === null || now.size !== source.blob.size || await fingerprintOf(now) !== source.fingerprint) {
    return `${source.row.source.name}: the source bytes changed while the request was running`;
  }
  const before = new Uint8Array(await source.blob.arrayBuffer());
  const after = new Uint8Array(await now.arrayBuffer());
  if (before.some((byte, index) => byte !== after[index])) return `${source.row.source.name}: the source bytes changed while the request was running`;
  return null;
}
