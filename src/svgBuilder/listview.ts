// listview.ts — the library's own validated search/category/sort view state.
import { isRecord } from "../lib/isrecord";
import type { BuilderListView } from "../lib/svgBuilder/types";
import { LIST_VIEW_KEYS, loadListView, saveListView, useSaveListView } from "../state/listviewstore";

export const BUILDER_LIST_VIEW_KEY = LIST_VIEW_KEYS.builder;

export const DEFAULT_BUILDER_LIST_VIEW: BuilderListView = { query: "", category: "All", sort: "name" };

export function parseBuilderListView(raw: unknown): BuilderListView {
  if (!isRecord(raw)) return { ...DEFAULT_BUILDER_LIST_VIEW };
  return {
    query: typeof raw.query === "string" ? raw.query.slice(0, 120) : "",
    category: typeof raw.category === "string" ? raw.category.slice(0, 80) : "All",
    sort: raw.sort === "category" ? "category" : "name",
  };
}

export function loadBuilderListView(): BuilderListView {
  return loadListView(BUILDER_LIST_VIEW_KEY, parseBuilderListView);
}

export function saveBuilderListView(view: BuilderListView): void {
  saveListView(BUILDER_LIST_VIEW_KEY, parseBuilderListView(view));
}

export function useSaveBuilderListView(view: BuilderListView): void {
  useSaveListView(BUILDER_LIST_VIEW_KEY, parseBuilderListView(view));
}
