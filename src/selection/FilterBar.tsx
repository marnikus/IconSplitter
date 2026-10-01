// FilterBar.tsx — date mode (all/month/custom range), status, sort, order,
// clear. All controls keyboard-accessible with labels (a11y §11).

import { useState } from "react";
import { ALL_FILTER, monthKey, type ListFilter } from "../lib/reviewfilter";
import { DEFAULT_SORT, type SortState } from "../lib/reviewsort";

export interface FilterBarProps {
  filter: ListFilter;
  sort: SortState;
  shown: number;
  setFilter: (f: ListFilter) => void;
  setSort: (s: SortState) => void;
}

export default function FilterBar(p: FilterBarProps) {
  const [fromStr, setFromStr] = useState("");
  const [toStr, setToStr] = useState("");
  const clear = () => { setFromStr(""); setToStr(""); p.setFilter(ALL_FILTER); p.setSort(DEFAULT_SORT); };
  return (
    <section className="panel space-y-2" data-testid="sel-filterbar">
      <DateRow p={p} fromStr={fromStr} toStr={toStr} setFromStr={setFromStr} setToStr={setToStr} />
      <SortRow p={p} clear={clear} />
    </section>
  );
}

function SortRow({ p, clear }: { p: FilterBarProps; clear: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <SelectBox label="Status" testid="sel-status-filter" value={p.filter.status}
        onChange={(v) => p.setFilter({ ...p.filter, status: v as ListFilter["status"] })}
        options={[["all", "All decisions"], ["pending", "Pending"], ["approved", "Approved"], ["declined", "Declined"], ["missing", "Missing pair"]]} />
      <SelectBox label="Sort by" testid="sel-sort" value={p.sort.by}
        onChange={(v) => p.setSort({ ...p.sort, by: v as SortState["by"] })}
        options={[["date", "Creation date"], ["status", "Review status"], ["name", "Filename"], ["path", "Folder / path"]]} />
      <SelectBox label="Order" testid="sel-dir" value={p.sort.dir}
        onChange={(v) => p.setSort({ ...p.sort, dir: v as SortState["dir"] })}
        options={[["desc", "Newest first"], ["asc", "Oldest first"]]} />
      <button data-testid="sel-clear" className="btn-ghost ml-auto" onClick={clear}>✕ Clear filters</button>
      <span className="text-slate-400" data-testid="sel-shown">Showing {p.shown} pairs</span>
    </div>
  );
}

function SelectBox({ label, testid, value, onChange, options }: {
  label: string; testid: string; value: string;
  onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <label className="flex items-center gap-1 text-slate-400">{label}
      <select data-testid={testid} className="sel-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}

interface DateRowProps {
  p: FilterBarProps;
  fromStr: string;
  toStr: string;
  setFromStr: (s: string) => void;
  setToStr: (s: string) => void;
}

function DateRow({ p, fromStr, toStr, setFromStr, setToStr }: DateRowProps) {
  const mode = p.filter.date.mode;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-400">DATE FILTER</span>
      <ModeBtn active={mode === "all"} label="All" testid="sel-date-all" onClick={() => p.setFilter({ ...p.filter, date: { mode: "all" } })} />
      <ModeBtn active={mode === "month"} label="Month" testid="sel-date-month" onClick={() => p.setFilter({ ...p.filter, date: { mode: "month", month: monthKey(Date.now()) } })} />
      <ModeBtn active={mode === "custom"} label="Custom" testid="sel-date-custom" onClick={() => p.setFilter({ ...p.filter, date: { mode: "custom", from: 0, to: Date.now() } })} />
      {mode === "month" && <MonthInput p={p} />}
      {mode === "custom" && <CustomRange p={p} fromStr={fromStr} toStr={toStr} setFromStr={setFromStr} setToStr={setToStr} />}
    </div>
  );
}

function ModeBtn({ active, label, testid, onClick }: { active: boolean; label: string; testid: string; onClick: () => void }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className={`sel-focus rounded-lg px-3 py-1 ${active ? "bg-indigo-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
      {label}
    </button>
  );
}

function MonthInput({ p }: { p: FilterBarProps }) {
  const month = p.filter.date.mode === "month" ? p.filter.date.month : "";
  return (
    <input data-testid="sel-month" type="month" className="sel-input" value={month}
      onChange={(e) => e.target.value && p.setFilter({ ...p.filter, date: { mode: "month", month: e.target.value } })}
      aria-label="Filter month" />
  );
}

function CustomRange({ p, fromStr, toStr, setFromStr, setToStr }: DateRowProps) {
  return (
    <>
      <label className="text-slate-400">From
        <input data-testid="sel-from" type="datetime-local" className="sel-input" value={fromStr}
          onChange={(e) => { setFromStr(e.target.value); applyRange(p, e.target.value, toStr); }} aria-label="Range from" />
      </label>
      <label className="text-slate-400">To
        <input data-testid="sel-to" type="datetime-local" className="sel-input" value={toStr}
          onChange={(e) => { setToStr(e.target.value); applyRange(p, fromStr, e.target.value); }} aria-label="Range to" />
      </label>
    </>
  );
}

function applyRange(p: FilterBarProps, fromStr: string, toStr: string): void {
  const from = new Date(fromStr).getTime();
  const to = new Date(toStr).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return;
  p.setFilter({ ...p.filter, date: { mode: "custom", from, to } });
}
