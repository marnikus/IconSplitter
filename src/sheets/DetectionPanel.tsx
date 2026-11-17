// DetectionPanel.tsx — merge distance for the active sheet, or for every
// checked sheet when the active one is checked. Slider and typed number are
// two views of one value, shown as % of the sheet's longest side.
import { fracToPercent, MERGE_MAX_FRAC, percentToFrac } from "../lib/sheetsel";
import DraftNumberInput from "../ui/DraftNumberInput";

type ActiveLite = { usedFrac: number; manual: boolean; boxes: unknown[]; img: { naturalWidth: number; naturalHeight: number } };

export interface DetectionPanelProps {
  active: ActiveLite | null;
  /** Sheets a change reaches (≥ 1) and the icons currently found across them. */
  targets: number;
  found: number;
  onRedetect: (frac: number | null) => void;
}

export default function DetectionPanel({ active, targets, found, onRedetect }: DetectionPanelProps) {
  if (!active) return null;
  const pct = fracToPercent(active.usedFrac);
  const px = Math.round(active.usedFrac * Math.max(active.img.naturalWidth, active.img.naturalHeight));
  return (
    <section className="panel">
      <h3 className="panel-title">Detection</h3>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span>Merge distance</span>
        <span className="text-slate-400"><b data-testid="merge-value" className="text-slate-200">{pct.toFixed(2)}%</b> ≈ {px} px · {active.manual ? "manual" : "auto"}</span>
      </div>
      <div className="flex items-center gap-2">
        <input data-testid="merge-slider" aria-label="Merge distance" type="range" min={0} max={MERGE_MAX_FRAC} step={0.0025} value={active.usedFrac}
          onChange={(e) => onRedetect(+e.target.value)} className="min-w-0 flex-1 accent-indigo-500" />
        <span className="w-24 shrink-0">
          <DraftNumberInput testid="merge-input" label="Merge distance in percent" value={pct} min={0} max={MERGE_MAX_FRAC * 100} step={0.25}
            placeholder="auto" onCommit={(v) => onRedetect(v === null ? null : percentToFrac(v))} />
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Lower = split loose parts into separate icons. Higher = merge parts that are further apart. Type a % (0–{MERGE_MAX_FRAC * 100}) and press Enter; empty = auto.
      </p>
      <p data-testid="merge-scope" className="mt-1 text-xs text-slate-400">
        {targets > 1 ? <>Applies to <b className="text-slate-200">{targets} checked sheets</b> · </> : null}
        Found <b className="text-slate-200">{found}</b> icon{found === 1 ? "" : "s"}.
      </p>
      <button data-testid="merge-reset" disabled={!active.manual} onClick={() => onRedetect(null)} className="btn-ghost mt-3 w-full">↺ Reset to auto</button>
    </section>
  );
}
