// ReviewPanel.tsx — layout of the Selection tab (spec §1–§10): root picker,
// rescan, counters, filters, the scrollable list, the file warnings, the
// history of vanished pairs and the comparison window.

import { useReview, type ReviewApi } from "./useReview";
import CompareView, { type CompareActions, type CompareProps } from "./CompareView";
import ReviewCounters from "./ReviewCounters";
import ReviewFilters from "./ReviewFilters";
import ReviewList from "./ReviewList";
import StatusBadge from "./StatusBadge";
import { BusyOverlay, Toast } from "../ui/Overlays";

export default function ReviewPanel() {
  const r = useReview();
  return (
    <div className="space-y-4">
      <Header r={r} />
      <Notices r={r} />
      <section className="panel space-y-3">
        <ReviewCounters counts={r.s.counts} active={r.s.query.status} onPick={(status) => r.setQuery({ status })} />
        <p className="text-xs text-slate-400" data-testid="review-summary">{summaryOf(r)}</p>
      </section>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <ReviewFilters query={r.s.query} patch={r.setQuery} clear={r.clearFilters} />
        <ReviewList
          items={r.view}
          emptyNote={emptyNote(r)}
          selection={{ id: r.s.selectedId, thumbs: r.thumbs }}
          onOpen={r.openItem}
        />
      </div>
      <Orphans r={r} />
      <Comparison r={r} />
      <Overlays r={r} />
    </div>
  );
}

function Header({ r }: { r: ReviewApi }) {
  return (
    <section className="panel flex flex-wrap items-center gap-2">
      <button type="button" data-testid="review-root" className="btn-primary" onClick={r.pickRoot}>
        {r.s.rootName ? `Root: ${r.s.rootName}` : "Choose split root…"}
      </button>
      <button type="button" data-testid="review-refresh" className="btn-ghost" onClick={r.rescan}>↺ Rescan</button>
      <span className="ml-auto text-xs text-slate-400">
        {r.s.items.length} image pair{r.s.items.length === 1 ? "" : "s"} · review-decisions.json
      </span>
    </section>
  );
}

function summaryOf(r: ReviewApi): string {
  const filtered = r.view.length === r.s.items.length ? "" : ` · ${r.view.length} shown with the current filter`;
  return `${r.s.scanNote}${filtered}`;
}

function emptyNote(r: ReviewApi): string {
  if (r.s.items.length === 0) return "No images found in this folder — choose a folder or rescan.";
  return "No images match the current filter — clear the filters to see all of them.";
}

function Notices({ r }: { r: ReviewApi }) {
  const unpaired = r.s.items.filter((i) => i.kind !== "paired").length;
  return (
    <>
      {!r.supported && (
        <p data-testid="review-fs-warning" className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Selection review needs Chrome or Edge (File System Access API) to read images and write the review file.
        </p>
      )}
      {(r.s.fileStatus === "corrupt" || r.s.fileStatus === "write-error") && <FileWarning r={r} />}
      {unpaired > 0 && (
        <p data-testid="review-unpaired" className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
          {unpaired} entr{unpaired === 1 ? "y has" : "ies have"} no matching side — each is listed with “AI result missing” or “Original missing”.
        </p>
      )}
    </>
  );
}

function FileWarning({ r }: { r: ReviewApi }) {
  const corrupt = r.s.fileStatus === "corrupt";
  return (
    <div data-testid="review-file-warning" className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      <p className="font-semibold">{corrupt ? "⚠ The review file could not be read" : "⚠ Decisions could not be saved"}</p>
      <p className="mt-1 text-amber-200/90">
        {r.s.fileNote ?? "Unknown error"}
        {corrupt
          ? " — the file is left untouched; decisions made now are kept for this session only."
          : " — your decisions are still in the list; retry once the folder is writable."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-mini" data-testid="review-file-retry" onClick={r.retry}>↻ Retry</button>
        {corrupt && (
          <button type="button" className="btn-mini" data-testid="review-file-reset" onClick={r.resetFile}>
            Back up the corrupt file &amp; start fresh
          </button>
        )}
      </div>
    </div>
  );
}

function Orphans({ r }: { r: ReviewApi }) {
  if (r.s.orphans.length === 0) return null;
  return (
    <details className="panel" data-testid="review-orphans">
      <summary className="cursor-pointer text-sm text-slate-300">
        Decisions for files no longer on disk ({r.s.orphans.length}) — kept in the review file
      </summary>
      <ul className="mt-2 space-y-1 text-xs text-slate-400">
        {r.s.orphans.slice(0, 50).map((record) => (
          <li key={record.pair_id} className="flex items-center gap-2">
            <StatusBadge status={record.decision} />
            <span className="truncate">{record.source || record.ai_result || record.pair_id}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Comparison({ r }: { r: ReviewApi }) {
  if (!r.item) return null;
  return <CompareView {...compareProps(r, r.item)} />;
}

function compareProps(r: ReviewApi, item: ReviewApi["s"]["items"][number]): CompareProps {
  return {
    item,
    position: { index: r.view.findIndex((i) => i.id === item.id) + 1, total: r.view.length, root: r.s.rootName },
    sides: { source: r.detail.sides.source, ai: r.detail.sides.ai, busy: r.detail.busy },
    actions: compareActions(r, item),
  };
}

function compareActions(r: ReviewApi, item: ReviewApi["s"]["items"][number]): CompareActions {
  return {
    decide: (decision) => r.decide(item.id, decision),
    close: () => r.openItem(null),
    prev: () => r.step(-1),
    next: () => r.step(1),
    openPath: r.openPath,
  };
}

function Overlays({ r }: { r: ReviewApi }) {
  if (!r.s.busy && !r.s.toast) return null;
  return (
    <>
      {r.s.busy && <BusyOverlay msg={r.s.busy} testid="review-busy" />}
      {r.s.toast && <Toast toast={r.s.toast} testid="review-toast" />}
    </>
  );
}
