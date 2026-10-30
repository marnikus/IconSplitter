// plan.ts — pure upload planner across (checkedTargets × checkedRows × checkedFormats).

import { collectGettyWarnings } from "./gettycsv";
import type {
  ExportedFileRef, ExportedItem, StockFormatFlags, StockFtpPreset, UploadFormatKey,
} from "./types";

export const FORMAT_ORDER: readonly UploadFormatKey[] = ["raster", "svg", "eps", "zip"];

export interface PlannedTransfer {
  itemId: string;
  stem: string;
  targetId: string;
  targetName: string;
  format: UploadFormatKey;
  fileName: string;
  relPath: string | null;
  estimatedBytes: number;
}

export interface SkippedFormat {
  itemId: string;
  stem: string;
  format: UploadFormatKey;
}

export interface StockUploadPlanInput {
  items: readonly ExportedItem[];
  checkedIds: readonly string[];
  presets: readonly StockFtpPreset[];
  checkedTargets: readonly string[];
  formats: StockFormatFlags;
  combineTitleDescription?: boolean;
}

export interface StockUploadPlan {
  combineTitleDescription: boolean;
  targets: StockFtpPreset[];
  selectedRows: ExportedItem[];
  selectedFormats: UploadFormatKey[];
  tasks: PlannedTransfer[];
  skippedMissing: SkippedFormat[];
  warnings: string[];
  preflightErrors: string[];
  totalBytes: number;
}

function selectedFormatsOf(flags: StockFormatFlags): UploadFormatKey[] {
  return FORMAT_ORDER.filter((k) => flags[k]);
}

function zipEstimatedBytes(item: ExportedItem): number {
  if (item.files.zip !== null) return item.files.zip.bytes;
  return (item.files.raster?.bytes ?? 0) + (item.files.svg?.bytes ?? 0) + (item.files.eps?.bytes ?? 0);
}

function canBuildZip(item: ExportedItem): boolean {
  return item.files.zip !== null || item.files.raster !== null || item.files.svg !== null || item.files.eps !== null;
}

function directFileOf(item: ExportedItem, fmt: Exclude<UploadFormatKey, "zip">): ExportedFileRef | null {
  if (fmt === "raster") return item.files.raster;
  return fmt === "svg" ? item.files.svg : item.files.eps;
}

function resolveItemFormat(
  item: ExportedItem,
  fmt: UploadFormatKey,
): { fileName: string; relPath: string | null; bytes: number } | null {
  if (fmt === "zip") {
    if (!canBuildZip(item)) return null;
    const z = item.files.zip;
    return { fileName: z ? z.fileName : `${item.stem}.zip`, relPath: z ? z.relPath : null, bytes: zipEstimatedBytes(item) };
  }
  const ref = directFileOf(item, fmt);
  return ref === null ? null : { fileName: ref.fileName, relPath: ref.relPath, bytes: ref.bytes };
}

function collectPreflightErrors(
  rows: readonly ExportedItem[],
  checkedPresets: readonly StockFtpPreset[],
  formats: readonly UploadFormatKey[],
): string[] {
  const errs: string[] = [];
  if (rows.length === 0) errs.push("Select at least one exported item to upload.");
  if (checkedPresets.length === 0) errs.push("Check at least one target FTP website.");
  for (const p of checkedPresets) {
    if (p.protocol !== "esp-batch" && p.host.trim() === "") {
      errs.push(`Stock preset "${p.name}" has no FTP host configured.`);
    }
  }
  if (formats.length === 0) errs.push("Select at least one file format (JPEG/PNG, SVG, EPS, or ZIP).");
  return errs;
}

function hasValidAdobeMetadata(item: ExportedItem): boolean {
  const m = item.record.metadata;
  if (m === null) return false;
  const titleLen = m.title.trim().length;
  const tagCount = m.tags.filter((t) => t.trim() !== "").length;
  return titleLen >= 1 && titleLen <= 200 && tagCount >= 5 && tagCount <= 49;
}

