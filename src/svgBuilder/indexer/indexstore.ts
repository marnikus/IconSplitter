// indexstore.ts — reads and writes the per-icon `<svg>.index.json` files beside
// the approved SVGs. A missing, corrupt or foreign file simply means "not indexed".
import { ensureDirPath, readTextAt, writeFileOverwrite, type DirHandleLike } from "../../lib/fs";
import { indexPathOf, parseIndexRecord, serializeIndexRecord, type IconIndexRecord } from "../../lib/iconIndex/record";
import type { BuilderIconAsset } from "../../lib/svgBuilder/types";

const READ_BATCH = 24;

export async function readIconIndex(root: DirHandleLike, assets: readonly BuilderIconAsset[]): Promise<Map<string, IconIndexRecord>> {
  const out = new Map<string, IconIndexRecord>();
  for (let i = 0; i < assets.length; i += READ_BATCH) {
    const batch = assets.slice(i, i + READ_BATCH);
    const records = await Promise.all(batch.map((a) => readOne(root, a)));
    records.forEach((r, k) => { if (r !== null) out.set(batch[k].id, r); });
  }
  return out;
}

async function readOne(root: DirHandleLike, asset: BuilderIconAsset): Promise<IconIndexRecord | null> {
  try {
    const text = await readTextAt(root, indexPathOf(asset.svgPath));
    const record = text === null ? null : parseIndexRecord(JSON.parse(text));
    return record !== null && record.id === asset.id ? record : null;
  } catch {
    return null;
  }
}

/** App-owned index data: (re)written in place beside its SVG (RULE 23 output rule does not apply). */
export async function writeIconIndex(root: DirHandleLike, record: IconIndexRecord): Promise<void> {
  const path = indexPathOf(record.svgPath);
  const cut = path.lastIndexOf("/");
  const dir = await ensureDirPath(root, cut < 0 ? "" : path.slice(0, cut));
  await writeFileOverwrite(dir, path.slice(cut + 1), new Blob([serializeIndexRecord(record)], { type: "application/json" }));
}
