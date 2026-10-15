// BatchPanel.tsx — batch folders, full-width list, V2 selection, merge slider + preview inline + per-row override + review (approved/declined/warning)

import { useCallback, useMemo } from "react";
import { copyFolderText } from "../lib/copypath";
import { useBatchView } from "./useBatchView";
import ScanTable, { useThumbCache } from "./ScanTable";
import BatchFilterGrid from "./BatchFilterGrid";
import BatchBulkBar from "./BatchBulkBar";
import BatchSourceBar from "./BatchSourceBar";
import BatchPresetRow from "./BatchPresetRow";
import BatchDestRow from "./BatchDestRow";
import BatchMergeBar from "./BatchMergeBar";
import BatchProgressHeader from "./BatchProgressHeader";
import { useBatchPreview, isStaleEntry, expectedKeyFor, type PreviewEntry } from "./useBatchPreview";
import { useBatchHotkeys } from "./useBatchHotkeys";
import { useSelectShortcuts } from "../lib/selectshortcuts";

type View = ReturnType<typeof useBatchView>;
type Preview = ReturnType<typeof useBatchPreview>;

function useReviewed(v: View) {
  // `decide` is referentially stable (the ctx bag is memoised), so these two
  // stay stable too — the restore effect must not re-run on every render.
  const decide = v.core.decide;
  const onReviewed = useCallback((relPath: string, count: number) => {
    decide([relPath], count === 4 ? "approved" : "warning");
  }, [decide]);
  const onReviewedBatch = useCallback((entries: { relPath: string; count: number }[]) => {
    const approve = entries.filter((e) => e.count === 4).map((e) => e.relPath);
    const warn = entries.filter((e) => e.count !== 4).map((e) => e.relPath);
    if (approve.length) decide(approve, "approved");
    if (warn.length) decide(warn, "warning");
  }, [decide]);
  return { onReviewed, onReviewedBatch };
}
function useCheckedRows(v: View) { return useMemo(() => v.core.s.rows.filter((r) => r.selected), [v.core.s.rows]); }
function useOnPreview(checkedRows: View["core"]["s"]["rows"], preview: Preview) {
  return useCallback(() => { void preview.previewSelected(checkedRows, false); }, [checkedRows, preview]);
}
function useOnRegenerate(checkedRows: View["core"]["s"]["rows"], preview: Preview) {
  return useCallback(() => { void preview.previewSelected(checkedRows, true); }, [checkedRows, preview]);
}
function useRowMergeApply(v: View, preview: Preview) {
  return useCallback((relPath: string, value: number | null) => {
    v.setRowMerge(relPath, value);
    const row = v.core.s.rows.find((r) => r.relPath.toLowerCase() === relPath.toLowerCase());
    if (row) void preview.previewSingle(row, value);
  }, [v, preview]);
}
function useRowMergeReset(v: View, preview: Preview) {
  return useCallback((relPath: string) => {
    v.clearRowMerge(relPath);
    const row = v.core.s.rows.find((r) => r.relPath.toLowerCase() === relPath.toLowerCase());
    if (row) { const global = v.core.s.preset.split.mergeFrac; void preview.previewSingle(row, global); }
  }, [v, preview]);
}
function usePreviewSetup(v: View, onReviewed: (relPath: string, count: number) => void, onReviewedBatch: (entries: { relPath: string; count: number }[]) => void) {
  return useBatchPreview({ root: v.core.rootRef.current, rootName: v.core.s.rootName, rows: v.core.s.rows, split: v.core.s.preset.split, rowMerges: v.rowMerges, onReviewed, onReviewedBatch });
}

/** I-68: a stored preview is stale when it was rendered under other settings. */
function useRowStale(v: View, preview: Preview) {
  return useCallback((relPath: string) => {
    const e = preview.previews.get(relPath);
    if (!e) return false;
    const row = v.core.s.rows.find((r) => r.relPath === relPath);
    return isStaleEntry(e, expectedKeyFor(row, v.core.s.preset.split, v.rowMerges));
  }, [v, preview]);
}

