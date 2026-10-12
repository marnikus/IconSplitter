// BatchRowMergeBar.tsx — per-row merge distance with Apply/Reset override

import { memo, useCallback, useEffect, useState } from "react";

export interface BatchRowMergeBarProps {
  relPath: string;
  globalFrac: number | null;
  overrideFrac: number | null | undefined;
  onApply: (relPath: string, value: number | null) => void;
  onReset: (relPath: string) => void;
}

function Inner({ relPath, globalFrac, overrideFrac, onApply, onReset }: BatchRowMergeBarProps) {
  const hasOv = overrideFrac !== undefined;
  const eff = hasOv ? (overrideFrac as number | null) : globalFrac;
  const [local, setLocal] = useState<number>(() => eff ?? 0);
  useEffect(() => { setLocal(eff ?? 0); }, [eff]);
  const onSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number((e.target as HTMLInputElement).value);
    setLocal(Math.min(0.15, Math.max(0, Number.isFinite(v) ? v : 0)));
  }, []);
  const doApply = useCallback(() => onApply(relPath, local), [relPath, local, onApply]);
  const doReset = useCallback(() => onReset(relPath), [relPath, onReset]);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-slate-900/40 px-2 py-1" data-testid={`batch-row-merge-bar-${relPath}`}>
      <span className="text-[11px] font-medium">Detection</span>
      <span className="text-[11px] text-slate-400" data-testid={`batch-row-merge-label-${relPath}`}>Merge {eff == null ? "auto" : eff.toFixed(4)}{hasOv ? " • overridden" : ""}</span>
      <input type="range" min={0} max={0.15} step={0.0025} value={local} onChange={onSlider} onInput={onSlider as never} className="w-24 accent-indigo-500" data-testid={`batch-row-merge-slider-${relPath}`} />
      <button type="button" className="btn-mini text-[11px]" data-testid={`batch-row-merge-apply-${relPath}`} onClick={doApply}>Apply</button>
      <button type="button" className="btn-ghost text-[11px] disabled:opacity-40" data-testid={`batch-row-merge-reset-${relPath}`} disabled={!hasOv} onClick={doReset}>↺ Reset</button>
    </div>
  );
}

export default memo(Inner);
