// BatchPanel.tsx — batch feature layout (spec §1–§6): folder pickers, preset
// bar, review window, process controls, honest status surfaces (RULE 2/4).

import { useBatch } from "./useBatch";
import PresetBar from "./PresetBar";
import ScanTable, { useThumbCache } from "./ScanTable";

export default function BatchPanel() {
  const b = useBatch();
  const thumbFor = useThumbCache(b.thumbUrl);
  return (
    <div className="space-y-4">
      {!b.supported && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="fs-warning">
          Batch mode needs Chrome or Edge (File System Access API). The single-sheet tool above works everywhere.
        </p>
      )}
      <HeaderControls b={b} />
      <MainGrid b={b} thumbFor={thumbFor} />
      <Overlays b={b} />
    </div>
  );
}

function MainGrid({ b, thumbFor }: { b: Batch; thumbFor: (r: string) => Promise<string> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <PresetBar
          preset={b.s.preset} presetNames={b.s.presetNames} setPreset={b.setPreset}
          savePreset={(n) => void b.savePreset(n)} loadPreset={(n) => void b.loadPreset(n)} deletePreset={b.deletePreset}
        />
        <DestInfo b={b} />
      </div>
      <div className="space-y-4">
        <RefWarnings count={b.s.refWarnings.length} />
        <ScanTable
          rows={b.s.rows} toggle={b.toggle} selectAll={b.selectAll}
          copyPath={(rel) => copyPath(b, rel)} thumbFor={thumbFor}
        />
      </div>
    </div>
  );
}

function Overlays({ b }: { b: Batch }) {
  if (!b.s.busy && !b.s.toast) return null;
  return (
    <>
      {b.s.busy && <BusyOverlay msg={b.s.busy} cancel={b.cancel} />}
      {b.s.toast && (
        <div data-testid="batch-toast" className={`fixed left-1/2 z-50 toast-above-dock -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-xl ${b.s.toast.err ? "bg-rose-600" : "bg-emerald-600"}`}>
          {b.s.toast.msg}
        </div>
      )}
    </>
  );
}

type Batch = ReturnType<typeof useBatch>;

function HeaderControls({ b }: { b: Batch }) {
  const selected = b.s.rows.filter((r) => r.selected).length;
  return (
    <section className="panel flex flex-wrap items-center gap-2">
      <button data-testid="batch-root" className="btn-primary" onClick={() => void b.chooseRoot()}>
        {b.s.rootName ? `Root: ${b.s.rootName}` : "Choose source folder…"}
      </button>
      <button data-testid="batch-refresh" className="btn-ghost" onClick={() => void b.refresh()}>↺ Rescan</button>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-slate-400">{selected} selected</span>
        {b.s.busy
          ? <button data-testid="batch-cancel" className="btn-ghost" onClick={b.cancel}>✕ Stop</button>
          : <button data-testid="batch-process" className="btn-primary" disabled={!selected} onClick={() => void b.run()}>▶ Split selected</button>}
      </div>
    </section>
  );
}

function DestInfo({ b }: { b: Batch }) {
  const custom = b.s.preset.destMode === "custom" && b.s.destName;
  return (
    <section className="panel space-y-2">
      <h3 className="panel-title">Output</h3>
      <p className="text-sm text-slate-400">
        {custom
          ? <>Custom destination: <b className="text-slate-200">{b.s.destName}</b></>
          : <>Auto: <b className="text-slate-200">{b.s.rootName || "<folder>"}/_split_output</b></>}
      </p>
      <p className="text-xs text-slate-500">Grouped as YYYY-MM / YYYY-MM-DD_HH-mm-ss, source hierarchy preserved, never overwritten.</p>
      <div className="flex gap-2">
        <button data-testid="batch-dest" className="btn-ghost" onClick={() => void b.chooseDest()}>Choose destination…</button>
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

/** Honest substitute for "Open in File Explorer" (browsers cannot open the OS file manager). */
function copyPath(b: Batch, relPath: string): void {
  const full = `${b.s.rootName}/${relPath}`;
  void navigator.clipboard?.writeText(full);
  b.say(`Path copied: ${full} — browsers cannot open File Explorer, paste it there`);
}
