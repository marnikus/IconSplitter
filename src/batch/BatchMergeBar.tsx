// BatchMergeBar.tsx — global merge distance slider + expected-icons gate field for Batch (preset-saved, Auto reset)

import { useCallback, useEffect, useState } from "react";
import type { Preset } from "../lib/presets";
import { clampMergeFrac } from "../lib/batchpreview";
import { clampExpectedIcons, DEFAULT_EXPECTED_ICONS } from "../lib/batchreview";

export interface BatchMergeBarProps {
  preset: Preset;
  setPreset: (patch: Partial<Preset>) => void;
}

function Label({ frac }: { frac: number | null }) {
  return (
    <span className="text-xs text-slate-400" data-testid="batch-merge-label">
      Merge {frac == null ? "auto" : frac.toFixed(4)}
    </span>
  );
}

function useLocalFrac(frac: number | null) {
  const [local, setLocal] = useState(frac ?? 0);
  useEffect(() => {
    setLocal(frac ?? 0);
  }, [frac]);
  return [local, setLocal] as const;
}

function Slider({ frac, onChange }: { frac: number | null; onChange: (v: number | null) => void }) {
  const [local, setLocal] = useLocalFrac(frac);
  const handle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      setLocal(v);
      onChange(v);
    },
    [onChange, setLocal],
  );
  return (
    <input
      data-testid="batch-merge-slider"
      type="range"
      min={0}
      max={0.15}
      step={0.0025}
      value={local}
      onChange={handle}
      className="w-40 accent-indigo-500"
    />
  );
}

function ResetBtn({ frac, onReset }: { frac: number | null; onReset: () => void }) {
  return (
    <button
      data-testid="batch-merge-reset"
      disabled={frac == null}
      onClick={onReset}
      className="btn-ghost text-xs disabled:opacity-40"
    >
      ↺ Reset to auto
    </button>
  );
}

function ExpectedField({ preset, setPreset }: BatchMergeBarProps) {
  const [local, setLocal] = useState(String(preset.expectedIcons));
  useEffect(() => { setLocal(String(preset.expectedIcons)); }, [preset.expectedIcons]);
  const commit = useCallback((raw: string) => {
    setLocal(raw);
    const n = Number(raw);
    if (raw !== "" && Number.isFinite(n)) setPreset({ expectedIcons: clampExpectedIcons(n) });
  }, [setPreset]);
  return (
    <span className="flex items-center gap-1.5" title="A preview approves an image only when it splits into exactly this many icons">
      <span className="text-sm font-medium">Expected icons</span>
      <input
        data-testid="batch-expected-icons"
        type="number" min={1} max={64} value={local}
        onChange={(e) => commit(e.target.value)}
        className="w-16 rounded border border-white/10 bg-slate-800 px-2 py-1 text-xs"
        aria-label="Expected icons per image"
      />
      {Number(local) !== preset.expectedIcons && Number.isFinite(Number(local)) && Number(local) !== 0 && (
        <span className="text-[11px] text-slate-500">clamped to {preset.expectedIcons}</span>
      )}
      {local === String(DEFAULT_EXPECTED_ICONS) && <span className="text-[11px] text-slate-500">(default)</span>}
    </span>
  );
}

export default function BatchMergeBar({ preset, setPreset }: BatchMergeBarProps) {
  const frac = preset.split.mergeFrac;
  const onChange = useCallback(
    (v: number | null) => {
      const c = v == null ? null : clampMergeFrac(v);
      setPreset({ split: { ...preset.split, mergeFrac: c ?? 0 } });
    },
    [preset, setPreset],
  );
  const onReset = useCallback(() => {
    setPreset({ split: { ...preset.split, mergeFrac: null } });
  }, [preset, setPreset]);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2" data-testid="batch-merge-bar">
      <span className="text-sm font-medium">Merge distance</span>
      <Label frac={frac} />
      <Slider frac={frac} onChange={onChange} />
      <ResetBtn frac={frac} onReset={onReset} />
      <span className="text-[11px] text-slate-500">Lower = split, Higher = merge</span>
      <ExpectedField preset={preset} setPreset={setPreset} />
    </div>
  );
}
