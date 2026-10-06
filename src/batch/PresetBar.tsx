// PresetBar.tsx — preset controls (spec §3): save / save-as / load / delete,
// last-used restore happens in useBatch.boot. Thin view over useBatch actions.

import { useState } from "react";
import type { Preset } from "../lib/presets";

export interface PresetBarProps {
  preset: Preset;
  presetNames: string[];
  setPreset: (patch: Partial<Preset>) => void;
  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;
}

const SIZES = [
  { v: 0, l: "Native (auto)" }, { v: 128, l: "128 × 128" }, { v: 256, l: "256 × 256" },
  { v: 512, l: "512 × 512" }, { v: 1024, l: "1024 × 1024" }, { v: 2048, l: "2048 × 2048" },
];

export default function PresetBar(props: PresetBarProps) {
  const [name, setName] = useState(props.preset.name);
  return (
    <section className="panel space-y-3" data-testid="preset-bar">
      <h3 className="panel-title">Presets</h3>
      <NameRow name={name} setName={setName} {...props} />
      <ListRow name={name} {...props} />
      <SplitControls preset={props.preset} setPreset={props.setPreset} />
    </section>
  );
}

function NameRow({ name, setName, preset, savePreset }: { name: string; setName: (v: string) => void } & PresetBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        data-testid="preset-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Preset name"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"
      />
      <button data-testid="preset-save" className="btn-ghost" onClick={() => savePreset(name.trim() || preset.name)}>
        Save
      </button>
    </div>
  );
}

function ListRow({ name, presetNames, loadPreset, deletePreset }: { name: string } & PresetBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        data-testid="preset-list"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"
        value=""
        onChange={(e) => e.target.value && loadPreset(e.target.value)}
      >
        <option value="">Load preset… ({presetNames.length} saved)</option>
        {presetNames.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button data-testid="preset-delete" className="btn-ghost" onClick={() => deletePreset(name.trim())}>
        Delete
      </button>
    </div>
  );
}

function SplitControls({ preset, setPreset }: { preset: Preset; setPreset: PresetBarProps["setPreset"] }) {
  const split = preset.split;
  const setSplit = (patch: Partial<Preset["split"]>) => setPreset({ split: { ...split, ...patch } });
  return (
    <div className="space-y-3 border-t border-white/10 pt-3 text-sm">
      <PaddingRow value={split.padding} onChange={(v) => setSplit({ padding: v })} />
      <SizeRow value={split.size} onChange={(v) => setSplit({ size: v })} />
      <TransparentRow value={split.transparent} onChange={(v) => setSplit({ transparent: v })} />
      <IgnoreRow value={preset.ignoreFolders} onChange={(v) => setPreset({ ignoreFolders: v })} />
    </div>
  );
}

function PaddingRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between">
        <span>Padding on each side</span>
        <span className="text-slate-400">{value}%</span>
      </div>
      <input
        data-testid="batch-padding" type="range" min={0} max={25} value={value}
        onChange={(e) => onChange(+e.target.value)} className="w-full accent-indigo-500"
      />
    </label>
  );
}

function SizeRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block">Square size</span>
      <select
        data-testid="batch-size" value={value} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2"
        onChange={(e) => onChange(+e.target.value)}
      >
        {SIZES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
      </select>
    </label>
  );
}

function TransparentRow({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        data-testid="batch-transparent" type="checkbox" checked={value}
        onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-indigo-500"
      />
      Transparent background
    </label>
  );
}

function IgnoreRow({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block">Ignored folders (comma separated)</span>
      <input
        data-testid="batch-ignore" value={value.join(", ")}
        onChange={(e) => onChange(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}
        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2"
      />
    </label>
  );
}