function collectAdobeStockWarnings(
  targets: readonly StockFtpPreset[],
  rows: readonly ExportedItem[],
  tasks: readonly PlannedTransfer[],
): string[] {
  const adobeTargets = targets.filter((t) => t.template === "adobe-stock");
  if (adobeTargets.length === 0) return [];
  const adobeIds = new Set(adobeTargets.map((t) => t.id));
  const warns: string[] = [];
  if (tasks.some((t) => adobeIds.has(t.targetId) && t.format === "zip")) {
    warns.push("Adobe Stock does not accept ZIP archives — upload standalone SVG, EPS, or JPEG/PNG files.");
  }
  if (adobeTargets.some((t) => t.remoteDir !== "/")) {
    warns.push("Adobe Stock SFTP requires uploading standalone files to root '/' (subfolders are not supported).");
  }
  if (tasks.some((t) => adobeIds.has(t.targetId) && t.estimatedBytes > 45 * 1024 * 1024)) {
    warns.push("Adobe Stock maximum vector file size is 45 MB.");
  }
  if (rows.some((r) => !hasValidAdobeMetadata(r))) {
    warns.push("Adobe Stock requires a 1–200 char title and 5–49 keywords per asset (no brand/artist/person names).");
  }
  return warns;
}

function collectShutterstockWarnings(targets: readonly StockFtpPreset[], tasks: readonly PlannedTransfer[]): string[] {
  if (!targets.some((t) => t.template === "shutterstock")) return [];
  const warns: string[] = [];
  const unsafe = tasks.filter((t) => t.targetId === "shutterstock" && /[^A-Za-z0-9_.-]/.test(t.fileName));
  if (unsafe.length > 0) {
    warns.push(`${unsafe.length} file(s) contain characters outside A–Z, 0–9, underscore/hyphen — Shutterstock recommends ASCII/underscore names.`);
  }
  const nonMedia = tasks.filter((t) => t.targetId === "shutterstock" && (t.format === "svg" || t.format === "zip"));
  if (nonMedia.length > 0) {
    warns.push("Shutterstock FTPS officially accepts JPEG and Illustrator EPS — SVG/ZIP files may be ignored by Shutterstock.");
  }
  return warns;
}

function collectSkippedFormats(
  rows: readonly ExportedItem[],
  formats: readonly UploadFormatKey[],
): SkippedFormat[] {
  const skipped: SkippedFormat[] = [];
  for (const item of rows) {
    for (const fmt of formats) {
      if (resolveItemFormat(item, fmt) === null) skipped.push({ itemId: item.id, stem: item.stem, format: fmt });
    }
  }
  return skipped;
}

function expandPlannedTransfers(
  targets: readonly StockFtpPreset[],
  rows: readonly ExportedItem[],
  formats: readonly UploadFormatKey[],
): PlannedTransfer[] {
  const tasks: PlannedTransfer[] = [];
  for (const target of targets) {
    for (const item of rows) {
      for (const fmt of formats) {
        const res = resolveItemFormat(item, fmt);
        if (res === null) continue;
        tasks.push({
          itemId: item.id, stem: item.stem, targetId: target.id, targetName: target.name,
          format: fmt, fileName: res.fileName, relPath: res.relPath, estimatedBytes: res.bytes,
        });
      }
    }
  }
  return tasks;
}

export function buildStockUploadPlan(input: StockUploadPlanInput): StockUploadPlan {
  const idSet = new Set(input.checkedIds);
  const selectedRows = input.items.filter((it) => idSet.has(it.id));
  const targetSet = new Set(input.checkedTargets);
  const checkedPresets = input.presets.filter((p) => targetSet.has(p.id));
  const targets = checkedPresets.filter((p) => p.host.trim() !== "");
  const selectedFormats = selectedFormatsOf(input.formats);
  const preflightErrors = collectPreflightErrors(selectedRows, checkedPresets, selectedFormats);
  const skippedMissing = collectSkippedFormats(selectedRows, selectedFormats);
  const tasks = expandPlannedTransfers(targets, selectedRows, selectedFormats);

  if (preflightErrors.length === 0 && tasks.length === 0) {
    preflightErrors.push("None of the selected items have the requested exported format(s) on disk.");
  }
  const totalBytes = tasks.reduce((sum, t) => sum + t.estimatedBytes, 0);
  const warnings = [
    ...collectShutterstockWarnings(targets, tasks),
    ...collectAdobeStockWarnings(targets, selectedRows, tasks),
    ...collectGettyWarnings(targets, selectedRows, input.formats, tasks),
  ];
  return { targets, selectedRows, selectedFormats, tasks, skippedMissing, warnings, preflightErrors, totalBytes, combineTitleDescription: input.combineTitleDescription === true };
}
