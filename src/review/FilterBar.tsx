// FilterBar.tsx — date filter (all / month / custom From–To), status filter,
// sort key and order, the "showing N pairs" figure and Clear filters
// (spec §3, §4; design filter row).

import { useEffect, useRef } from "react";
import {
  dataRange, filtersCleared, sortDirLabels,
  type QueryPatch, type ReviewQuery, type ScopeMode, type SortKey, type StatusFilter,
} from "../lib/reviewquery";
import type { ReviewItem } from "../lib/reviewmerge";
import { stampForInput } from "../lib/reviewformat";
import type { ReviewApi } from "./api";

const SCOPES: { key: ScopeMode; label: string }[] = [
  { key: "all", label: "All" },
  { key: "month", label: "Month" },
  { key: "range", label: "Custom" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Creation date" },
  { key: "status", label: "Review status" },
  { key: "name", label: "Filename" },
  { key: "path", label: "Folder / path" },
];

const STATUSES: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All decisions" },
  { key: "pending", label: "Pending only" },
  { key: "approved", label: "Approved only" },
  { key: "declined", label: "Declined only" },
];

const FIELD = "rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 disabled:opacity-50";

export default function FilterBar({ r, items, shown }: { r: ReviewApi; items: ReviewItem[]; shown: number }) {
  const { query } = r.s;
  usePrefillRange(query, items, r.patch);
  const order = sortDirLabels(query.sort.key);
  return (
    <section className="panel flex flex-wrap items-end gap-3" data-testid="review-filters" aria-label="Filters and sorting">
      <ScopePicker mode={query.scope.mode} patch={r.patch} />
      <DateInputs query={query} patch={r.patch} />
      <Select label="STATUS" testid="filter-status" value={query.status}
        options={STATUSES.map((s) => [s.key, s.label])} onChange={(status) => r.patch({ status: status as StatusFilter })} />
      <Select label="SORT BY" testid="sort-key" value={query.sort.key}
        options={SORTS.map((s) => [s.key, s.label])} onChange={(key) => r.patch({ sort: { key: key as SortKey } })} hint="date / status / name / path" />
      <Select label="ORDER" testid="sort-dir" value={query.sort.dir}
        options={[["desc", order.desc], ["asc", order.asc]]} onChange={(dir) => r.patch({ sort: { dir: dir as "asc" | "desc" } })} />
      <p className="ml-auto text-xs text-slate-400" data-testid="review-showing">Showing {shown} pairs</p>
      <button type="button" data-testid="filters-clear" className="btn-ghost" disabled={filtersCleared(query)} onClick={r.clearFilters}>
        ✕ Clear filters
      </button>
    </section>
  );
}

/** Switching to Custom fills empty From/To with the range the data actually has. */
function usePrefillRange(query: ReviewQuery, items: ReviewItem[], patch: (p: QueryPatch) => void): void {
  const prefill = useRef(false);
  useEffect(() => {
    if (query.scope.mode !== "range" || prefill.current) return;
    prefill.current = true;
    const range = dataRange(items);
    if (!range || query.scope.from || query.scope.to) return;
    patch({ scope: { from: stampForInput(range.from), to: stampForInput(range.to) } });
  }, [query.scope, items, patch]);
}

function ScopePicker({ mode, patch }: { mode: ScopeMode; patch: (p: QueryPatch) => void }) {
  return (
    <fieldset className="text-xs text-slate-400">
      <legend className="mb-1 tracking-wide">DATE FILTER</legend>
      <div className="flex overflow-hidden rounded-lg border border-white/10">
        {SCOPES.map((scope) => (
          <button
            key={scope.key}
            type="button"
            data-testid={`scope-${scope.key}`}
            aria-pressed={mode === scope.key}
            onClick={() => patch({ scope: { mode: scope.key } })}
            className={`px-3 py-1.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none ${
              mode === scope.key ? "bg-indigo-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {scope.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function DateInputs({ query, patch }: { query: ReviewQuery; patch: (p: QueryPatch) => void }) {
  const custom = query.scope.mode === "range";
  if (query.scope.mode === "month") {
    return <Field id="filter-month" type="month" label="MONTH" value={query.scope.month} disabled={false}
      onChange={(month) => patch({ scope: { month } })} />;
  }
  return (
    <>
      <Field id="filter-from" type="datetime-local" label="FROM" value={query.scope.from} disabled={!custom}
        onChange={(from) => patch({ scope: { from } })} />
      <Field id="filter-to" type="datetime-local" label="TO" value={query.scope.to} disabled={!custom}
        onChange={(to) => patch({ scope: { to } })} />
    </>
  );
}

function Field({ id, type, label, value, disabled, onChange }: {
  id: string; type: string; label: string; value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-slate-400">
      <span className="mb-1 block tracking-wide">{label}</span>
      <input id={id} data-testid={id} type={type} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} className={`${FIELD} block`} />
    </label>
  );
}

function Select({ label, testid, value, options, hint, onChange }: {
  label: string; testid: string; value: string; options: [string, string][]; hint?: string; onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-slate-400">
      <span className="mb-1 block tracking-wide">
        {label}{hint && <span className="ml-1 text-slate-500">: {hint}</span>}
      </span>
      <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} className={`${FIELD} block`}>
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}
