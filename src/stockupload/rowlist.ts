// rowlist.ts — pure filtering, sorting, header state & metadata draft helper.

import { compareNames } from "../lib/scan";
import type { ExportedItem, UploadFormatKey } from "../lib/stockupload/types";
import type { IconMetadata, MetadataValidation } from "../lib/upload/meta";
import { metadataRights } from "../lib/upload/rights";
import { badgesOf, rowMatchesBadges, type RowBadgeState } from "../lib/upload/rowbadge";
import { anyOf, type Multi } from "../lib/multifilter";
import { matchesSearch } from "../lib/textsearch";

export type StockUploadSort = "name" | "path" | "selected";

export interface StockListFilter {
  search: string;
  /** One badge filter or several (lib/multifilter). */
  badge: Multi<string>;
  format: Multi<"all" | UploadFormatKey>;
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

/** Name, folder, title, tags, metadata state and source approval (lib/textsearch). */
function inSearch(item: ExportedItem, query: string): boolean {
  const meta = item.record.metadata;
  return matchesSearch(query, [item.stem, item.exportDir, meta?.title, meta?.tags, meta?.state, item.record.source?.approval]);
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
    inSearch(item, args.filter.search)
    && rowMatchesBadges(badgesOf(args.rowBadges, item.id), args.filter.badge)
    && anyOf(args.filter.format, "all", (w) => hasFormat(item, w as UploadFormatKey)),
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
