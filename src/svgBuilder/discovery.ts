// discovery.ts — the builder's all-folder approved asset discovery. It reuses
// the upload tab's improved parallel walk, pair cache, preferred-version gate
// and audit, but turns OFF split-scope hiding and ignores its own output folder.
import { readTextAt, type DirHandleLike } from "../lib/fs";
import { isRecord } from "../lib/isrecord";
import { assetsFromRows } from "../lib/svgBuilder/assets";
import type { BuilderIconAsset, ExportMeta } from "../lib/svgBuilder/types";
import { exportDirOf, parseExportRecord } from "../lib/upload/export";
import {
  discoverUploadSources, type UploadDiscovery, type UploadExclusion, type UploadRowSource,
} from "../upload/discovery";

export const BUILDER_IGNORE = ["export", "svg-builder"] as const;

export interface BuilderDiscovery {
  assets: readonly BuilderIconAsset[];
  rows: readonly UploadRowSource[];
  excluded: readonly UploadExclusion[];
  audit: UploadDiscovery["audit"];
  corruptFiles: readonly string[];
  unreadable: UploadDiscovery["unreadable"];
  /** Icons named from their `export/export.json` metadata. */
  withMetadata: number;
}

const READ_BATCH = 24;

export async function discoverBuilderAssets(root: DirHandleLike): Promise<BuilderDiscovery> {
  const found = await discoverUploadSources(root, { hideOutside: false, ignoreDirs: BUILDER_IGNORE });
  const meta = await readExportMeta(root, found.rows);
  return {
    assets: assetsFromRows(found.rows, meta), rows: found.rows, excluded: found.excluded,
    audit: found.audit, corruptFiles: found.corruptFiles, unreadable: found.unreadable, withMetadata: meta.size,
  };
}

/**
 * Each pair's `<pair-folder>/export/export.json` metadata (title, description, tags),
 * used only when the record names THIS pair and has a title. A missing, corrupt or
 * foreign record simply leaves the file-name fallback (never guessed).
 */
export async function readExportMeta(root: DirHandleLike, rows: readonly UploadRowSource[]): Promise<Map<string, ExportMeta>> {
  const out = new Map<string, ExportMeta>();
  for (let i = 0; i < rows.length; i += READ_BATCH) {
    const batch = rows.slice(i, i + READ_BATCH);
    const metas = await Promise.all(batch.map((row) => exportMetaOf(root, row)));
    metas.forEach((m, k) => { if (m !== null) out.set(batch[k].id, m); });
  }
  return out;
}

async function exportMetaOf(root: DirHandleLike, row: UploadRowSource): Promise<ExportMeta | null> {
  try {
    const text = await readTextAt(root, `${exportDirOf(row.dirPath)}/export.json`);
    const record = text === null ? null : parseExportRecord(JSON.parse(text));
    return record?.pair.id === row.id ? cleanExportMeta(record.metadata) : null;
  } catch {
    return null;
  }
}

/** The record's metadata block, validated field by field (RULE 13); no title → none. */
function cleanExportMeta(m: unknown): ExportMeta | null {
  if (!isRecord(m) || typeof m.title !== "string" || m.title.trim() === "") return null;
  return { title: m.title, description: typeof m.description === "string" ? m.description : "",
    tags: Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === "string") : [] };
}

export function builderAuditLine(found: BuilderDiscovery): string {
  return `${found.assets.length} approved SVG asset(s) · ${found.audit.svgFiles} SVG file(s) · `
    + `${found.withMetadata} with export metadata · ${found.excluded.length} pair(s) not listed · ${found.corruptFiles.length} corrupt pair file(s)`;
}
