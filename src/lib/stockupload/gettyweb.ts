// gettyweb.ts — pure rules for the Getty Images / iStock *web* upload: the
// legacy contributor site (esp.gettyimages.com/contribute) signs in with the
// saved e-mail/password, creates one batch, the page's own uploader takes the
// JPEG (+ optional matching EPS), and the accepted metadata is typed into each
// file's editor before the batch is completed. No key and no OAuth.

import type { PlannedTransfer, SkippedFormat } from "./plan";
import type { ExportedItem, StockFtpPreset } from "./types";

export const GETTY_WEB_SUBMISSION_TYPE = "iStock creative illustration";
export const GETTY_WEB_MAX_BATCH_NAME = 60;
/**
 * Getty takes at most **100 uploads per batch**. One icon is one upload — its
 * JPEG, plus its EPS when it has one, because Getty lists a pair once under the
 * EPS name. So the number that must never exceed this is the icon count, not the
 * file count: 100 pairs are fine, 101 are not.
 */
export const GETTY_WEB_MAX_BATCH_ICONS = 100;
/** One upload plus one retry: an icon is never sent a third time. */
export const GETTY_WEB_MAX_ATTEMPTS = 2;
export const GETTY_WEB_ERROR_HINT =
  "start run_ftp_bridge.bat (or run_inkscape_bridge.bat) on this machine, then retry";

/** Title/description/keywords filled into Getty's per-file metadata editor. */
export interface GettyWebMetadata {
  title: string;
  description: string;
  keywords: string[];
}

export const GETTY_WEB_MAX_KEYWORDS = 49;
const GETTY_WEB_MAX_TITLE = 200;
const GETTY_WEB_MAX_DESCRIPTION = 2000;
const GETTY_WEB_MAX_KEYWORD = 64;

function cleanKeywords(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, GETTY_WEB_MAX_KEYWORD);
    const key = tag.toLowerCase();
    if (tag === "" || seen.has(key) || out.length >= GETTY_WEB_MAX_KEYWORDS) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * The accepted metadata of an exported icon, ready to type into the page.
 * `null` when nothing was accepted (the files' embedded metadata is then the
 * only source) or when the title is empty — Getty needs a title.
 */
export function gettyWebMetadataOf(item: ExportedItem): GettyWebMetadata | null {
  const meta = item.record.metadata;
  if (meta === null || meta.state !== "accepted") return null;
  const title = meta.title.trim().replace(/\s+/g, " ").slice(0, GETTY_WEB_MAX_TITLE);
  if (title === "") return null;
  return {
    title,
    description: meta.description.trim().replace(/\s+/g, " ").slice(0, GETTY_WEB_MAX_DESCRIPTION),
    keywords: cleanKeywords(meta.tags),
  };
}

export function isGettyWebPreset(preset: StockFtpPreset): boolean {
  return preset.protocol === "getty-web";
}

/** Batch name the bridge types into Getty's Create Batch dialog. */
export function gettyWebBatchName(now: Date, itemCount: number, slot?: GettyWebBatchSlot): string {
  const stamp = now.toISOString().slice(0, 10);
  const plural = itemCount === 1 ? "icon" : "icons";
  return `IconSplitter ${stamp}${batchPlaceOf(slot)} (${Math.max(itemCount, 0)} ${plural})`
    .slice(0, GETTY_WEB_MAX_BATCH_NAME);
}

/** Where a batch sits in a run; absent for a run that fits in one batch. */
export interface GettyWebBatchSlot {
  index: number;
  total: number;
  /** A retry batch carries icons of an earlier batch for their second attempt. */
  retry?: boolean;
}

/** `" 2/3"` (or `" retry 1/1"`), and nothing at all for a single-batch run. */
function batchPlaceOf(slot?: GettyWebBatchSlot): string {
  if (slot === undefined) return "";
  if (slot.retry === true) return ` retry ${slot.index}/${slot.total}`;
  return slot.total > 1 ? ` ${slot.index}/${slot.total}` : "";
}

/**
 * Splits ordered icons into batches of at most `maxIcons`. The icon is the unit,
 * so a JPEG/EPS pair can never be split across two batches; order is preserved,
 * which is what makes "the first 100 pairs" mean something.
 */
export function planGettyWebBatches<T>(
  icons: readonly T[],
  maxIcons = GETTY_WEB_MAX_BATCH_ICONS,
): T[][] {
  const size = Math.max(1, Math.floor(maxIcons));
  const out: T[][] = [];
  for (let i = 0; i < icons.length; i += size) out.push(icons.slice(i, i + size));
  return out;
}

