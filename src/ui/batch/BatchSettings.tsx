// BatchSettings.tsx owns batch tuning: scan rules, split, naming,
// selection, duplicates. One control per decision (RULE 10).

import { useState } from "react";
import { BATCH_SIZES, isOutputDirName, isVariationPrefix, normalizeExtensions, type BatchSettings, type DuplicateRules, type NamingRules, type ScanRules, type SelectionPrefs, type SplitSettings } from "../../batch/presets";
import type { Say } from "./scanFlow";

interface Props {
  settings: BatchSettings;
  say: Say;
  onChange: (s: BatchSettings) => void;
}

function withScan(s: BatchSettings, scan: Partial<ScanRules>): BatchSettings {
  return { ...s, scan: { ...s.scan, ...scan } };
}

function withSplit(s: BatchSettings, split: Partial<SplitSettings>): BatchSettings {
  return { ...s, split: { ...s.split, ...split } };
}

function withNaming(s: BatchSettings, naming: Partial<NamingRules>): BatchSettings {
  return { ...s, naming: { ...s.naming, ...naming } };
}

function withSelection(s: BatchSettings, selection: Partial<SelectionPrefs>): BatchSettings {
  return { ...s, selection: { ...s.selection, ...selection } };
}

function withDuplicates(s: BatchSettings, duplicates: Partial<DuplicateRules>): BatchSettings {
  return { ...s, duplicates: { ...s.duplicates, ...duplicates } };
}

function TextSetting(props: { testid: string; label: string; value: string; say: Say; onCommit: (v: string) => void; valid: (v: string) => boolean }) {
  const [draft, setDraft] = useState(props.value);
  return (
    <label className="block text-sm">
      <span className="mb-1 block">{props.label}</span>
      <input
        data-testid={props.testid}
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          if (props.valid(v)) props.onCommit(v);
        }}
        onBlur={() => {
          if (props.valid(draft)) setDraft(props.value);
          else {
            setDraft(props.value);
            props.say(`“${props.label}” reverted — invalid value`, true);
          }
        }}
        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm"
      />
    </label>
  );
}

function ScanRulesSection(props: Props) {
  const s = props.settings;
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Scan rules</p>
      <TextSetting key={s.scan.includeExtensions.join()} testid="batch-extensions" label="Image extensions (comma separated)" value={s.scan.includeExtensions.join(", ")} say={props.say} valid={(v) => normalizeExtensions(v).length > 0} onCommit={(v) => props.onChange(withScan(s, { includeExtensions: normalizeExtensions(v) }))} />
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input data-testid="batch-use-hash" type="checkbox" checked={s.scan.useContentHash} onChange={(e) => props.onChange(withScan(s, { useContentHash: e.target.checked }))} className="h-4 w-4 accent-indigo-500" />
        Content hash for change detection
      </label>
    </div>
  );
}

function MergeControl(props: { mergeFrac: number | null; onPick: (mergeFrac: number | null) => void }) {
  const auto = props.mergeFrac === null;
  const shown = props.mergeFrac ?? 0.05;
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input data-testid="batch-merge-auto" type="checkbox" checked={auto} onChange={(e) => props.onPick(e.target.checked ? null : 0.05)} className="h-4 w-4 accent-indigo-500" />
        Auto merge distance
      </label>
      {!auto && (
        <label className="block text-sm">
          <div className="mb-1 flex justify-between"><span>Merge distance</span><span className="text-slate-400">{shown.toFixed(4)}</span></div>
          <input data-testid="batch-merge" type="range" min={0} max={0.15} step={0.0025} value={shown} onChange={(e) => props.onPick(+e.target.value)} className="w-full accent-indigo-500" />
        </label>
      )}
    </div>
  );
}

function SplitSection(props: Props) {
  const s = props.settings;
  const sp = s.split;
  return (
    <div className="space-y-3 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Split</p>
      <label className="block text-sm">
        <div className="mb-1 flex justify-between"><span>Padding on each side</span><span className="text-slate-400">{sp.padding}%</span></div>
        <input data-testid="batch-padding" type="range" min={0} max={25} value={sp.padding} onChange={(e) => props.onChange(withSplit(s, { padding: +e.target.value }))} className="w-full accent-indigo-500" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block">Square size</span>
        <select data-testid="batch-size" value={sp.size} onChange={(e) => props.onChange(withSplit(s, { size: +e.target.value }))} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          {BATCH_SIZES.map((v) => (
            <option key={v} value={v}>{v === 0 ? "Native (auto)" : `${v} × ${v}`}</option>
          ))}
        </select>
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input data-testid="batch-transparent" type="checkbox" checked={sp.transparent} onChange={(e) => props.onChange(withSplit(s, { transparent: e.target.checked }))} className="h-4 w-4 accent-indigo-500" />
        Transparent background
      </label>
      <MergeControl mergeFrac={sp.mergeFrac} onPick={(mergeFrac) => props.onChange(withSplit(s, { mergeFrac }))} />
    </div>
  );
}

function NamingSection(props: Props) {
  const s = props.settings;
  return (
    <div className="space-y-3 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Naming</p>
      <TextSetting key={s.naming.outputDirName} testid="batch-output-dir" label="Output folder name" value={s.naming.outputDirName} say={props.say} valid={isOutputDirName} onCommit={(v) => props.onChange(withNaming(s, { outputDirName: v }))} />
      <TextSetting key={s.duplicates.variationPrefix} testid="batch-variation-prefix" label="Duplicate variation prefix" value={s.duplicates.variationPrefix} say={props.say} valid={isVariationPrefix} onCommit={(v) => props.onChange(withDuplicates(s, { variationPrefix: v }))} />
    </div>
  );
}

function SelectionSection(props: Props) {
  const s = props.settings;
  return (
    <div className="space-y-3 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selection</p>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input data-testid="batch-auto-select" type="checkbox" checked={s.selection.autoSelectNew} onChange={(e) => props.onChange(withSelection(s, { autoSelectNew: e.target.checked }))} className="h-4 w-4 accent-indigo-500" />
        Auto-select new images
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input data-testid="batch-keep-missing" type="checkbox" checked={s.selection.keepMissingInList} onChange={(e) => props.onChange(withSelection(s, { keepMissingInList: e.target.checked }))} className="h-4 w-4 accent-indigo-500" />
        Keep missing files in the list
      </label>
    </div>
  );
}

export default function BatchSettings(props: Props) {
  return (
    <section className="panel">
      <h3 className="panel-title">Batch settings</h3>
      <div className="space-y-4">
        <ScanRulesSection settings={props.settings} say={props.say} onChange={props.onChange} />
        <SplitSection settings={props.settings} say={props.say} onChange={props.onChange} />
        <NamingSection settings={props.settings} say={props.say} onChange={props.onChange} />
        <SelectionSection settings={props.settings} say={props.say} onChange={props.onChange} />
      </div>
    </section>
  );
}
