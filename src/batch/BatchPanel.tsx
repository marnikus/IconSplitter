// BatchPanel.tsx — batch folders, full-width list like Generate SVG (user request)
// Presets moved to compact responsive row above Images, Images uses full Batch width,
// list is full scrollable down (no limited max-h), reuses SVG list patterns: filters, sorting,
// selection/bulk, zoomed previews, status. Batch-specific Split + JSON status kept.
// App shell and log dock preserved, scope limited to Batch tab.

import { copyFolderText } from "../lib/copypath";
import { useBatchView } from "./useBatchView";
import ScanTable, { useThumbCache } from "./ScanTable";
import BatchFilterGrid from "./BatchFilterGrid";
import BatchBulkBar from "./BatchBulkBar";
import BatchSourceBar from "./BatchSourceBar";
import BatchPresetRow from "./BatchPresetRow";
import BatchDestRow from "./BatchDestRow";

export default function BatchPanel() {
  const v = useBatchView();
  const thumbFor = useThumbCache(v.core.thumbUrl);
  return (
    <div className="batch-shell w-full space-y-4">
      {!v.core.supported && <Unsupported />}
      <StickyControls v={v} />
      <PresetAndDest v={v} />
      <RefWarnings count={v.core.s.refWarnings.length} />
      <FullWidthList v={v} thumbFor={thumbFor} />
      <Overlays v={v} />
    </div>
  );
}

function Unsupported() {
  return (
    <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="fs-warning">
      Batch mode needs Chrome or Edge (File System Access API). The single-sheet tool above works everywhere.
    </p>
  );
}

function StickyControls({ v }: { v: View }) {
  return (
    <div className="batch-sticky-stack">
      <div className="v2-controls">
        <BatchSourceBar
          rootName={v.core.s.rootName}
          root={v.core.rootRef.current}
          rows={v.core.s.rows}
          chooseRoot={() => void v.core.chooseRoot()}
          rescan={() => void v.core.refresh()}
        />
      </div>
      <BatchFilterGrid filter={v.filter} sort={v.sort} shown={v.visibleCount} setFilter={v.setFilter} setSort={v.setSort} />
      <BatchBulkBar
        header={v.header} checkedCount={v.checkedCount} visibleCount={v.visibleCount} totalCount={v.totalCount}
        thumb={v.thumb} selectedCount={v.selectedCount}
        onToggleAll={v.toggleAllVisible} onSelectVisible={v.checkVisible} onDeselectAll={v.uncheckAll}
        onThumb={v.setThumb} onSplit={() => void v.core.run()} canSplit={v.selectedCount > 0 && !v.core.s.busy}
      />
    </div>
  );
}

type View = ReturnType<typeof useBatchView>;

function PresetAndDest({ v }: { v: View }) {
  return (
    <div className="space-y-3">
      <BatchPresetRow
        preset={v.core.s.preset} presetNames={v.core.s.presetNames} setPreset={v.core.setPreset}
        savePreset={(n) => void v.core.savePreset(n)} loadPreset={(n) => void v.core.loadPreset(n)} deletePreset={v.core.deletePreset}
      />
      <BatchDestRow
        rootName={v.core.s.rootName} destName={v.core.s.destName} destMode={v.core.s.preset.destMode}
        chooseDest={() => void v.core.chooseDest()}
      />
    </div>
  );
}

function FullWidthList({ v, thumbFor }: { v: View; thumbFor: (r: string) => Promise<string> }) {
  return (
    <div className="batch-list w-full">
      <ScanTable
        rows={v.visible} thumb={v.thumb} toggle={v.toggle} selectAll={(on) => v.toggleAllVisible(on)}
        copyPath={(rel) => copyPath(v, rel)} thumbFor={thumbFor}
      />
    </div>
  );
}

function Overlays({ v }: { v: View }) {
  if (!v.core.s.busy && !v.core.s.toast) return null;
  return (
    <>
      {v.core.s.busy && <BusyOverlay msg={v.core.s.busy} cancel={v.core.cancel} />}
      {v.core.s.toast && (
        <div data-testid="batch-toast" className={`fixed left-1/2 z-50 toast-above-dock -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-xl ${v.core.s.toast.err ? "bg-rose-600" : "bg-emerald-600"}`}>
          {v.core.s.toast.msg}
        </div>
      )}
    </>
  );
}

function RefWarnings({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="ref-warnings">
      ⚠ {count} image{count === 1 ? " has" : "s have"} no reference file. You can deselect {count === 1 ? "it" : "them"} to skip,
      or continue — exports will simply omit the reference copy.
    </p>
  );
}

function BusyOverlay({ msg, cancel }: { msg: string; cancel: () => void }) {
  return (
    <div data-testid="batch-busy" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-6 py-4 shadow-2xl">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
        <span className="text-sm">{msg}</span>
        <button className="btn-mini" onClick={cancel}>Stop</button>
      </div>
    </div>
  );
}

function copyPath(v: View, relPath: string): void {
  void copyFolderText(v.core.rootRef.current, relPath, v.core.say);
}
