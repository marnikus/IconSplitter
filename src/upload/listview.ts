// listview.ts — SVG to upload's remembered list view (2026-11-06): package,
// metadata and badge filters (one value or several), the search text and the
// sort, restored after a reload and validated on read (RULE 13).

import { isRecord } from "../lib/isrecord";
import { parseAnyMulti, parseMulti } from "../lib/multifilter";
import { LIST_VIEW_KEYS, loadListView } from "../state/listviewstore";
import type { UploadListFilter, UploadMetaFilter, UploadSort, UploadStatusFilter } from "./types";

export interface UploadListView { filter: UploadListFilter; sort: UploadSort }

const STATUSES: UploadStatusFilter[] = ["all", "processed", "partial", "failed", "cancelled", "stale", "not-exported"];
const METAS: UploadMetaFilter[] = ["all", "empty", "pending", "generated", "invalid", "accepted", "interrupted"];
const SORTS: UploadSort[] = ["name", "status", "metadata", "selected", "unselected", "unapproved", "approved"];

export function parseUploadListView(raw: unknown): UploadListView {
  const v = isRecord(raw) ? raw : {};
  const f = isRecord(v.filter) ? v.filter : {};
  return {
    filter: {
      status: parseMulti(f.status, STATUSES, "all"),
      metadata: parseMulti(f.metadata, METAS, "all"),
      badge: parseAnyMulti(f.badge, "all"),
      search: typeof f.search === "string" ? f.search : "",
    },
    sort: SORTS.includes(v.sort as UploadSort) ? (v.sort as UploadSort) : "name",
  };
}

export const loadUploadListView = (): UploadListView => loadListView(LIST_VIEW_KEYS.upload, parseUploadListView);
