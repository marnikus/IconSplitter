// Binary review-list grouping. Stable ties retain the caller's base ordering.
export type StateSort = "selected" | "unselected" | "unapproved" | "approved";
export const STATE_SORT_OPTIONS: [StateSort, string][] = [
  ["selected", "Selected first"], ["unselected", "Not selected first"],
  ["unapproved", "Not approved first"], ["approved", "Approved first"],
];

export function isStateSort(sort: string): sort is StateSort {
  return STATE_SORT_OPTIONS.some(([value]) => value === sort);
}

export function isSelectionSort(sort: string): boolean {
  return sort === "selected" || sort === "unselected";
}

export function sortByFlag<T>(rows: readonly T[], flag: (row: T) => boolean, trueFirst: boolean): T[] {
  const sign = trueFirst ? -1 : 1;
  return [...rows].sort((a, b) => sign * (Number(flag(a)) - Number(flag(b))));
}

/** Existing two-control tabs keep direction, with honest state-group labels. */
export function stateOrderOptions(by: string): [string, string][] {
  if (by === "selected") return [["asc", "Not selected first"], ["desc", "Selected first"]];
  if (by === "approval") return [["asc", "Not approved first"], ["desc", "Approved first"]];
  return [["desc", "Newest first"], ["asc", "Oldest first"]];
}