export default function BatchPanel() {
  const v = useBatchView();
  const thumbFor = useThumbCache(v.core.thumbUrl);
  const { onReviewed, onReviewedBatch } = useReviewed(v);
  const preview = usePreviewSetup(v, onReviewed, onReviewedBatch);
  useBatchHotkeys(v as never, true);
  useSelectShortcuts({ activeId: v.activeId, selectActive: v.checkActive, deselectActive: v.uncheckActive, selectVisible: v.checkVisible, deselectAll: v.uncheckAll }, true);
  const checkedRows = useCheckedRows(v);
  const onPreview = useOnPreview(checkedRows, preview);
  const rowStale = useRowStale(v, preview);
  const onRegenerate = useOnRegenerate(checkedRows, preview);
  const onRowMergeApply = useRowMergeApply(v, preview);
  const onRowMergeReset = useRowMergeReset(v, preview);
  return (
    <div className="batch-shell w-full space-y-4">
      <BatchProgressHeader progress={v.core.s.progress} running={v.core.s.running} rows={v.core.s.rows} thumbFor={thumbFor} onCancel={v.core.cancel} onDismiss={() => v.core.setProgress(null)} onReview={() => {}} mode="split" />
      <BatchProgressHeader progress={preview.progress} running={preview.running} rows={v.core.s.rows} thumbFor={thumbFor} onCancel={preview.cancel} onDismiss={preview.dismiss} onReview={() => {}} mode="preview" />
      {!v.core.supported && <Unsupported />}
      <GrantBar v={v} />
      <BatchControls v={v} onPreview={onPreview} onRegenerate={onRegenerate} previewing={preview.isPreviewing} previewRunning={preview.running} />
      <PresetAndDest v={v} />
      <BatchMergeBar preset={v.core.s.preset} setPreset={v.core.setPreset} />
      {preview.previews.size > 0 && <div className="flex justify-end"><button type="button" className="btn-ghost text-xs" data-testid="batch-preview-clear" onClick={preview.clear}>Clear previews</button></div>}
      <RefWarnings count={v.core.s.refWarnings.length} />
      <FullWidthList v={v} thumbFor={thumbFor} previews={preview.previews} rowStale={rowStale} onRowMergeApply={onRowMergeApply} onRowMergeReset={onRowMergeReset} />
      <Overlays v={v} />
    </div>
  );
}

