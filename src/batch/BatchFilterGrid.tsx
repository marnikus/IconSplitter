// BatchFilterGrid.tsx — V2-style filter bar for Batch folders (date, status, sort, order)
// Reference: src/selectionv2/FilterGrid.tsx (image-1.png). Uses same date modes.

import { useState } from "react";
import { ALL_BATCH_FILTER, monthKey, type BatchFilter } from "../lib/batchfilter";
import { DEFAULT_BATCH_SORT, type BatchSort } from "../lib/batchsort";
import SegButton from "../selectionv2/SegButton";

export interface BatchFilterGridProps {
  filter: BatchFilter;
  sort: BatchSort;
  shown: number;
  setFilter: (f: BatchFilter) => void;
  setSort: (s: BatchSort) => void;
}

interface Range {
  from: string;
  to: string;
}

const RANGE_ALL = { mode: "custom", from: 0, to: Number.MAX_SAFE_INTEGER } as const;

export default function BatchFilterGrid(p: BatchFilterGridProps) {
  const [range, setRange] = useState<Range>({ from: "", to: "" });
  const clear = () => {
    setRange({ from: "", to: "" });
    p.setFilter(ALL_BATCH_FILTER);
    p.setSort(DEFAULT_BATCH_SORT);
  };
  return (
    <div className="v2-toolbar v2-filters" data-testid="batch-filters">
      <Field label="Date filter"><DateTabs p={p} /></Field>
      <FromField p={p} range={range} setRange={setRange} />
      <ToField p={p} range={range} setRange={setRange} />
      <SelectField label="Status" testid="batch-status" value={p.filter.status}
        onChange={(v) => p.setFilter({ ...p.filter, status: v as BatchFilter["status"] })}
        options={[["all", "All statuses"], ["unprocessed", "Unprocessed"], ["processed", "Processed"], ["skipped", "Skipped"], ["changed", "Changed"], ["missing", "Missing"], ["deleted", "Deleted"]]} />
      <SelectField label="Sort by" testid="batch-sort" value={p.sort.by}
        onChange={(v) => p.setSort({ ...p.sort, by: v as BatchSort["by"] })}
        options={[["date", "Created date"], ["name", "Filename"], ["path", "Folder / path"], ["status", "Review status"]]} />
      <SelectField label="Order" testid="batch-dir" value={p.sort.dir}
        onChange={(v) => p.setSort({ ...p.sort, dir: v as BatchSort["dir"] })}
        options={[["desc", "Newest first"], ["asc", "Oldest first"]]} />
      <p className="v2-result-copy" data-testid="batch-shown">Showing {p.shown} {p.shown === 1 ? "image" : "images"}</p>
      <button type="button" className="v2-btn ghost" data-testid="batch-clear" onClick={clear}>× Clear filters</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="v2-field">
      <span className="v2-label">{label}</span>
      {children}
    </label>
  );
}

function DateTabs({ p }: { p: BatchFilterGridProps }) {
  const mode = p.filter.date.mode;
  const set = (date: BatchFilter["date"]) => p.setFilter({ ...p.filter, date });
  return (
    <div className="v2-date-tabs" role="group" aria-label="Date filter">
      <SegButton active={mode === "all"} label="All" testid="batch-date-all" onClick={() => set({ mode: "all" })} />
      <SegButton active={mode === "month"} label="Month" testid="batch-date-month" onClick={() => set({ mode: "month", month: monthKey(Date.now()) })} />
      <SegButton active={mode === "custom"} label="Range" testid="batch-date-range" onClick={() => set(RANGE_ALL)} />
    </div>
  );
}

interface RangeProps {
  p: BatchFilterGridProps;
  range: Range;
  setRange: (r: Range) => void;
}

function FromField({ p, range, setRange }: RangeProps) {
  const month = p.filter.date.mode === "month";
  return (
    <Field label={month ? "Month" : "From"}>
      <input className="v2-input" data-testid="batch-from" type={month ? "month" : "datetime-local"}
        disabled={p.filter.date.mode === "all"} aria-label={month ? "Filter month" : "Range from"}
        value={month ? monthValue(p.filter) : range.from}
        onChange={(e) => {
          if (month) return p.setFilter({ ...p.filter, date: { mode: "month", month: e.target.value || monthKey(Date.now()) } });
          const next = { ...range, from: e.target.value };
          setRange(next);
          applyRange(p, next);
        }} />
    </Field>
  );
}

function ToField({ p, range, setRange }: RangeProps) {
  const off = p.filter.date.mode !== "custom";
  return (
    <Field label="To">
      <input className="v2-input" data-testid="batch-to" type="datetime-local" disabled={off} aria-label="Range to"
        value={range.to}
        onChange={(e) => {
          const next = { ...range, to: e.target.value };
          setRange(next);
          applyRange(p, next);
        }} />
    </Field>
  );
}

function monthValue(f: BatchFilter): string {
  return f.date.mode === "month" ? f.date.month : "";
}

function applyRange(p: BatchFilterGridProps, r: Range): void {
  const from = toMs(r.from, 0);
  const to = toMs(r.to, Number.MAX_SAFE_INTEGER);
  p.setFilter({ ...p.filter, date: { mode: "custom", from, to } });
}

function toMs(value: string, fallback: number): number {
  if (!value) return fallback;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? fallback : t;
}

function SelectField({ label, testid, value, onChange, options }: { label: string; testid: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <Field label={label}>
      <select className="v2-input" data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </Field>
  );
}
