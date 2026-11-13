// usagestore.ts — reads and writes the per-icon `<svg>.usage.json` files beside the
// approved SVGs, next to their `<svg>.index.json` (2026-11-13). A missing, corrupt
// or foreign file means "never used". Written only when an artboard is exported.
import { ensureDirPath, readTextAt, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { bumpUsage, emptyUsage, parseUsageRecord, serializeUsageRecord, usagePathOf, type UsageRecord } from "../lib/svgBuilder/usage";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";

const READ_BATCH = 24;

export async function readUsage(root: DirHandleLike, assets: readonly BuilderIconAsset[]): Promise<Map<string, UsageRecord>> {
  const out = new Map<string, UsageRecord>();
  for (let i = 0; i < assets.length; i += READ_BATCH) {
    const batch = assets.slice(i, i + READ_BATCH);
    const records = await Promise.all(batch.map((a) => readOne(root, a)));
    records.forEach((r, k) => { if (r !== null) out.set(batch[k].id, r); });
  }
  return out;
}

async function readOne(root: DirHandleLike, asset: BuilderIconAsset): Promise<UsageRecord | null> {
  try {
    const text = await readTextAt(root, usagePathOf(asset.svgPath));
    const record = text === null ? null : parseUsageRecord(JSON.parse(text));
    return record !== null && record.id === asset.id ? record : null;
  } catch {
    return null;
  }
}

async function writeOne(root: DirHandleLike, record: UsageRecord): Promise<void> {
  const path = usagePathOf(record.svgPath);
  const cut = path.lastIndexOf("/");
  const dir = await ensureDirPath(root, cut < 0 ? "" : path.slice(0, cut));
  await writeFileOverwrite(dir, path.slice(cut + 1), new Blob([serializeUsageRecord(record)], { type: "application/json" }));
}

/**
 * One more export for each icon: re-reads the file first (another window may have
 * counted too), bumps it and writes it back. Answers the new records and the ids
 * that could not be written.
 */
export interface RecordUseArgs {
  root: DirHandleLike;
  assets: readonly BuilderIconAsset[];
  ids: readonly string[];
  /** Which artboard was exported (written to the history). */
  artboard: string;
  at: string;
}

export async function recordUse(args: RecordUseArgs): Promise<{ records: Map<string, UsageRecord>; failed: string[] }> {
  const { root, assets, ids, artboard, at } = args;
  const byId = new Map(assets.map((a) => [a.id, a]));
  const records = new Map<string, UsageRecord>();
  const failed: string[] = [];
  for (const id of ids) {
    const asset = byId.get(id);
    if (asset === undefined) continue;
    const next = bumpUsage((await readOne(root, asset)) ?? emptyUsage(asset.id, asset.svgPath), artboard, at);
    try { await writeOne(root, next); records.set(id, next); } catch { failed.push(id); }
  }
  return { records, failed };
}
