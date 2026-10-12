// BatchPanel.tsx — batch feature with V2 controls reference (zoom, date filters, filtered multi-select)
// Keeps split/export size separate (PresetBar), uses lib/zoom.ts shared 48-800 for thumbnails.
// Reuses preset-based folder-handle restore and per-image JSON/rescan (useBatch boot).

import { copyFolderText } from "../lib/copypath";
import { useBatchView } from "./useBatchView";
import PresetBar from "./PresetBar";
import ScanTable, { useThumbCache } from "./ScanTable";
import BatchFilterGrid from "./BatchFilterGrid";
import BatchBulkBar from "./BatchBulkBar";

export default function BatchPanel() {
  const v = useBatchView();
  const thumbFor = useThumbCache(v.core.thumbUrl);
  return (
    <div className="space-y-4">
      {!v.core.supported && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="fs-warning">
          Batch mode needs Chrome or Edge (File System Access API). The single-sheet tool above works everywhere.
        </p>
      )}
      <HeaderControls v={v} />
      {v.core.s.rootName !== "" && (
        <BatchFilterGrid filter={v.filter} sort={v.sort} shown={v.visibleCount} setFilter={v.setFilter} setSort={v.setSort} />
      )}
      <MainGrid v={v} thumbFor={thumbFor} />
      <Overlays v={v} />
    </div>
  );
}

type View = ReturnType<typeof useBatchView>;

function MainGrid({ v, thumbFor }: { v: View; thumbFor: (r: string) => Promise<string> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <PresetBar
          preset={v.core.s.preset} presetNames={v.core.s.presetNames} setPreset={v.core.setPreset}
          savePreset={(n) => void v.core.savePreset(n)} loadPreset={(n) => void v.core.loadPreset(n)} deletePreset={v.core.deletePreset}
        />
        <DestInfo v={v} />
      </div>
      <div className="space-y-4">
        <RefWarnings count={v.core.s.refWarnings.length} />
        {v.core.s.rows.length > 0 && (
          <BatchBulkBar
            header={v.header} checkedCount={v.checkedCount} visibleCount={v.visibleCount} totalCount={v.totalCount}
            thumb={v.thumb} selectedCount={v.selectedCount}
            onToggleAll={v.toggleAllVisible} onSelectVisible={v.checkVisible} onDeselectAll={v.uncheckAll}
            onThumb={v.setThumb} onSplit={() => void v.core.run()} canSplit={v.selectedCount > 0 && !v.core.s.busy}
          />
        )}
        <ScanTable
          rows={v.visible} thumb={v.thumb} toggle={v.toggle} selectAll={(on) => v.toggleAllVisible(on)}
          copyPath={(rel) => copyPath(v, rel)} thumbFor={thumbFor}
        />
      </div>
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

function HeaderControls({ v }: { v: View }) {
  return (
    <section className="panel flex flex-wrap items-center gap-2">
      <button data-testid="batch-root" className="btn-primary" onClick={() => void v.core.chooseRoot()}>
        {v.core.s.rootName ? `Root: ${v.core.s.rootName}` : "Choose source folder…"}
      </button>
      <button data-testid="batch-refresh" className="btn-ghost" onClick={() => void v.core.refresh()}>↺ Rescan</button>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-slate-400" data-testid="batch-selected-header">{v.selectedCount} selected</span>
        {v.core.s.busy
          ? <button data-testid="batch-cancel" className="btn-ghost" onClick={v.core.cancel}>✕ Stop</button>
          : <button data-testid="batch-process-header" className="btn-primary" disabled={!v.selectedCount} onClick={() => void v.core.run()}>▶ Split selected</button>}
      </div>
    </section>
  );
}

function DestInfo({ v }: { v: View }) {
  const custom = v.core.s.preset.destMode === "custom" && v.core.s.destName;
  return (
    <section className="panel space-y-2">
      <h3 className="panel-title">Output</h3>
      <p className="text-sm text-slate-400">
        {custom
          ? <>Custom destination: <b className="text-slate-200">{v.core.s.destName}</b></>
          : <>Auto: <b className="text-slate-200">{v.core.s.rootName || "<folder>"}/_split_output</b></>}
      </p>
      <p className="text-xs text-slate-500">Grouped as YYYY-MM / YYYY-MM-DD_HH-mm-ss, source hierarchy preserved, never overwritten.</p>
      <div className="flex gap-2">
        <button data-testid="batch-dest" className="btn-ghost" onClick={() => void v.core.chooseDest()}>Choose destination…</button>
      </div>
    </section>
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
