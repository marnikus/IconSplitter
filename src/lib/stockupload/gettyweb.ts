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
/**
 * One request carries one batch, so it must also stay inside the helper's body
 * cap — a 100-icon chunk of big pairs can be hundreds of megabytes. The planner
 * cuts a batch early when the bytes would cross this budget.
 */
export const GETTY_WEB_MAX_BATCH_BYTES = 64 * 1024 * 1024;
/**
 * What to assume when the running helper does not say what it takes: a helper
 * from before `GETTY_WEB_MAX_BYTES` capped a Getty body far lower than 64 MB, and
 * guessing high is what made a 209-icon run lose every file to one refused
 * request. Staying low only costs a few more batches.
 */
export const GETTY_WEB_OLD_HELPER_BYTES = 16 * 1024 * 1024;

/**
 * The bytes one request may carry: what the helper reports it takes, never more
 * than this build's own budget, and the small guess when it reports nothing.
 */
export function gettyWebRequestBytes(advertised?: number): number {
  if (typeof advertised !== "number" || !Number.isFinite(advertised) || advertised <= 0) {
    return GETTY_WEB_OLD_HELPER_BYTES;
  }
  return Math.max(1, Math.min(GETTY_WEB_MAX_BATCH_BYTES, Math.floor(advertised)));
}
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

/**
 * The order a run uploads its icons in when **random batch selection** is on: a
 * Fisher–Yates shuffle, so the 100-icon chunks are random draws from what is
 * left instead of the next slice of the list. `rng` is injectable for tests.
 */
export function randomBatchOrder(count: number, rng: () => number = Math.random): number[] {
  const order = Array.from({ length: Math.max(0, Math.trunc(count)) }, (_value, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const pick = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    [order[i], order[pick]] = [order[pick], order[i]];
  }
  return order;
}

/**
 * The part of an icon's name that makes two icons look alike: `icon-snowflake_2_01`
 * and `icon-snowflake_2_02` are one picture in two sizes, so they group.
 */
export function similarityKeyOf(name: string): string {
  const leaf = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const dot = leaf.lastIndexOf(".");
  const stem = (dot > 0 ? leaf.slice(0, dot) : leaf).trim().toLowerCase();
  return stem.replace(/[\s._-]*\d+$/, "") || stem;
}

/**
 * Pushes icons of the same picture apart after a batch was drawn: an icon that
 * repeats the key of the one before it is moved further along, so the batch keeps
 * the draw's own order everywhere else while similar files stop travelling side
 * by side. A batch that is one picture only cannot be spread and stays as it is.
 */
export function spreadSimilar<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const out = [...items];
  for (let i = 1; i < out.length; i += 1) {
    if (keyOf(out[i]) !== keyOf(out[i - 1])) continue;
    const j = out.findIndex((item, index) => index > i && keyOf(item) !== keyOf(out[i - 1]));
    if (j < 0) continue;
    out.splice(i, 0, ...out.splice(j, 1));
  }
  return out;
}

/** Batch name the bridge types into Getty's Create Batch dialog: date, place, size. */
export function gettyWebBatchName(now: Date, itemCount: number, slot?: GettyWebBatchSlot): string {
  const stamp = now.toISOString().slice(0, 10);
  const plural = itemCount === 1 ? "icon" : "icons";
  return `${stamp}${batchPlaceOf(slot)} (${Math.max(itemCount, 0)} ${plural})`
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

/** The limits one batch obeys: Getty's 100 uploads, and the request's bytes. */
export interface GettyWebBatchOptions<T> {
  maxIcons?: number;
  maxBytes?: number;
  /** The bytes one icon sends — its JPEG plus optional EPS; unknown counts as 0. */
  bytesOf?: (icon: T) => number;
}

function batchOptionsOf<T>(
  maxIconsOrOptions: number | GettyWebBatchOptions<T>,
): Required<Omit<GettyWebBatchOptions<T>, "bytesOf">> & Pick<GettyWebBatchOptions<T>, "bytesOf"> {
  const options = typeof maxIconsOrOptions === "number" ? { maxIcons: maxIconsOrOptions } : maxIconsOrOptions;
  return {
    maxIcons: Math.max(1, Math.floor(options.maxIcons ?? GETTY_WEB_MAX_BATCH_ICONS)),
    maxBytes: Math.max(1, Math.floor(options.maxBytes ?? GETTY_WEB_MAX_BATCH_BYTES)),
    bytesOf: options.bytesOf,
  };
}

/**
 * Splits ordered icons into batches obeying both limits: at most `maxIcons` and
 * at most `maxBytes` per request. The icon is the unit, so a JPEG/EPS pair can
 * never be split across two batches; order is preserved, which is what makes
 * "the first 100 pairs" mean something. An icon larger than the whole budget
 * travels alone rather than being dropped.
 */
export function planGettyWebBatches<T>(
  icons: readonly T[],
  maxIconsOrOptions: number | GettyWebBatchOptions<T> = GETTY_WEB_MAX_BATCH_ICONS,
): T[][] {
  const { maxIcons, maxBytes, bytesOf } = batchOptionsOf(maxIconsOrOptions);
  const out: T[][] = [];
  let batch: T[] = [];
  let bytes = 0;
  for (const icon of icons) {
    const size = Math.max(0, bytesOf?.(icon) ?? 0);
    if (batch.length >= maxIcons || (batch.length > 0 && bytes + size > maxBytes)) {
      out.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(icon);
    bytes += size;
  }
  if (batch.length > 0) out.push(batch);
  return out;
}

/** The batch a request belongs to, for the panel's progress line. */
export function gettyWebBatchLabel(slot: GettyWebBatchSlot): string {
  if (slot.retry === true) return `retry batch ${slot.index}/${slot.total}`;
  return slot.total > 1 ? `batch ${slot.index}/${slot.total}` : "";
}

/** One line for the confirm dialog: how many Getty batches the selection needs. */
export function gettyWebBatchSummary(iconCount: number, maxIcons = GETTY_WEB_MAX_BATCH_ICONS): string {
  return gettyWebBatchSummaryOf(Array.from({ length: Math.max(0, iconCount) }, () => 0), maxIcons);
}

/**
 * The same line, but honest about the request size: the bytes of each icon of the
 * selection are known before Upload, so the dialog can say that 209 pairs of big
 * files take more than two batches — a batch is cut early when it would outgrow
 * one request.
 */
export function gettyWebBatchSummaryOf(
  sizes: readonly number[],
  maxIcons = GETTY_WEB_MAX_BATCH_ICONS,
  maxBytes = GETTY_WEB_MAX_BATCH_BYTES,
): string {
  const chunks = planGettyWebBatches(sizes.map((_size, index) => index), { maxIcons, maxBytes, bytesOf: (index) => sizes[index] });
  const batches = Math.max(1, chunks.length);
  const plural = batches === 1 ? "batch" : "batches";
  return `${sizes.length} icon(s) → ${batches} ${plural} (Getty takes ${maxIcons} uploads per batch; a JPEG + EPS pair counts once)`;
}

/** The bytes of each icon of one Getty target, in plan order (a pair is one icon). */
export function gettyWebIconSizes(tasks: readonly PlannedTransfer[], targetIds: ReadonlySet<string>): number[] {
  const byItem = new Map<string, number>();
  for (const task of tasks) {
    if (!targetIds.has(task.targetId)) continue;
    byItem.set(task.itemId, (byItem.get(task.itemId) ?? 0) + Math.max(0, task.estimatedBytes));
  }
  return [...byItem.values()];
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
