// BatchPanel.tsx — batch feature layout (spec §1–§6): folder pickers, preset
// bar, review window, process controls, honest status surfaces (RULE 2/4).

import { useBatch } from "./useBatch";
import PresetBar from "./PresetBar";
import ScanTable from "./ScanTable";
import { BusyOverlay, Toast } from "../ui/Overlays";
import { useThumbnails, type Thumbs } from "../ui/useThumbnails";

export default function BatchPanel() {
  const b = useBatch();
  const thumbs = useThumbnails(b.thumbUrl);
  return (
    <div className="space-y-4">
      {!b.supported && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="fs-warning">
          Batch mode needs Chrome or Edge (File System Access API). The single-sheet tool above works everywhere.
        </p>
      )}
      <HeaderControls b={b} />
      <MainGrid b={b} thumbs={thumbs} />
      <Overlays b={b} />
    </div>
  );
}

function MainGrid({ b, thumbs }: { b: Batch; thumbs: Thumbs }) {
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
          copyPath={(rel) => copyPath(b, rel)} thumbs={thumbs}
        />
      </div>
    </div>
  );
}

function Overlays({ b }: { b: Batch }) {
  if (!b.s.busy && !b.s.toast) return null;
  return (
    <>
      {b.s.busy && <BusyOverlay msg={b.s.busy} testid="batch-busy" onCancel={b.cancel} />}
      {b.s.toast && <Toast toast={b.s.toast} testid="batch-toast" />}
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

/** Honest substitute for "Open in File Explorer" (browsers cannot open the OS file manager). */
function copyPath(b: Batch, relPath: string): void {
  const full = `${b.s.rootName}/${relPath}`;
  void navigator.clipboard?.writeText(full);
  b.say(`Path copied: ${full} — browsers cannot open File Explorer, paste it there`);
}
