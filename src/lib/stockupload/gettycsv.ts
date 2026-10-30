// gettycsv.ts — Getty Images / iStock ESP (`esp.gettyimages.com` & DeepMeta)
// RFC-4180 CSV metadata builder and contributor submission guideline checks.

import type { PlannedTransfer } from "./plan";
import type { ExportedItem, StockFormatFlags, StockFtpPreset } from "./types";

export const GETTY_ESP_CSV_HEADER = "file name,created date,title,description,country,brief code,keywords";
export const GETTY_MAX_KEYWORDS = 50;
export const GETTY_MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface GettyCsvOptions {
  country?: string;
  briefCode?: string;
}

function escapeCsvCell(value: string): string {
  const clean = value.replace(/\r?\n/g, " ").trim();
  if (!/[",]/.test(clean)) return clean;
  return `"${clean.replace(/"/g, '""')}"`;
}

function gettyPrimaryFileName(item: ExportedItem): string {
  if (item.files.eps !== null) return item.files.eps.fileName;
  if (item.files.raster !== null) return item.files.raster.fileName;
  return item.files.svg?.fileName ?? `${item.stem}.jpg`;
}

function formatCreatedDate(iso: string | null): string {
  const m = typeof iso === "string" ? /^(\d{4}-\d{2}-\d{2})/.exec(iso) : null;
  return m ? m[1] : new Date().toISOString().slice(0, 10);
}

function extractGettyTags(tags: readonly string[] | undefined): string {
  if (!tags) return "";
  return tags.map((t) => t.trim()).filter((t) => t !== "").slice(0, GETTY_MAX_KEYWORDS).join(",");
}

function buildGettyCsvRow(item: ExportedItem, opts?: GettyCsvOptions): string {
  const meta = item.record.metadata;
  const cells = [
    gettyPrimaryFileName(item),
    formatCreatedDate(item.record.timestamps.committedAt),
    meta?.title ?? "",
    meta?.description ?? "",
    opts?.country ?? "",
    opts?.briefCode ?? "",
    extractGettyTags(meta?.tags),
  ];
  return cells.map(escapeCsvCell).join(",");
}

export function buildGettyEspCsv(items: readonly ExportedItem[], opts?: GettyCsvOptions): string {
  const rows = items.map((item) => buildGettyCsvRow(item, opts));
  return `${[GETTY_ESP_CSV_HEADER, ...rows].join("\r\n")}\r\n`;
}

function hasValidGettyMetadata(item: ExportedItem): boolean {
  const m = item.record.metadata;
  if (m === null) return false;
  const tagCount = m.tags.filter((t) => t.trim() !== "").length;
  return m.title.trim().length >= 1 && m.description.trim().length >= 1 && tagCount >= 5 && tagCount <= GETTY_MAX_KEYWORDS;
}

function missingEpsJpgPair(rows: readonly ExportedItem[], formats: StockFormatFlags): boolean {
  if (!formats.eps) return false;
  if (!formats.raster) return true;
  return rows.some((r) => r.files.eps !== null && r.files.raster?.ext !== "jpg");
}

export function collectGettyWarnings(
  targets: readonly StockFtpPreset[],
  rows: readonly ExportedItem[],
  formats: StockFormatFlags,
  tasks: readonly PlannedTransfer[],
): string[] {
  const gettyTargets = targets.filter((t) => t.template === "getty-images");
  if (gettyTargets.length === 0) return [];
  const gettyIds = new Set(gettyTargets.map((t) => t.id));
  const gettyTasks = tasks.filter((t) => gettyIds.has(t.targetId));
  const warns: string[] = [];
  if (gettyTasks.some((t) => t.format === "svg" || t.format === "zip")) {
    warns.push("Getty Images / iStock ESP does not accept SVG or ZIP files — upload Illustrator EPS paired with same-basename RGB JPG.");
  }
  if (missingEpsJpgPair(rows, formats)) {
    warns.push("Getty Images / iStock requires every vector EPS to be paired with a matching same-basename RGB JPG preview (min 1900×2800 px, 4075×4075 px recommended).");
  }
  if (gettyTasks.some((t) => t.estimatedBytes > GETTY_MAX_FILE_BYTES)) {
    warns.push("Getty Images / iStock creative still & illustration maximum file size is 50 MB.");
  }
  if (rows.some((r) => !hasValidGettyMetadata(r))) {
    warns.push("Getty Images / iStock ESP requires a title, description, and 5–50 keywords (controlled vocabulary, no generative AI).");
  }
  return warns;
}