/**
 * How many staged bytes **one loopback request** may carry. The helper buffers a
 * whole request in memory and refuses more than `BRIDGE_FTP_MAX_BYTES` (120 MB by
 * default), so a full batch — 100 icons, up to 200 files, often hundreds of
 * megabytes — is sent in parts. The batch is still one batch: the parts only
 * split the bytes of the body, never the icon.
 */
export const GETTY_WEB_MAX_REQUEST_BYTES = 24 * 1024 * 1024;
/** And no request carries more icons than this, however small they are. */
export const GETTY_WEB_MAX_REQUEST_ICONS = 25;

/**
 * Groups the icons of **one batch** into the requests that carry them: at most
 * `maxBytes` staged bytes and `maxIcons` icons each, in the plan's order. An icon
 * bigger than the whole budget still travels whole, alone in its request — a
 * pair is never split across two bodies.
 */
export function planGettyWebRequests<T>(
  icons: readonly T[],
  bytesOf: (icon: T) => number,
  maxBytes = GETTY_WEB_MAX_REQUEST_BYTES,
  maxIcons = GETTY_WEB_MAX_REQUEST_ICONS,
): T[][] {
  const byteLimit = Math.max(1, Math.floor(maxBytes));
  const countLimit = Math.max(1, Math.floor(maxIcons));
  const out: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const icon of icons) {
    const size = Math.max(0, Math.floor(Number(bytesOf(icon)) || 0));
    const full = current.length > 0 && (bytes + size > byteLimit || current.length >= countLimit);
    if (full) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(icon);
    bytes += size;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** The batch a request belongs to, for the panel's progress line. */
export function gettyWebBatchLabel(slot: GettyWebBatchSlot): string {
  if (slot.retry === true) return `retry batch ${slot.index}/${slot.total}`;
  return slot.total > 1 ? `batch ${slot.index}/${slot.total}` : "";
}

/** One line for the confirm dialog: how many Getty batches the selection needs. */
export function gettyWebBatchSummary(iconCount: number, maxIcons = GETTY_WEB_MAX_BATCH_ICONS): string {
  const batches = Math.max(1, Math.ceil(Math.max(iconCount, 0) / Math.max(1, maxIcons)));
  const plural = batches === 1 ? "batch" : "batches";
  return `${iconCount} icon(s) → ${batches} ${plural} (Getty takes ${maxIcons} uploads per batch; a JPEG + EPS pair counts once)`;
}

/**
 * Date Created exactly as Getty's metadata drawer shows it, e.g.
 * "10/10/2026 00:00:00 +0000": US month/day/year, midnight, UTC offset.
 */
export function gettyWebCreatedDate(now: Date): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${month}/${day}/${now.getUTCFullYear()} 00:00:00 +0000`;
}

function pairOf(tasks: readonly PlannedTransfer[]): { raster: PlannedTransfer | null; vector: PlannedTransfer | null } {
  return {
    raster: tasks.find((t) => t.format === "raster") ?? null,
    vector: tasks.find((t) => t.format === "eps") ?? null,
  };
}

/** The contribution a file belongs to; a vector pair shares one stem. */
export function gettyWebStem(fileName: string): string {
  const leaf = String(fileName ?? "").split(/[\\/]/).pop() ?? "";
  const dot = leaf.lastIndexOf(".");
  return (dot > 0 ? leaf.slice(0, dot) : leaf).trim().toLowerCase();
}

const stemOf = gettyWebStem;

/** Getty web upload takes one JPEG per icon and an optional matching EPS. */
export function validateGettyWebTasks(
  tasks: readonly PlannedTransfer[],
  missing: readonly SkippedFormat[],
): string | null {
  const { raster, vector } = pairOf(tasks);
  if (!raster || !/\.jpe?g$/i.test(raster.fileName)) {
    return "Getty Images accepts a JPEG per icon — enable JPEG/PNG and export a JPEG first.";
  }
  if (tasks.some((t) => t.format !== "raster" && t.format !== "eps")) {
    return "Getty Images web upload takes the JPEG and an optional matching EPS only — SVG and ZIP are not supported.";
  }
  if (missing.some((m) => m.itemId === raster.itemId && (m.format === "raster" || m.format === "eps"))) {
    return "A selected Getty file is missing on disk; nothing was uploaded for this icon.";
  }
  if (vector && stemOf(raster.fileName) !== stemOf(vector.fileName)) {
    return "Getty EPS and JPEG must have matching filenames.";
  }
  return null;
}

/** The files one item contributes, in upload order (JPEG first, EPS second). */
export function gettyWebFileOrder(tasks: readonly PlannedTransfer[]): PlannedTransfer[] {
  const { raster, vector } = pairOf(tasks);
  return [raster, vector].filter((t): t is PlannedTransfer => t !== null);
}
