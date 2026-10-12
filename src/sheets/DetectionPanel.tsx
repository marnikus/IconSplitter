// DetectionPanel.tsx — merge distance control for active sheet

type ActiveLite = { id: string; boxes: unknown[]; usedFrac: number; manual: boolean };

type Props = {
  active: ActiveLite | null;
  onRedetect: (id: string, v: number | null) => void;
};

export default function DetectionPanel({ active, onRedetect }: Props) {
  if (!active) return null;
  return (
    <section className="panel">
      <h3 className="panel-title">Detection</h3>
      <div className="mb-1 flex justify-between text-sm">
        <span>Merge distance</span>
        <span className="text-slate-400">{active.manual ? "manual" : "auto"}</span>
      </div>
      <input data-testid="merge-slider" type="range" min={0} max={0.15} step={0.0025} value={active.usedFrac} onChange={(e) => onRedetect(active.id, +e.target.value)} className="w-full accent-indigo-500" />
      <p className="mt-2 text-xs text-slate-400">
        Lower = split loose parts into separate icons. Higher = merge parts that are further apart. Found <b className="text-slate-200">{active.boxes.length}</b> icon{active.boxes.length === 1 ? "" : "s"}.
      </p>
      <button data-testid="merge-reset" disabled={!active.manual} onClick={() => onRedetect(active.id, null)} className="btn-ghost mt-3 w-full">↺ Reset to auto</button>
    </section>
  );
}
