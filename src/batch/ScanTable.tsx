// ScanTable.tsx — review window (spec §2): thumbnail, filename, status,
// relative path, per-row selection, select all / deselect all, and the
// "Open in File Explorer" action (browser-safe substitute, RULE 9).

import { useCallback, useEffect, useState } from "react";
import type { Row } from "./useBatch";
import type { SourceStatus } from "../lib/statefile";

export interface ScanTableProps {
  rows: Row[];
  toggle: (relPath: string) => void;
  selectAll: (on: boolean) => void;
  copyPath: (relPath: string) => void;
  thumbFor: (relPath: string) => Promise<string>;
}

const BADGE: Record<SourceStatus, { label: string; cls: string }> = {
  unprocessed: { label: "unprocessed", cls: "bg-slate-500/20 text-slate-300" },
  processed: { label: "processed", cls: "bg-emerald-500/20 text-emerald-300" },
  skipped: { label: "skipped", cls: "bg-amber-500/20 text-amber-300" },
  changed: { label: "changed", cls: "bg-sky-500/20 text-sky-300" },
  missing: { label: "missing", cls: "bg-rose-500/20 text-rose-300" },
  deleted: { label: "deleted", cls: "bg-rose-500/20 text-rose-300" },
};

export default function ScanTable(props: ScanTableProps) {
  const selectable = props.rows.filter((r) => r.status !== "missing" && r.status !== "deleted");
  const allOn = selectable.length > 0 && selectable.every((r) => r.selected);
  return (
    <section className="panel" data-testid="scan-table">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="panel-title !mb-0">Images ({props.rows.length})</h3>
        <div className="ml-auto flex gap-2">
          <button data-testid="select-all" className="btn-ghost" onClick={() => props.selectAll(!allOn)}>
            {allOn ? "Deselect All" : "Select All"}
          </button>
        </div>
      </div>
      {props.rows.length === 0
        ? <p className="rounded-xl border border-white/10 p-6 text-center text-slate-400">No _AI images found in this folder.</p>
        : <ul className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">{props.rows.map((r) => <RowView key={r.relPath} r={r} {...props} />)}</ul>}
    </section>
  );
}

function RowView({ r, toggle, copyPath, thumbFor }: { r: Row } & ScanTableProps) {
  const badge = BADGE[r.status];
  const disabled = r.status === "missing" || r.status === "deleted";
  return (
    <li className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5">
      <input
        type="checkbox" checked={r.selected} disabled={disabled}
        onChange={() => toggle(r.relPath)} className="h-4 w-4 accent-indigo-500"
        data-testid={`row-select-${r.relPath}`}
      />
      <Thumb relPath={r.relPath} thumbFor={thumbFor} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {r.name}
          {r.refRelPath === null && <span className="ml-2 text-amber-300" title="Reference image missing">⚠ ref missing</span>}
        </p>
        <p className="truncate text-xs text-slate-400">{r.relPath}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>{badge.label}</span>
      <button
        className="btn-mini" title="Copy path (opening Explorer is not possible in a browser app)"
        onClick={() => copyPath(r.relPath)} data-testid={`row-open-${r.relPath}`}
      >
        Open in File Explorer
      </button>
    </li>
  );
}

function Thumb({ relPath, thumbFor }: { relPath: string; thumbFor: (r: string) => Promise<string> }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void thumbFor(relPath).then((u) => alive && setSrc(u)).catch(() => {});
    return () => { alive = false; };
  }, [relPath, thumbFor]);
  return src
    ? <img src={src} alt="" className="h-10 w-10 rounded-md bg-white object-contain" />
    : <div className="h-10 w-10 animate-pulse rounded-md bg-white/10" />;
}

export function useThumbCache(getUrl: (relPath: string) => Promise<string>) {
  const [cache] = useState(() => new Map<string, string>());
  return useCallback((relPath: string) => {
    const hit = cache.get(relPath);
    if (hit) return Promise.resolve(hit);
    return getUrl(relPath).then((u) => { cache.set(relPath, u); return u; });
  }, [cache, getUrl]);
}
