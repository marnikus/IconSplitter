// metadatagate.ts — the Upload tab never sends a row with empty metadata
// (2026-11-12). A row without a title, a description or a single keyword would
// reach Getty as a card that never turns "Ready to submit"; it is left out of
// the run instead, and the confirmation names how many were left out.

import type { StockUploadPlan } from "./plan";
import type { ExportedItem } from "./types";

/** A checked row left out of the run because its metadata is empty. */
export interface SkippedNoMetadata {
  itemId: string;
  stem: string;
}

export const NO_METADATA_ERROR =
  "None of the selected rows has metadata (title, description and keywords) — fill it in before uploading.";

const filled = (value: unknown) => typeof value === "string" && value.trim() !== "";

/** True when the row carries a title, a description and at least one keyword. */
export function hasUploadMetadata(item: ExportedItem): boolean {
  const meta = item.record?.metadata ?? null;
  if (meta === null) return false;
  const tags = Array.isArray(meta.tags) ? meta.tags.filter(filled) : [];
  return filled(meta.title) && filled(meta.description) && tags.length > 0;
}

/** The checked rows that may be uploaded, and the ones left out for empty metadata. */
export function splitByMetadata(
  items: readonly ExportedItem[], checkedIds: readonly string[],
): { uploadable: string[]; skipped: SkippedNoMetadata[] } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const uploadable: string[] = [];
  const skipped: SkippedNoMetadata[] = [];
  for (const id of checkedIds) {
    const item = byId.get(id);
    if (item === undefined) continue;
    if (hasUploadMetadata(item)) uploadable.push(id);
    else skipped.push({ itemId: id, stem: item.stem });
  }
  return { uploadable, skipped };
}

/** The plan with its left-out rows named; a run of only blank rows may not start. */
export function withSkippedNoMetadata(plan: StockUploadPlan, skipped: readonly SkippedNoMetadata[]): StockUploadPlan {
  if (skipped.length === 0) return plan;
  const onlyBlank = plan.selectedRows.length === 0;
  return {
    ...plan,
    skippedNoMetadata: [...skipped],
    preflightErrors: onlyBlank ? [NO_METADATA_ERROR] : plan.preflightErrors,
  };
}
