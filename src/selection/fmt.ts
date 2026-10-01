// fmt.ts — tiny presentational formatters for Selection review (pure).

/** "Oct 01 · 08:32" — list rows. */
export function fmtShort(ts: number): string {
  const d = new Date(ts);
  const mon = d.toLocaleString("en", { month: "short" });
  return `${mon} ${String(d.getDate()).padStart(2, "0")} · ${hhmm(d)}`;
}

/** "Oct 01, 2026 at 08:32:14" — discovery footer. */
export function fmtLong(ts: number): string {
  const d = new Date(ts);
  const mon = d.toLocaleString("en", { month: "short" });
  return `${mon} ${String(d.getDate()).padStart(2, "0")}, ${d.getFullYear()} at ${hhmm(d)}:${ss(d)}`;
}

/** "18.6 MB" / "512 KB". */
export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Uppercase format tag from a file name: "foo.PNG" -> "PNG". */
export function fmtFormat(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toUpperCase() : "?";
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ss(d: Date): string {
  return String(d.getSeconds()).padStart(2, "0");
}
