// rejectedfiles.ts — files a stock site refused after the transfer succeeded
// (Adobe "Upload limit reached", "File size too small", …). Pure: read the
// pasted names, find the items they belong to, and take them out of history.

import type { StockUploadBatch } from "./batchhistory";
import { realNameOf } from "./shufflenames";
import type { ExportedItem } from "./types";

const FILE_NAME = /\.(eps|ai|svg|jpe?g|png|tiff?|webp|zip)$/i;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_m, name: string) => ENTITIES[name]);
}

function leafOf(name: string): string {
  return name.split(/[\\/]/).pop() ?? "";
}

/** `download-icon.eps` → `download-icon`, compared without case. */
export function stemKey(fileName: string): string {
  return leafOf(fileName).replace(/\.[^.]+$/, "").toLowerCase();
}

/**
 * The real file names in pasted text: a copied stock-site table (tags become
 * line breaks, so only text cells remain — attributes never count) or a plain
 * comma / line / semicolon separated list. The `0007-` upload rank is dropped;
 * names are unique without regard to case, first spelling wins.
 */
export function parseRejectedFileNames(text: string): string[] {
  const plain = decodeEntities(String(text ?? "").replace(/<[^>]*>/g, "\n"));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of plain.split(/[\n\r,;\t]+/)) {
    const name = realNameOf(leafOf(token.trim()));
    if (!FILE_NAME.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

export interface RejectedSources {
  stockId: string;
  batches: readonly StockUploadBatch[];
  items: readonly ExportedItem[];
}

export interface RejectedMatch {
  itemIds: string[];
  matchedNames: string[];
  unmatchedNames: string[];
}

function addTo(index: Map<string, Set<string>>, fileName: string, itemId: string): void {
  const key = stemKey(fileName);
  const ids = index.get(key) ?? new Set<string>();
  ids.add(itemId);
  index.set(key, ids);
}

/** stem → item ids, from that stock's upload history and the items listed now. */
function stemIndex(src: RejectedSources): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const batch of src.batches) {
    if (batch.stockId !== src.stockId) continue;
    for (const file of batch.files) addTo(index, file.fileName, file.itemId);
  }
  for (const item of src.items) {
    for (const ref of Object.values(item.files)) if (ref) addTo(index, ref.fileName, item.id);
  }
  return index;
}

/**
 * Every item a pasted name belongs to — by stem, so `x.jpg` finds the item that
 * went up as `x.eps`. A name shared by several items matches all of them.
 */
export function matchRejectedItems(names: readonly string[], src: RejectedSources): RejectedMatch {
  const index = stemIndex(src);
  const ids = new Set<string>();
  const matchedNames: string[] = [];
  const unmatchedNames: string[] = [];
  for (const name of names) {
    const hit = index.get(stemKey(name));
    if (!hit) { unmatchedNames.push(name); continue; }
    matchedNames.push(name);
    hit.forEach((id) => ids.add(id));
  }
  return { itemIds: [...ids], matchedNames, unmatchedNames };
}

/**
 * The stock's runs without the rejected items: their files move from the
 * uploaded list to the failed count, so each record still adds up. Runs of
 * other stocks and untouched runs keep their identity.
 */
export function dropItemsFromBatches(
  batches: readonly StockUploadBatch[], stockId: string, itemIds: ReadonlySet<string>,
): { batches: readonly StockUploadBatch[]; removedFiles: number } {
  let removedFiles = 0;
  const next = batches.map((batch) => {
    if (batch.stockId !== stockId) return batch;
    const files = batch.files.filter((file) => !itemIds.has(file.itemId));
    const removed = batch.files.length - files.length;
    if (removed === 0) return batch;
    removedFiles += removed;
    return { ...batch, files, uploadedCount: files.length, failedCount: batch.failedCount + removed };
  });
  return { batches: removedFiles === 0 ? batches : next, removedFiles };
}
