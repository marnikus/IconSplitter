// FilterGrid.tsx — V2 control row two (spec V2 §8/§9): date mode tabs with
// From/To, decision status, missing-pair filter, sort field + order, the
// visible count and a one-click clear. Every control is a labelled field.

import { useState } from "react";
import { ALL_FILTER, monthKey, type DateFilter, type ListFilter } from "../lib/reviewfilter";
import { DEFAULT_SORT, type SortState } from "../lib/reviewsort";
import SegButton from "./SegButton";

export interface FilterGridProps {
  filter: ListFilter;
  sort: SortState;
  shown: number;
  setFilter: (f: ListFilter) => void;
  setSort: (s: SortState) => void;
}

interface Range {
  from: string;
  to: string;
}

const RANGE_ALL: DateFilter = { mode: "custom", from: 0, to: Number.MAX_SAFE_INTEGER };

export default function FilterGrid(p: FilterGridProps) {
  const [range, setRange] = useState<Range>({ from: "", to: "" });
  const clear = () => {
    setRange({ from: "", to: "" });
    p.setFilter(ALL_FILTER);
    p.setSort(DEFAULT_SORT);
  };
  return (
    <div className="v2-toolbar v2-filters" data-testid="v2-filters">
      <Field label="Date filter"><DateTabs p={p} /></Field>
      <FromField p={p} range={range} setRange={setRange} />
      <ToField p={p} range={range} setRange={setRange} />
      <SelectField label="Status" testid="v2-status" value={p.filter.status}
        onChange={(v) => p.setFilter({ ...p.filter, status: v as ListFilter["status"] })}
        options={[["all", "All statuses"], ["pending", "Pending"], ["approved", "Approved"], ["declined", "Declined"]]} />
      <SelectField label="Pairing" testid="v2-pairing" value={p.filter.pairing}
        onChange={(v) => p.setFilter({ ...p.filter, pairing: v as ListFilter["pairing"] })}
        options={[["all", "All pairs"], ["complete", "Complete pairs"], ["incomplete", "Missing pair"]]} />
      <SelectField label="Sort by" testid="v2-sort" value={p.sort.by}
        onChange={(v) => p.setSort({ ...p.sort, by: v as SortState["by"] })}
        options={[["date", "Created date"], ["status", "Review status"], ["name", "Filename"], ["path", "Folder / path"]]} />
      <SelectField label="Order" testid="v2-dir" value={p.sort.dir}
        onChange={(v) => p.setSort({ ...p.sort, dir: v as SortState["dir"] })}
        options={[["desc", "Newest first"], ["asc", "Oldest first"]]} />
      <p className="v2-result-copy" data-testid="v2-shown">Showing {p.shown} {plural(p.shown, "pair")}</p>
      <button type="button" className="v2-btn ghost" data-testid="v2-clear" onClick={clear}>× Clear filters</button>
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${word}${n === 1 ? "" : "s"}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="v2-field">
      <span className="v2-label">{label}</span>
      {children}
    </label>
  );
}

function DateTabs({ p }: { p: FilterGridProps }) {
  const mode = p.filter.date.mode;
  const set = (date: DateFilter) => p.setFilter({ ...p.filter, date });
  return (
    <div className="v2-date-tabs" role="group" aria-label="Date filter">
      <SegButton active={mode === "all"} label="All" testid="v2-date-all" onClick={() => set({ mode: "all" })} />
      <SegButton active={mode === "month"} label="Month" testid="v2-date-month"
        onClick={() => set({ mode: "month", month: monthKey(Date.now()) })} />
      <SegButton active={mode === "custom"} label="Range" testid="v2-date-range" onClick={() => set(RANGE_ALL)} />
    </div>
  );
}

interface RangeProps {
  p: FilterGridProps;
  range: Range;
  setRange: (r: Range) => void;
}

function FromField({ p, range, setRange }: RangeProps) {
  const month = p.filter.date.mode === "month";
  return (
    <Field label={month ? "Month" : "From"}>
      <input className="v2-input" data-testid="v2-from" type={month ? "month" : "datetime-local"}
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
      <input className="v2-input" data-testid="v2-to" type="datetime-local" disabled={off} aria-label="Range to"
        value={range.to}
        onChange={(e) => {
          const next = { ...range, to: e.target.value };
          setRange(next);
          applyRange(p, next);
        }} />
    </Field>
  );
}

function monthValue(f: ListFilter): string {
  return f.date.mode === "month" ? f.date.month : "";
}

/** One-sided ranges are allowed: an empty side means "unbounded". */
function applyRange(p: FilterGridProps, r: Range): void {
  const from = toMs(r.from, 0);
  const to = toMs(r.to, Number.MAX_SAFE_INTEGER);
  p.setFilter({ ...p.filter, date: { mode: "custom", from, to } });
}

function toMs(value: string, fallback: number): number {
  if (!value) return fallback;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? fallback : t;
}

function SelectField({ label, testid, value, onChange, options }: {
  label: string; testid: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <Field label={label}>
      <select className="v2-input" data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </Field>
  );
}
