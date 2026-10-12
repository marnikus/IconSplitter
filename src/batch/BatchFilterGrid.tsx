// BatchFilterGrid.tsx — V2-style filter bar for Batch folders, refactored into small components

import { useState } from "react";
import { ALL_BATCH_FILTER, type BatchFilter } from "../lib/batchfilter";
import { DEFAULT_BATCH_SORT, type BatchSort } from "../lib/batchsort";
import Field from "./filter/Field";
import SelectField from "./filter/SelectField";
import DateTabs from "./filter/DateTabs";
import FromField from "./filter/FromField";
import ToField from "./filter/ToField";
import type { Range } from "./filter/useRange";

export interface BatchFilterGridProps {
  filter: BatchFilter;
  sort: BatchSort;
  shown: number;
  setFilter: (f: BatchFilter) => void;
  setSort: (s: BatchSort) => void;
}

const STATUS_OPTS: [string, string][] = [
  ["all", "All statuses"],
  ["unprocessed", "Unprocessed"],
  ["processed", "Processed"],
  ["skipped", "Skipped"],
  ["changed", "Changed"],
  ["missing", "Missing"],
  ["deleted", "Deleted"],
];
const SORT_OPTS: [string, string][] = [
  ["date", "Created date"],
  ["name", "Filename"],
  ["path", "Folder / path"],
  ["status", "Review status"],
];
const DIR_OPTS: [string, string][] = [
  ["desc", "Newest first"],
  ["asc", "Oldest first"],
];

function useRangeState() {
  const [range, setRange] = useState<Range>({ from: "", to: "" });
  const clearRange = () => setRange({ from: "", to: "" });
  return { range, setRange, clearRange };
}

function Filters({ p, range, setRange }: { p: BatchFilterGridProps; range: Range; setRange: (r: Range) => void }) {
  return (
    <>
      <Field label="Date filter">
        <DateTabs p={p} />
      </Field>
      <FromField p={p} range={range} setRange={setRange} />
      <ToField p={p} range={range} setRange={setRange} />
      <SelectField label="Status" testid="batch-status" value={p.filter.status} onChange={(v) => p.setFilter({ ...p.filter, status: v as any })} options={STATUS_OPTS} />
      <SelectField label="Sort by" testid="batch-sort" value={p.sort.by} onChange={(v) => p.setSort({ ...p.sort, by: v as any })} options={SORT_OPTS} />
      <SelectField label="Order" testid="batch-dir" value={p.sort.dir} onChange={(v) => p.setSort({ ...p.sort, dir: v as any })} options={DIR_OPTS} />
    </>
  );
}

export default function BatchFilterGrid(p: BatchFilterGridProps) {
  const { range, setRange, clearRange } = useRangeState();
  const clear = () => {
    clearRange();
    p.setFilter(ALL_BATCH_FILTER);
    p.setSort(DEFAULT_BATCH_SORT);
  };
  return (
    <div className="v2-toolbar v2-filters" data-testid="batch-filters">
      <Filters p={p} range={range} setRange={setRange} />
      <p className="v2-result-copy" data-testid="batch-shown">
        Showing {p.shown} {p.shown === 1 ? "image" : "images"}
      </p>
      <button type="button" className="v2-btn ghost" data-testid="batch-clear" onClick={clear}>
        × Clear filters
      </button>
    </div>
  );
}
