// BatchRowMergeBar.tsx — per-row merge distance with Apply/Reset, real-time value, one-row layout

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

  const updateLocal = useCallback((value: string) => {
    const v = Number(value);
    const clamped = Number.isFinite(v) ? Math.min(0.15, Math.max(0, v)) : 0;
    setLocal(clamped);
  }, []);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => updateLocal(e.target.value), [updateLocal]);
  const onInput = useCallback((e: React.FormEvent<HTMLInputElement>) => updateLocal((e.target as HTMLInputElement).value), [updateLocal]);
  const doApply = useCallback(() => onApply(relPath, local), [relPath, local, onApply]);
  const doReset = useCallback(() => onReset(relPath), [relPath, onReset]);

  return (
    <div className="flex w-fit min-w-[300px] max-w-full flex-nowrap items-center justify-center gap-2 mx-auto rounded-lg border border-white/10 bg-slate-900/40 px-2 py-1.5" data-testid={`batch-row-merge-bar-${relPath}`}>
      <span className="shrink-0 whitespace-nowrap text-[11px] font-medium">Detection</span>
      <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400" data-testid={`batch-row-merge-label-${relPath}`}>Merge {local.toFixed(4)}{hasOv ? " • overridden" : eff == null ? " (auto)" : ""}</span>
      <input type="range" min={0} max={0.15} step={0.0025} value={local} onChange={onChange} onInput={onInput} className="w-32 shrink-0 accent-indigo-500" data-testid={`batch-row-merge-slider-${relPath}`} />
      <button type="button" className="btn-mini shrink-0 whitespace-nowrap text-[11px]" data-testid={`batch-row-merge-apply-${relPath}`} onClick={doApply}>Apply</button>
      <button type="button" className="btn-ghost shrink-0 whitespace-nowrap text-[11px] disabled:opacity-40" data-testid={`batch-row-merge-reset-${relPath}`} disabled={!hasOv} onClick={doReset}>↺ Reset</button>
    </div>
  );
}

export default memo(Inner);
