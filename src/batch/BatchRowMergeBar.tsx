// BatchRowMergeBar.tsx — one row's merge distance: the value the slider is ON
// (live, RULE 24) plus Apply and Reset. Four lanes in a grid inside a floored
// Detection column, so the controls can never stack (2026-10-13).

import { memo, useCallback, useEffect, useState } from "react";

export interface BatchRowMergeBarProps {
  relPath: string;
  globalFrac: number | null;
  overrideFrac: number | null | undefined;
  onApply: (value: number) => void;
  onReset: () => void;
}

/** What this row shows: the slider's own value, and whether it is what the row uses. */
export function mergeLabel(local: number, effective: number | null, hasOverride: boolean): string {
  if (local !== (effective ?? 0)) return `${local.toFixed(4)} · not applied`;
  if (effective == null) return "auto";
  return `${effective.toFixed(4)} · ${hasOverride ? "overridden" : "global"}`;
}

/** The slider's value as a merge fraction, clamped to the control's range. */
export function sliderFrac(e: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>): number {
  const v = Number((e.target as HTMLInputElement).value);
  return Math.min(0.15, Math.max(0, Number.isFinite(v) ? v : 0));
}

function useLocalFrac(effective: number | null) {
  const [local, setLocal] = useState<number>(() => effective ?? 0);
  useEffect(() => {
    setLocal(effective ?? 0);
  }, [effective]);
  return [local, setLocal] as const;
}

function Inner({ relPath, globalFrac, overrideFrac, onApply, onReset }: BatchRowMergeBarProps) {
  const hasOverride = overrideFrac !== undefined;
  const effective = hasOverride ? (overrideFrac as number | null) : globalFrac;
  const [local, setLocal] = useLocalFrac(effective);
  const label = mergeLabel(local, effective, hasOverride);
  const onSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setLocal(sliderFrac(e)), [setLocal]);
  const apply = useCallback(() => onApply(local), [local, onApply]);
  return (
    <div className="batch-merge-bar" data-testid={`batch-row-merge-bar-${relPath}`}>
      <span className="batch-merge-value" title={`Merge distance ${label}`} data-testid={`batch-row-merge-label-${relPath}`}>{label}</span>
      <input type="range" min={0} max={0.15} step={0.0025} value={local} onChange={onSlider} onInput={onSlider as never} className="batch-merge-slider" aria-label={`Merge distance for ${relPath}`} data-testid={`batch-row-merge-slider-${relPath}`} />
      <button type="button" className="btn-mini batch-merge-btn" disabled={local === (effective ?? 0)} data-testid={`batch-row-merge-apply-${relPath}`} onClick={apply}>Apply</button>
      <button type="button" className="btn-ghost batch-merge-btn" disabled={!hasOverride} data-testid={`batch-row-merge-reset-${relPath}`} onClick={onReset}>↺ Reset</button>
    </div>
  );
}

export default memo(Inner);
