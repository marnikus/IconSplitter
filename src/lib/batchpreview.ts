// batchpreview.ts — pure helpers for Batch merge preview

export function clampMergeFrac(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v >= 0 && v <= 0.15 ? v : null;
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
