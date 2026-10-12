// BatchPresetRow.tsx — compact responsive row for presets + split controls

import { useState } from "react";
import type { Preset } from "../lib/presets";

export interface BatchPresetRowProps {
  preset: Preset; presetNames: string[];
  setPreset: (patch: Partial<Preset>) => void;
  savePreset: (name: string) => void; loadPreset: (name: string) => void; deletePreset: (name: string) => void;
}

const SIZES = [{ v: 0, l: "Native (auto)" }, { v: 128, l: "128 × 128" }, { v: 256, l: "256 × 256" }, { v: 512, l: "512 × 512" }, { v: 1024, l: "1024 × 1024" }, { v: 2048, l: "2048 × 2048" }];

export default function BatchPresetRow(p: BatchPresetRowProps) {
  const [name, setName] = useState(p.preset.name);
  return (
    <section className="panel" data-testid="preset-bar">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="panel-title !mb-0">Presets</h3>
        <PresetNameInput name={name} setName={setName} />
        <PresetActions p={p} name={name} />
        <span className="h-6 w-px bg-white/10" aria-hidden="true" />
        <SplitControls preset={p.preset} setPreset={p.setPreset} />
      </div>
    </section>
  );
}

function PresetNameInput({ name, setName }: { name: string; setName: (v: string) => void }) {
  return <input data-testid="preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name" className="w-36 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm" />;
}
function PresetActions({ p, name }: { p: BatchPresetRowProps; name: string }) {
  return (
    <>
      <button data-testid="preset-save" className="btn-ghost" onClick={() => p.savePreset(name.trim() || p.preset.name)}>Save</button>
      <select data-testid="preset-list" className="w-48 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm" value="" onChange={(e) => e.target.value && p.loadPreset(e.target.value)}>
        <option value="">Load preset… ({p.presetNames.length} saved)</option>
        {p.presetNames.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button data-testid="preset-delete" className="btn-ghost" onClick={() => p.deletePreset(name.trim())}>Delete</button>
    </>
  );
}
function SplitControls({ preset, setPreset }: { preset: Preset; setPreset: BatchPresetRowProps["setPreset"] }) {
  return (
    <>
      <PaddingMini value={preset.split.padding} onChange={(v) => setPreset({ split: { ...preset.split, padding: v } })} />
      <SizeMini value={preset.split.size} onChange={(v) => setPreset({ split: { ...preset.split, size: v } })} />
      <TransparentMini value={preset.split.transparent} onChange={(v) => setPreset({ split: { ...preset.split, transparent: v } })} />
      <IgnoreMini value={preset.ignoreFolders} onChange={(v) => setPreset({ ignoreFolders: v })} />
    </>
  );
}
function PaddingMini({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <label className="flex items-center gap-2 text-sm"><span className="text-xs text-slate-400">Padding {value}%</span><input data-testid="batch-padding" type="range" min={0} max={25} value={value} onChange={(e) => onChange(+e.target.value)} className="w-24 accent-indigo-500" /></label>;
}
function SizeMini({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <label className="flex items-center gap-2 text-sm"><span className="text-xs text-slate-400">Size</span><select data-testid="batch-size" value={value} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-sm" onChange={(e) => onChange(+e.target.value)}>{SIZES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select></label>;
}
function TransparentMini({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex cursor-pointer items-center gap-1 text-sm"><input data-testid="batch-transparent" type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-indigo-500" /><span className="text-xs">Transparent</span></label>;
}
function IgnoreMini({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return <label className="flex items-center gap-2 text-sm"><span className="text-xs text-slate-400">Ignore</span><input data-testid="batch-ignore" value={value.join(", ")} onChange={(e) => onChange(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} placeholder="_split_output" className="w-32 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-sm" /></label>;
}
