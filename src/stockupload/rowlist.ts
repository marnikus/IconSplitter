// rowlist.ts — pure filtering, sorting, header state & metadata draft helper.

import { compareNames } from "../lib/scan";
import type { ExportedItem, UploadFormatKey } from "../lib/stockupload/types";
import type { IconMetadata, MetadataValidation } from "../lib/upload/meta";
import { metadataRights } from "../lib/upload/rights";
import { badgesOf, rowMatchesBadge, type RowBadgeState } from "../lib/upload/rowbadge";

export type StockUploadSort = "name" | "path" | "selected";

export interface StockListFilter {
  search: string;
  badge: string;
  format: "all" | UploadFormatKey;
}

export const ALL_STOCK_FILTER: StockListFilter = {
  search: "",
  badge: "all",
  format: "all",
};

export interface StockMetaDraft {
  metadata: IconMetadata;
  edited: boolean;
  state: "empty" | "accepted" | "invalid";
  validation: MetadataValidation | null;
  detail: string;
}

export function initialMetaDraft(item: ExportedItem): StockMetaDraft {
  const recMeta = item.record.metadata;
  if (recMeta === null) {
    return {
      metadata: { title: "", description: "", tags: [] },
      edited: false,
      state: "empty",
      validation: null,
      detail: "",
    };
  }
  return {
    metadata: {
      title: recMeta.title,
      description: recMeta.description,
      tags: [...recMeta.tags],
      ...metadataRights(recMeta),
    },
    edited: false,
    state: recMeta.state === "accepted" ? "accepted" : "invalid",
    validation: recMeta.validation ?? null,
    detail: "",
  };
}

function hasFormat(item: ExportedItem, fmt: UploadFormatKey): boolean {
  if (fmt === "zip") return item.files.zip !== null || item.files.raster !== null || item.files.svg !== null || item.files.eps !== null;
  return item.files[fmt] !== null;
}

function matchesSearch(item: ExportedItem, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (q === "") return true;
  const title = item.record.metadata?.title ?? "";
  const tags = item.record.metadata?.tags.join(" ") ?? "";
  return `${item.stem} ${item.exportDir} ${title} ${tags}`.toLowerCase().includes(q);
}

export function filterAndSortItems(args: {
  items: readonly ExportedItem[];
  filter: StockListFilter;
  sort: StockUploadSort;
  rowBadges: RowBadgeState;
  checked: readonly string[];
}): ExportedItem[] {
  const checkedSet = new Set(args.checked);
  const filtered = args.items.filter((item) =>
    matchesSearch(item, args.filter.search)
    && rowMatchesBadge(badgesOf(args.rowBadges, item.id), args.filter.badge)
    && (args.filter.format === "all" || hasFormat(item, args.filter.format)),
  );
  return filtered.sort((a, b) => {
    if (args.sort === "selected") {
      const diff = Number(checkedSet.has(b.id)) - Number(checkedSet.has(a.id));
      if (diff !== 0) return diff;
    }
    if (args.sort === "name") return compareNames(a.stem, b.stem) || compareNames(a.recordPath, b.recordPath);
    return compareNames(a.recordPath, b.recordPath) || compareNames(a.stem, b.stem);
  });
}

export function stockHeaderState(visible: readonly ExportedItem[], checked: readonly string[]): "none" | "some" | "all" {
  if (visible.length === 0) return "none";
  const set = new Set(checked);
  const n = visible.filter((r) => set.has(r.id)).length;
  if (n === 0) return "none";
  return n === visible.length ? "all" : "some";
}
