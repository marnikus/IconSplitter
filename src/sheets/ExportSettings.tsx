// ExportSettings.tsx — padding, size, transparent controls
// One control per decision (RULE 10), pure props, no direct state.

import { SIZES } from "../lib/exportopts";

type Props = {
  padding: number;
  size: number;
  transparent: boolean;
  totalPx: number | null;
  onPad: (v: number) => void;
  onSize: (v: number) => void;
  onTransparent: (v: boolean) => void;
};

export default function ExportSettings(p: Props) {
  return (
    <section className="panel">
      <h3 className="panel-title">Export settings</h3>
      <PaddingControl padding={p.padding} onPad={p.onPad} />
      <SizeControl size={p.size} onSize={p.onSize} />
      <TransparentControl transparent={p.transparent} onTransparent={p.onTransparent} />
      {p.totalPx !== null && <TotalNote size={p.size} totalPx={p.totalPx} />}
    </section>
  );
}

function PaddingControl({ padding, onPad }: { padding: number; onPad: Props["onPad"] }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 flex justify-between"><span>Padding</span><span className="text-slate-400">{padding}%</span></div>
      <input data-testid="padding-slider" type="range" min={0} max={25} value={padding} onChange={(e) => onPad(+e.target.value)} className="w-full accent-indigo-500" />
    </label>
  );
}

function SizeControl({ size, onSize }: { size: number; onSize: Props["onSize"] }) {
  return (
    <label className="mt-4 block text-sm">
      <span className="mb-1 block">Square size</span>
      <select data-testid="size-select" value={size} onChange={(e) => onSize(+e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
        {SIZES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
      </select>
    </label>
  );
}

function TransparentControl({ transparent, onTransparent }: { transparent: boolean; onTransparent: Props["onTransparent"] }) {
  return (
    <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
      <input data-testid="transparent-checkbox" type="checkbox" checked={transparent} onChange={(e) => onTransparent(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
      Transparent background
    </label>
  );
}

function TotalNote({ size, totalPx }: { size: number; totalPx: number }) {
  return (
    <p className="mt-4 rounded-lg bg-white/5 p-2 text-xs text-slate-400">
      Every icon is centered in one shared square of <b className="text-slate-200">{size || Math.round(totalPx)} px</b>.
    </p>
  );
}
