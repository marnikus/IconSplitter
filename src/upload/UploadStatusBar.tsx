// UploadStatusBar.tsx — the counts footer and the activity log (prompt §3/§18).
// Owns: the one place the tab reports what it is doing. The counts come from the
// row model, the log from the store, and neither is recomputed here — a second
// derivation is how a footer starts disagreeing with the list above it.

import { STATUS_LABEL, statusOf, type UploadStatus } from "./rows";
import type { UploadApi } from "./useUpload";

const ORDER: UploadStatus[] = ["awaiting-metadata", "ready", "processing", "processed", "partial", "stale", "failed"];

export default function UploadStatusBar({ api, model }: { api: UploadApi; model: string }) {
  return (
    <>
      <Counts api={api} />
      <div className="flex flex-wrap gap-4 border-y border-white/10 py-1.5 text-[10px] text-slate-400">
        {ORDER.map((status) => <span key={status}>{STATUS_LABEL[status]} {count(api, status)}</span>)}
      </div>
      <Activity api={api} model={model} />
      <Log api={api} />
    </>
  );
}

function count(api: UploadApi, status: UploadStatus): number {
  const c = api.counts;
  const table: Record<UploadStatus, number> = {
    "awaiting-metadata": c.awaiting, ready: c.ready, processing: c.processing,
    processed: c.processed, partial: c.partial, stale: c.stale, failed: c.failed,
  };
  return table[status];
}

function Counts({ api }: { api: UploadApi }) {
  const c = api.counts;
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 py-1 text-[10px] text-slate-400" data-testid="upload-counts">
      <span>{c.eligible} eligible · {c.awaiting} awaiting metadata · {c.ready} ready · {c.processing} processing</span>
      <span>{c.processed} processed · {c.partial} partial · {c.stale} stale · {c.failed} failed</span>
    </footer>
  );
}

function Activity({ api, model }: { api: UploadApi; model: string }) {
  const active = api.active;
  const line = api.runNote ?? (active === null ? "idle" : `${active.name}: ${STATUS_LABEL[statusOf(active)]}`);
  return (
    <section className="flex flex-wrap items-center gap-2 py-1.5 text-[10px] text-slate-300" aria-label="Activity log">
      <strong className="text-slate-200">Activity</strong>
      <span data-testid="upload-note">{line}</span>
      <span className="ml-auto text-slate-500">{model}</span>
    </section>
  );
}

function Log({ api }: { api: UploadApi }) {
  if (api.log.length === 0) return null;
  return (
    <section className="grid gap-0.5 pb-2 text-[10px] text-slate-500" aria-label="Recent activity" data-testid="upload-log">
      {api.log.slice(0, 8).map((line) => <p key={line}>{line}</p>)}
    </section>
  );
}
