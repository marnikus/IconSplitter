// listview.ts — Generate SVG's remembered list view (2026-11-06): generation
// and review filters (one value or several), the search text, the sort and its
// direction, restored after a reload and validated on read (RULE 13).

import { isRecord } from "../lib/isrecord";
import { parseMulti } from "../lib/multifilter";
import { ALL_SVG_FILTER, naturalDir, type GenFilter, type SvgDir, type SvgListFilter, type SvgSort } from "../lib/svglist";
import { REVIEW_STATUSES } from "../lib/svgmodel";
import { LIST_VIEW_KEYS, loadListView } from "../state/listviewstore";

export interface SvgListView { filter: SvgListFilter; sort: SvgSort; sortDir: SvgDir }

const GENS: GenFilter[] = ["all", "not-generated", "generating", "generated", "failed", "unknown"];
const SORTS: SvgSort[] = ["date", "name", "generation", "review", "cost", "svg-created", "ai-created", "selected", "unselected", "unapproved", "approved"];
const DEFAULT_SORT: SvgSort = "date";

export function parseSvgListView(raw: unknown): SvgListView {
  const v = isRecord(raw) ? raw : {};
  const f = isRecord(v.filter) ? v.filter : {};
  const sort = SORTS.includes(v.sort as SvgSort) ? (v.sort as SvgSort) : DEFAULT_SORT;
  return {
    filter: {
      generation: parseMulti(f.generation, GENS, "all"),
      review: parseMulti(f.review, ["all", ...REVIEW_STATUSES], "all"),
      search: typeof f.search === "string" ? f.search : ALL_SVG_FILTER.search,
    },
    sort,
    sortDir: v.sortDir === "asc" || v.sortDir === "desc" ? v.sortDir : naturalDir(sort),
  };
}

export const loadSvgListView = (): SvgListView => loadListView(LIST_VIEW_KEYS.svg, parseSvgListView);
