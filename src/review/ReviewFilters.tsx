// ReviewFilters.tsx — view / month / custom-range filters, the sort key and the
// sort direction (spec §3, §4). Every control is labelled, keyboard reachable
// and clearable; the pieces stay small so each control owns one decision.

import { filtersCleared, type QueryPatch, type ReviewQuery, type ScopeMode, type SortKey } from "../lib/reviewquery";

export interface ReviewFiltersProps {
  query: ReviewQuery;
  patch: (patch: QueryPatch) => void;
  clear: () => void;
}

const SCOPES: { key: ScopeMode; label: string }[] = [
  { key: "all", label: "All images" },
  { key: "month", label: "Month" },
  { key: "range", label: "Custom range" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Creation date" },
  { key: "status", label: "Review status" },
  { key: "name", label: "Filename" },
  { key: "path", label: "Folder / path" },
];

const FIELD_CLS = "mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-slate-100";

export default function ReviewFilters({ query, patch, clear }: ReviewFiltersProps) {
  return (
    <section className="panel space-y-3" data-testid="review-filters" aria-label="Filters and sorting">
      <ScopeButtons mode={query.scope.mode} patch={patch} />
      <RangeInputs query={query} patch={patch} />
      <SortControls sort={query.sort} patch={patch} />
      <button type="button" data-testid="filters-clear" className="btn-ghost w-full" disabled={filtersCleared(query)} onClick={clear}>
        ✕ Clear filters
      </button>
    </section>
  );
}

function ScopeButtons({ mode, patch }: { mode: ScopeMode; patch: (patch: QueryPatch) => void }) {
  return (
    <div role="group" aria-label="Date filter" className="flex flex-wrap gap-1">
      {SCOPES.map((scope) => (
        <button
          key={scope.key}
          type="button"
          data-testid={`scope-${scope.key}`}
          aria-pressed={mode === scope.key}
          onClick={() => patch({ scope: { mode: scope.key } })}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none ${
            mode === scope.key ? "bg-indigo-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          {scope.label}
        </button>
      ))}
    </div>
  );
}

function RangeInputs({ query, patch }: { query: ReviewQuery; patch: (patch: QueryPatch) => void }) {
  if (query.scope.mode === "month") {
    return <Field id="filter-month" type="month" label="Month" value={query.scope.month} onChange={(month) => patch({ scope: { month } })} />;
  }
  if (query.scope.mode !== "range") return null;
  return (
    <div className="space-y-2">
      <Field id="filter-from" type="datetime-local" label="From" value={query.scope.from} onChange={(from) => patch({ scope: { from } })} />
      <Field id="filter-to" type="datetime-local" label="To" value={query.scope.to} onChange={(to) => patch({ scope: { to } })} />
    </div>
  );
}

function SortControls({ sort, patch }: { sort: ReviewQuery["sort"]; patch: (patch: QueryPatch) => void }) {
  const ascending = sort.dir === "asc";
  return (
    <div className="space-y-2">
      <label className="block text-xs text-slate-400">
        Sort by
        <select data-testid="sort-key" value={sort.key} onChange={(e) => patch({ sort: { key: e.target.value as SortKey } })} className={FIELD_CLS}>
          {SORTS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </label>
      <button
        type="button"
        data-testid="sort-dir"
        aria-label={`Sort direction: ${ascending ? "ascending" : "descending"}`}
        aria-pressed={ascending}
        onClick={() => patch({ sort: { dir: ascending ? "desc" : "asc" } })}
        className="btn-ghost w-full"
      >
        {ascending ? "↑ Ascending" : "↓ Descending"}
      </button>
    </div>
  );
}

function Field({ id, type, label, value, onChange }: { id: string; type: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs text-slate-400" htmlFor={id}>
      {label}
      <input id={id} data-testid={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_CLS} />
    </label>
  );
}
