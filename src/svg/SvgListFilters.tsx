// SvgListFilters.tsx — the list's own controls: what to show, in which order, and
// the ONE direction arrow (2026-11-02). Split out of SvgControls so the order
// rules (including the two created-times) are not buried in the provider card,
// and so the arrow the user flips applies to whichever order and filter is in
// force rather than to one hard-wired default.
import { Select } from "../ui/fields";
import { STATE_SORT_OPTIONS } from "../lib/statesort";
import { sortDirOf, type SvgDir, type SvgListFilter, type SvgSort } from "../lib/svglist";

/** Every order the list offers: files, time, cost, status and the two groups. */
const SORT_OPTIONS: [SvgSort, string][] = [
  ["date", "Newest generated"],
  ["svg-created", "SVG created (file time)"],
  ["ai-created", "AI source created"],
  ["name", "Filename"],
  ["generation", "Generation status"],
  ["review", "Review status"],
  ["cost", "Cost"],
  ...STATE_SORT_OPTIONS,
];

/**
 * The one direction arrow: it reverses whichever order is in force, before or
 * after a filter, so the user never has to guess what "descending" means for a
 * sort. The label says it out loud and the arrow shows it.
 */
function SortDirection({ dir, onDir }: { dir: SvgDir; onDir: (d: SvgDir) => void }) {
  const next: SvgDir = dir === "asc" ? "desc" : "asc";
  return (
    <button type="button" className="svg-btn" data-testid="svg-sort-dir" data-dir={dir}
      aria-label={`Sort direction: ${dir === "asc" ? "ascending" : "descending"} — click for ${next === "asc" ? "ascending" : "descending"}`}
      title={`Sort direction: ${dir === "asc" ? "ascending (A→Z, oldest, lowest)" : "descending (Z→A, newest, highest)"}`}
      onClick={() => onDir(next)}>
      {dir === "asc" ? "↑ Ascending" : "↓ Descending"}
    </button>
  );
}

export default function SvgListFilters({ filter, sort, sortDir, shown, total, onFilter, onSort, onSortDir, onClear }: {
  filter: SvgListFilter; sort: SvgSort; sortDir: SvgDir; shown: number; total: number;
  onFilter: (patch: Partial<SvgListFilter>) => void; onSort: (s: SvgSort) => void;
  onSortDir: (d: SvgDir) => void; onClear: () => void;
}) {
  const dir = sortDirOf(sort, sortDir);
  return (
    <div className="svg-filters">
      <Select label="Generation" testid="svg-filter-generation" value={filter.generation}
        options={[["all", "All states"], ["not-generated", "Not generated"], ["generating", "Generating"], ["generated", "Generated"], ["failed", "Failed"]]}
        onChange={(v) => onFilter({ generation: v as SvgListFilter["generation"] })} />
      <Select label="Review" testid="svg-filter-review" value={filter.review}
        options={[["all", "All reviews"], ["pending", "Pending"], ["approved", "Approved"], ["declined", "Declined"], ["needs-review", "Regenerated — new review"]]}
        onChange={(v) => onFilter({ review: v as SvgListFilter["review"] })} />
      <Select label="Sort by" testid="svg-sort" value={sort}
        options={SORT_OPTIONS}
        onChange={(v) => onSort(v as SvgSort)} />
      <SortDirection dir={dir} onDir={onSortDir} />
      <label className="svg-field">
        <span className="svg-label">Search</span>
        <input className="svg-input" data-testid="svg-search" type="search" aria-label="Search sources"
          placeholder="Filename, folder, version or status…" value={filter.search}
          onChange={(e) => onFilter({ search: e.target.value })} />
      </label>
      <span className="svg-result-copy" data-testid="svg-shown">Showing {shown} of {total}</span>
      <button type="button" className="svg-btn" data-testid="svg-clear-filters" onClick={onClear}>× Clear filters</button>
    </div>
  );
}