function BatchControls({ v, onPreview, onRegenerate, previewing, previewRunning }: { v: View; onPreview: () => void; onRegenerate: () => void; previewing: boolean; previewRunning: boolean }) {
  const busy = v.core.s.busy || (v.core.s.running ? "Splitting…" : null) || (previewRunning ? "Previewing…" : null);
  return (
    <div className="batch-controls-stack space-y-3">
      <div className="v2-controls"><BatchSourceBar rootName={v.core.s.rootName} root={v.core.rootRef.current} rows={v.core.s.rows} chooseRoot={() => void v.core.chooseRoot()} rescan={() => void v.core.refresh()} /></div>
      <BatchFilterGrid filter={v.filter} sort={v.sort} shown={v.visibleCount} setFilter={v.setFilter} setSort={v.setSort} />
      <BatchBulkBar header={v.header} checkedCount={v.checkedCount} visibleCount={v.visibleCount} totalCount={v.totalCount} hiddenCount={v.hiddenCount} affectedCount={v.affectedCount} thumb={v.thumb} selectedCount={v.selectedCount} reviewCounts={v.reviewCounts} decidableCount={v.decidableCount} approvedSelectedCount={v.approvedSelectedCount} onToggleAll={v.toggleAllVisible} onSelectVisible={v.checkVisible} onDeselectAll={v.uncheckAll} onThumb={v.setThumb} onSplit={() => void v.core.run()} onPreview={onPreview} onRegenerate={onRegenerate} onDecide={(review) => v.decide(v.core.s.rows.filter((r) => r.selected).map((r) => r.relPath), review as any)} canSplit={v.approvedSelectedCount > 0 && !busy} canPreview={v.selectedCount > 0 && !busy} canRegenerate={v.selectedCount > 0 && !busy} previewing={previewing} />
    </div>
  );
}
/** I-66: the one gesture a restart may ask for — re-grant the remembered root. */
function GrantBar({ v }: { v: View }) {
  if (!v.core.s.needsGrant) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-400/40 bg-indigo-500/10 p-3 text-sm text-indigo-100" data-testid="batch-grant-bar">
      <span>The browser needs your OK to re-open “{v.core.rootRef.current?.name}” — previews are already restored.</span>
      <button type="button" className="v2-btn primary" data-testid="batch-grant" onClick={() => void v.core.grantAccess()}>Restore access</button>
    </div>
  );
}
function Unsupported() {
  return <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="fs-warning">Batch mode needs Chrome or Edge (File System Access API). The single-sheet tool above works everywhere.</p>;
}
function PresetAndDest({ v }: { v: View }) {
  return (
    <div className="space-y-3">
      <BatchPresetRow preset={v.core.s.preset} presetNames={v.core.s.presetNames} setPreset={v.core.setPreset} savePreset={(n) => void v.core.savePreset(n)} loadPreset={(n) => void v.core.loadPreset(n)} deletePreset={v.core.deletePreset} />
      <BatchDestRow rootName={v.core.s.rootName} destName={v.core.s.destName} destMode={v.core.s.preset.destMode} chooseDest={() => void v.core.chooseDest()} />
    </div>
  );
}
function FullWidthList({ v, thumbFor, previews, rowStale, onRowMergeApply, onRowMergeReset }: { v: View; thumbFor: (r: string) => Promise<string>; previews: Map<string, PreviewEntry>; rowStale: (relPath: string) => boolean; onRowMergeApply: (relPath: string, value: number | null) => void; onRowMergeReset: (relPath: string) => void }) {
  return <div className="batch-list w-full"><ScanTable rows={v.visible} thumb={v.thumb} activeId={v.activeId} toggle={v.toggleCheck} selectRow={v.selectRow} selectActive={v.selectActive} copyPath={(rel) => copyPath(v, rel)} thumbFor={thumbFor} previews={previews} rowStale={rowStale} rowMerges={v.rowMerges} globalFrac={v.core.s.preset.split.mergeFrac} setRowMerge={onRowMergeApply} clearRowMerge={onRowMergeReset} decide={v.decide} /></div>;
}
function Overlays({ v }: { v: View }) {
  const showBusy = !!v.core.s.busy;
  if (!showBusy && !v.core.s.toast) return null;
  return <>{showBusy && <BusyOverlay msg={v.core.s.busy!} cancel={v.core.cancel} />}{v.core.s.toast && <div data-testid="batch-toast" className={`fixed left-1/2 z-50 toast-above-dock -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-xl ${v.core.s.toast.err ? "bg-rose-600" : "bg-emerald-600"}`}>{v.core.s.toast.msg}</div>}</>;
}
function RefWarnings({ count }: { count: number }) {
  if (count === 0) return null;
  return <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="ref-warnings">⚠ {count} image{count === 1 ? " has" : "s have"} no reference file. You can deselect {count === 1 ? "it" : "them"} to skip, or continue — exports will simply omit the reference copy.</p>;
}
function BusyOverlay({ msg, cancel }: { msg: string; cancel: () => void }) {
  return (
    <div data-testid="batch-busy" className="fixed left-1/2 z-40 toast-above-dock -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/10 bg-slate-900 px-4 py-2 text-sm shadow-xl">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      <span>{msg}</span>
      <button className="btn-mini ml-1" onClick={cancel}>Stop</button>
    </div>
  );
}
function copyPath(v: View, relPath: string): void { void copyFolderText(v.core.rootRef.current, relPath, v.core.say); }
