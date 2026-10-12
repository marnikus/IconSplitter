// batchpreview.ts — pure helpers for Batch merge preview

export function clampMergeFrac(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v >= 0 && v <= 0.15 ? v : null;
}

/** The distance a row really uses: a stored override wins, `null` means auto. */
export function effectiveMerge(
  global: number | null,
  override: number | null | undefined,
  hasOverride: boolean,
): number | null {
  return hasOverride ? (override as number | null) : global;
}

/**
 * The merge distance ONE row must be previewed/processed with. `explicit` is the
 * value the user just clicked Apply (or Reset → the global) with: that click is
 * newer than the stored map, so it wins even before React re-renders. An omitted
 * `explicit` means "nobody applied anything — the row's override decides".
 */
export function mergeForRow(
  global: number | null,
  merges: Readonly<Record<string, number | null>>,
  relPath: string,
  explicit?: number | null,
): number | null {
  if (explicit !== undefined) return explicit;
  const key = relPath.toLowerCase();
  return effectiveMerge(global, merges[key], Object.prototype.hasOwnProperty.call(merges, key));
}

export interface PreviewKeyOpts {
  relPath: string;
  mergeFrac: number | null;
  padding: number;
  size: number;
  transparent: boolean;
  mtime?: number;
}

export function previewKey(o: PreviewKeyOpts): string {
  const mf = o.mergeFrac == null ? "auto" : o.mergeFrac.toFixed(4);
  const mt = o.mtime != null ? `|mt${o.mtime}` : "";
  return `${o.relPath}|mf${mf}|p${o.padding}|s${o.size}|t${o.transparent ? 1 : 0}${mt}`;
}
