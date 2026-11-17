// getdata.ts — the "Get data" list (2026-11-10), the same for every tab. For the
// selected rows the user ticks what to copy: the SVG file name, the PNG file
// name (separate choices), the status (generation, review …) and the file path.
// The result is a list of info separated with commas: ONE choice gives one line
// of comma-separated values (handy to paste elsewhere); several choices give one
// line per row, that row's chosen info separated with commas. A value holding a
// comma, a quote or a line break is quoted like CSV so the list still parses.
// Pure: each tab maps its rows to DataRow; nothing here reads a file.

export interface DataFile { name: string; path: string }

/** What any tab can tell about one row. A missing file is null; a missing status is []. */
export interface DataRow {
  svg: DataFile | null;
  png: DataFile | null;
  /** Generation, review … in the order the row shows them. */
  status: readonly string[];
}

export type DataField = "svg" | "png" | "status" | "path";

/** A file as the list wants it: its name is the last part of the path; "" is no file. */
export function fileOf(path: string): DataFile | null {
  return path === "" ? null : { name: path.slice(path.lastIndexOf("/") + 1), path };
}

/** The dialog's checkboxes, in the order the values come out. */
export const DATA_FIELDS: readonly { id: DataField; label: string }[] = [
  { id: "svg", label: "SVG file name" },
  { id: "png", label: "PNG file name" },
  { id: "status", label: "Status (generation, review …)" },
  { id: "path", label: "File path" },
];

const NEEDS_QUOTES = /[",\n\r]/;
const quoted = (v: string): string => (NEEDS_QUOTES.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The paths of the ticked names (both when both are ticked); with no name ticked, the row's main file: SVG, else PNG. */
function pathsOf(row: DataRow, on: ReadonlySet<DataField>): string[] {
  const named = on.has("svg") || on.has("png");
  const files = named ? [on.has("svg") ? row.svg : null, on.has("png") ? row.png : null] : [row.svg ?? row.png];
  return [...new Set(files.flatMap((f) => (f === null ? [] : [f.path])).filter((p) => p !== ""))];
}

/** One row's chosen info, in the dialog's order, without the empty ones. */
function valuesOf(row: DataRow, on: ReadonlySet<DataField>): string[] {
  const out: string[] = [];
  if (on.has("svg")) out.push(row.svg?.name ?? "");
  if (on.has("png")) out.push(row.png?.name ?? "");
  if (on.has("status")) out.push(row.status.filter((s) => s !== "").join(" · "));
  if (on.has("path")) out.push(...pathsOf(row, on));
  return out.filter((v) => v !== "").map(quoted);
}

/** The rows that have something for the chosen info, as their values. */
function entriesOf(rows: readonly DataRow[], fields: readonly DataField[]): string[][] {
  const on = new Set(fields);
  return rows.map((r) => valuesOf(r, on)).filter((v) => v.length > 0);
}

/** How many rows the list holds. */
export function countData(rows: readonly DataRow[], fields: readonly DataField[]): number {
  return entriesOf(rows, fields).length;
}

/** The list to copy: one line for one choice, one line per row for several. */
export function formatData(rows: readonly DataRow[], fields: readonly DataField[]): string {
  const entries = entriesOf(rows, fields);
  return fields.length === 1 ? entries.flat().join(", ") : entries.map((v) => v.join(", ")).join("\n");
}
