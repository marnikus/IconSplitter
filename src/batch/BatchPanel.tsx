// BatchPanel.tsx — batch folders, full-width list, V2 selection, merge slider + preview inline + per-row override

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
import { useBatchPreview, type PreviewEntry } from "./useBatchPreview";
import { useBatchHotkeys } from "./useBatchHotkeys";
import { useSelectShortcuts } from "../lib/selectshortcuts";

export default function BatchPanel() {
  const v = useBatchView();
  const thumbFor = useThumbCache(v.core.thumbUrl);
  const preview = useBatchPreview({ root: v.core.rootRef.current, rows: v.core.s.rows, split: v.core.s.preset.split, rowMerges: v.rowMerges });
  useBatchHotkeys(v as never, true);
  useSelectShortcuts({ activeId: v.activeId, selectActive: v.checkActive, deselectActive: v.uncheckActive, selectVisible: v.checkVisible, deselectAll: v.uncheckAll }, true);
  const checkedRows = useCheckedRows(v);
  const onPreview = useOnPreview(checkedRows, preview);
  const onRowMergeApply = useRowMergeApply(v, preview);
  const onRowMergeReset = useRowMergeReset(v, preview);
  return (
    <div className="batch-shell w-full space-y-4">
      {!v.core.supported && <Unsupported />}
      <BatchControls v={v} onPreview={onPreview} previewing={preview.isPreviewing} />
      <PresetAndDest v={v} />
      <BatchMergeBar preset={v.core.s.preset} setPreset={v.core.setPreset} />
      {preview.previews.size > 0 && <div className="flex justify-end"><button type="button" className="btn-ghost text-xs" data-testid="batch-preview-clear" onClick={preview.clear}>Clear previews</button></div>}
      <RefWarnings count={v.core.s.refWarnings.length} />
      <FullWidthList v={v} thumbFor={thumbFor} previews={preview.previews} onRowMergeApply={onRowMergeApply} onRowMergeReset={onRowMergeReset} />
      <Overlays v={v} />
    </div>
  );
}

type View = ReturnType<typeof useBatchView>;
type Preview = ReturnType<typeof useBatchPreview>;

function useCheckedRows(v: View) {
  return useMemo(() => v.core.s.rows.filter((r) => r.selected), [v.core.s.rows]);
}
function useOnPreview(checkedRows: View["core"]["s"]["rows"], preview: Preview) {
  return useCallback(() => {
    void preview.previewSelected(checkedRows);
  }, [checkedRows, preview]);
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
    if (row) {
      // Reset → use global merge (null means auto/global, so pass global or undefined to force recompute)
      const global = v.core.s.preset.split.mergeFrac;
      void preview.previewSingle(row, global);
    }
  }, [v, preview]);
}
function BatchControls({ v, onPreview, previewing }: { v: View; onPreview: () => void; previewing: boolean }) {
  return (
    <div className="batch-controls-stack space-y-3">
      <div className="v2-controls"><BatchSourceBar rootName={v.core.s.rootName} root={v.core.rootRef.current} rows={v.core.s.rows} chooseRoot={() => void v.core.chooseRoot()} rescan={() => void v.core.refresh()} /></div>
      <BatchFilterGrid filter={v.filter} sort={v.sort} shown={v.visibleCount} setFilter={v.setFilter} setSort={v.setSort} />
      <BatchBulkBar header={v.header} checkedCount={v.checkedCount} visibleCount={v.visibleCount} totalCount={v.totalCount} hiddenCount={v.hiddenCount} affectedCount={v.affectedCount} thumb={v.thumb} selectedCount={v.selectedCount} onToggleAll={v.toggleAllVisible} onSelectVisible={v.checkVisible} onDeselectAll={v.uncheckAll} onThumb={v.setThumb} onSplit={() => void v.core.run()} onPreview={onPreview} canSplit={v.selectedCount > 0 && !v.core.s.busy} canPreview={v.selectedCount > 0 && !v.core.s.busy} previewing={previewing} />
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
function FullWidthList({ v, thumbFor, previews, onRowMergeApply, onRowMergeReset }: { v: View; thumbFor: (r: string) => Promise<string>; previews: Map<string, PreviewEntry>; onRowMergeApply: (relPath: string, value: number | null) => void; onRowMergeReset: (relPath: string) => void }) {
  return <div className="batch-list w-full"><ScanTable rows={v.visible} thumb={v.thumb} activeId={v.activeId} toggle={v.toggleCheck} selectRow={v.selectRow} selectActive={v.selectActive} copyPath={(rel) => copyPath(v, rel)} thumbFor={thumbFor} previews={previews} rowMerges={v.rowMerges} globalFrac={v.core.s.preset.split.mergeFrac} setRowMerge={onRowMergeApply} clearRowMerge={onRowMergeReset} /></div>;
}
function Overlays({ v }: { v: View }) {
  if (!v.core.s.busy && !v.core.s.toast) return null;
  return <>{v.core.s.busy && <BusyOverlay msg={v.core.s.busy} cancel={v.core.cancel} />}{v.core.s.toast && <div data-testid="batch-toast" className={`fixed left-1/2 z-50 toast-above-dock -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-xl ${v.core.s.toast.err ? "bg-rose-600" : "bg-emerald-600"}`}>{v.core.s.toast.msg}</div>}</>;
}
function RefWarnings({ count }: { count: number }) {
  if (count === 0) return null;
  return <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="ref-warnings">⚠ {count} image{count === 1 ? " has" : "s have"} no reference file. You can deselect {count === 1 ? "it" : "them"} to skip, or continue — exports will simply omit the reference copy.</p>;
}
function BusyOverlay({ msg, cancel }: { msg: string; cancel: () => void }) {
  return <div data-testid="batch-busy" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm"><div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-6 py-4 shadow-2xl"><span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" /><span className="text-sm">{msg}</span><button className="btn-mini" onClick={cancel}>Stop</button></div></div>;
}
function copyPath(v: View, relPath: string): void {
  void copyFolderText(v.core.rootRef.current, relPath, v.core.say);
}
