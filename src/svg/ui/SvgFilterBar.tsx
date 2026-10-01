// ui/SvgFilterBar.tsx — persistent filters, search and stable SVG source sorts.

import type { ReactNode } from "react";
import type { SvgPreferences } from "../prefs";
import type { SvgPreferencePatch } from "./useSvgPreferences";

type Edit = (patch: SvgPreferencePatch, label: string, gesture?: boolean) => boolean;
interface FilterProps { prefs: SvgPreferences; edit: Edit; shown: number; total: number }

export default function SvgFilterBar(props: FilterProps) {
  return (
    <div className="svg-filter-line" aria-label="SVG source filters">
      <SelectFilters prefs={props.prefs} edit={props.edit} />
      <SortDirection prefs={props.prefs} edit={props.edit} />
      <SearchField prefs={props.prefs} edit={props.edit} />
      <span className="svg-result-count">Showing {props.shown} of {props.total} approved sources</span>
      <ClearFilters edit={props.edit} />
    </div>
  );
}

function SelectFilters({ prefs, edit }: Pick<FilterProps, "prefs" | "edit">) {
  return <><GenerationFilter prefs={prefs} edit={edit} /><ReviewFilter prefs={prefs} edit={edit} />
    <SortFilter prefs={prefs} edit={edit} /></>;
}

function GenerationFilter({ prefs, edit }: Pick<FilterProps, "prefs" | "edit">) {
  return <Field label="Generation"><select aria-label="Filter by generation status" value={prefs.generationFilter}
    onChange={(event) => patch(edit, { generationFilter: event.target.value as SvgPreferences["generationFilter"] }, "Filter SVG generation state")}>
    <option value="all">All states</option><option value="pending">Not generated</option><option value="generating">Generating</option>
    <option value="generated">Generated / recovered</option><option value="recoverable">Recoverable temp</option><option value="failed">Failed</option>
    <option value="unknown">Unknown outcome</option><option value="corrupt">Metadata corrupt</option>
  </select></Field>;
}

function ReviewFilter({ prefs, edit }: Pick<FilterProps, "prefs" | "edit">) {
  return <Field label="Review"><select aria-label="Filter by SVG review decision" value={prefs.reviewFilter}
    onChange={(event) => patch(edit, { reviewFilter: event.target.value as SvgPreferences["reviewFilter"] }, "Filter SVG review state")}>
    <option value="all">All reviews</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="declined">Declined</option>
  </select></Field>;
}

function SortFilter({ prefs, edit }: Pick<FilterProps, "prefs" | "edit">) {
  return <Field label="Sort by"><select aria-label="Sort SVG sources" value={prefs.sortBy}
    onChange={(event) => patch(edit, { sortBy: event.target.value as SvgPreferences["sortBy"] }, "Sort SVG sources")}>
    <option value="date">Newest generated</option><option value="name">Filename</option><option value="generation">Generation status</option>
    <option value="review">Review status</option><option value="cost">Request cost</option>
  </select></Field>;
}

function SortDirection({ prefs, edit }: Pick<FilterProps, "prefs" | "edit">) {
  const ascending = prefs.sortDirection === "desc";
  return <button type="button" className="svg-btn" aria-label={`Sort ${ascending ? "ascending" : "descending"}`}
    onClick={() => patch(edit, { sortDirection: ascending ? "asc" : "desc" }, "Change SVG sort direction")}>
    {ascending ? "Newest / Z→A" : "Oldest / A→Z"}
  </button>;
}

function SearchField({ prefs, edit }: Pick<FilterProps, "prefs" | "edit">) {
  return <Field label="Search filename, path, status, version">
    <input type="search" aria-label="Search SVG sources" placeholder="Search approved images…" value={prefs.search}
      onChange={(event) => patch(edit, { search: event.target.value }, "Search SVG sources", true)} />
  </Field>;
}

function ClearFilters({ edit }: Pick<FilterProps, "edit">) {
  return <button type="button" className="svg-btn" onClick={() => patch(edit, {
    generationFilter: "all", reviewFilter: "all", sortBy: "date", sortDirection: "desc", search: "",
  }, "Clear SVG filters")}>× Clear filters</button>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="svg-field"><span>{label}</span>{children}</label>;
}

function patch(edit: Edit, values: SvgPreferencePatch, label: string, gesture = false): void {
  edit(values, label, gesture);
}
