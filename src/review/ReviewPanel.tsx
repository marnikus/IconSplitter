// ReviewPanel.tsx — the Selection tab layout (design): app-bar watcher pill,
// root bar, filter bar, list beside the comparison card, warning banners, the
// orphan history and the bottom status bar.

import { useMemo, useState } from "react";
import { needsAttention } from "../lib/reviewmerge";
import { filtersCleared } from "../lib/reviewquery";
import { useAppChrome } from "../ui/AppChrome";
import { BusyOverlay, Toast } from "../ui/Overlays";
import DetailPane from "./DetailPane";
import Hotkeys from "./Hotkeys";
import FilterBar from "./FilterBar";
import OrphanHistory from "./OrphanHistory";
import PairList from "./PairList";
import RootBar from "./RootBar";
import StatusBar from "./StatusBar";
import Warnings from "./Warnings";
import { useReview } from "./useReview";
import type { ReviewApi } from "./api";
import type { Decision } from "../lib/reviewfile";
import type { Thumbs } from "../ui/useThumbnails";
import type { ReviewItem } from "../lib/reviewmerge";

export default function ReviewPanel() {
  const r = useReview();
  const view = useListControls(r);
  useAppChrome(<WatcherPill on={r.s.watcher} root={r.s.rootName} onToggle={r.toggleWatcher} />, [r.s.watcher, r.s.rootName]);
  return (
    <div className="space-y-3">
      <RootBar r={r} folders={r.s.folders} />
      <FilterBar r={r} items={r.s.items} shown={r.s.showing} />
      <Warnings r={r} />
      <Workspace r={r} view={view} />
      <Hotkeys enabled={r.item !== null} handlers={hotkeyHandlers(r)} />
      <OrphanHistory records={r.s.orphans} />
      <StatusBar rootName={r.s.rootName} busy={r.s.busy} lastScanAt={r.s.lastScanAt} delta={r.s.delta}
        unsaved={r.s.unsaved} counts={r.s.counts} watcher={r.s.watcher} />
      <Overlays r={r} />
    </div>
  );
}

/** List-panel controls: collapse, widen and the shared "needs attention" figure. */
function useListControls(r: ReviewApi) {
  const [collapsed, setCollapsed] = useState(false);
  const [wide, setWide] = useState(false);
  const attention = useAttention(r.s.items, r.view, r.thumbs);
  return { collapsed, wide, attention, toggleCollapse: () => setCollapsed((v) => !v), toggleWide: () => setWide((v) => !v) };
}

type ListControls = ReturnType<typeof useListControls>;

function Workspace({ r, view: c }: { r: ReviewApi; view: ListControls }) {
  return (
    <div className={`grid gap-3 ${c.wide ? "xl:grid-cols-[620px_1fr]" : "xl:grid-cols-[400px_1fr]"}`}>
      <PairList
        items={r.view} total={r.s.counts.total} thumbs={r.thumbs} selectedId={r.s.selectedId}
        search={r.s.search} summary={summaryOf(r)} attention={c.attention} emptyNote={emptyNote(r)}
        canClear={!filtersCleared(r.s.query)} collapsed={c.collapsed} onSearch={(search) => r.patch({ search })}
        onOpen={r.openItem} onToggleCollapse={c.toggleCollapse} onWiden={c.toggleWide} onClear={r.clearFilters}
      />
      {r.item ? <Detail r={r} /> : <EmptyDetail anyPairs={r.s.items.length > 0} />}
    </div>
  );
}

function Detail({ r }: { r: ReviewApi }) {
  if (!r.item) return null;
  return (
    <DetailPane item={r.item} rootName={r.s.rootName} sides={{ ...r.detail.sides, busy: r.detail.busy }}
      zoom={r.s.zoom} autoNext={r.s.autoNext} decide={(d) => decide(r, d)} setAutoNext={r.setAutoNext} openPath={r.openPath} />
  );
}

function hotkeyHandlers(r: ReviewApi) {
  return {
    approve: () => decide(r, "approved"),
    decline: () => decide(r, "declined"),
    next: () => r.step(1),
    prev: () => r.step(-1),
    zoom: r.toggleZoom,
    close: () => r.openItem(null),
  };
}

function decide(r: ReviewApi, decision: Decision): void {
  if (r.item) r.decide(r.item.id, decision);
}

function WatcherPill({ on, root, onToggle }: { on: boolean; root: string; onToggle: () => void }) {
  return (
    <button type="button" data-testid="watcher-pill" aria-pressed={on} onClick={onToggle}
      className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10"
      title={on ? "Auto-rescan every 15 s while this tab is open" : "Auto-rescan is off"}>
      <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-400" : "bg-slate-500"}`} aria-hidden="true" />
      {on ? "Watcher active" : "Watcher paused"}
      {root === "" && <span className="text-slate-500">· no root</span>}
    </button>
  );
}

function EmptyDetail({ anyPairs }: { anyPairs: boolean }) {
  return (
    <section className="panel grid place-items-center p-10 text-center text-sm text-slate-400" data-testid="detail-empty">
      {anyPairs
        ? "Select an image pair on the left to compare the original with its AI result."
        : "No images found in this folder — choose a folder or rescan."}
    </section>
  );
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

function summaryOf(r: ReviewApi): string {
  const order = r.s.query.sort.dir === "desc" ? "newest first" : "oldest first";
  const status = r.s.query.status === "all" ? "all decisions" : `${r.s.query.status} only`;
  return `${order} · ${status}`;
}

function emptyNote(r: ReviewApi): string {
  if (r.s.items.length === 0) return "No images found in this folder — choose a folder or rescan.";
  if (r.s.search.trim() !== "") return `Nothing matches “${r.s.search.trim()}”.`;
  return "No images match the current filter — clear the filters to see all of them.";
}

/** Entries that cannot be compared: a missing side or a failed thumbnail. */
function useAttention(items: ReviewItem[], view: ReviewItem[], thumbs: Thumbs): number {
  return useMemo(() => needsAttention(items, failedThumbs(view, thumbs)), [items, view, thumbs]);
}

function failedThumbs(view: ReviewItem[], thumbs: Thumbs): Set<string> {
  const out = new Set<string>();
  for (const item of view) {
    const path = item.ai?.relPath ?? item.source?.relPath ?? "";
    if (thumbs.errorFor(path)) out.add(path);
  }
  return out;
}
