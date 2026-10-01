// PresetBar.tsx owns preset controls: list, name, save, save-as, load,
// delete, load-last. Last-used preset is remembered on every save/load.

import type { Dispatch } from "react";
import { useState } from "react";
import { listPresetNames, presetFrom, readLastName, readPreset, removePreset, writePreset, type BatchSettings, type FolderMeta } from "../../batch/presets";
import type { BatchAction, FolderState } from "../../batch/reducer";
import { applyPreset } from "./presetFlow";
import type { Say } from "./scanFlow";

interface Props {
  settings: BatchSettings;
  folders: FolderState;
  dispatch: Dispatch<BatchAction>;
  say: Say;
}

interface PresetOps {
  settings: BatchSettings;
  folders: FolderState;
  dispatch: Dispatch<BatchAction>;
  say: Say;
  refresh: () => void;
}

function metaOf(f: FolderState): FolderMeta {
  return { sourceName: f.sourceName, destName: f.destName, useCustomDest: f.useCustomDest };
}

function storePreset(ops: PresetOps, name: string): void {
  const ok = writePreset(presetFrom(name, metaOf(ops.folders), ops.settings, new Date().toISOString()));
  ops.say(ok ? `Preset “${name}” saved` : "Could not save preset (storage blocked)", !ok);
  if (ok) ops.refresh();
}

function saveAsPreset(ops: PresetOps, name: string): void {
  const clean = name.trim();
  if (!clean) {
    ops.say("Type a preset name first", true);
    return;
  }
  storePreset(ops, clean);
}

function savePickedPreset(ops: PresetOps, picked: string): void {
  if (!picked) {
    ops.say("Pick a preset from the list first", true);
    return;
  }
  storePreset(ops, picked);
}

function loadPickedPreset(ops: PresetOps, picked: string): void {
  if (!picked) {
    ops.say("Pick a preset from the list first", true);
    return;
  }
  const p = readPreset(picked);
  if (!p) {
    ops.say(`Preset “${picked}” is gone or corrupt`, true);
    ops.refresh();
    return;
  }
  applyPreset(ops.dispatch, ops.say, p);
}

function deletePickedPreset(ops: PresetOps, picked: string, unpick: () => void): void {
  if (!picked) {
    ops.say("Pick a preset from the list first", true);
    return;
  }
  const ok = removePreset(picked);
  ops.say(ok ? `Preset “${picked}” deleted` : "Could not delete preset", !ok);
  if (ok) {
    unpick();
    ops.refresh();
  }
}

function loadLastPreset(ops: PresetOps): void {
  const name = readLastName();
  const p = name ? readPreset(name) : null;
  if (!p) {
    ops.say("No last-used preset yet", true);
    return;
  }
  applyPreset(ops.dispatch, ops.say, p);
}

export default function PresetBar(props: Props) {
  const [name, setName] = useState("");
  const [names, setNames] = useState<string[]>(() => listPresetNames());
  const [picked, setPicked] = useState("");
  const ops: PresetOps = { settings: props.settings, folders: props.folders, dispatch: props.dispatch, say: props.say, refresh: () => setNames(listPresetNames()) };
  return (
    <section className="panel">
      <h3 className="panel-title">Presets</h3>
      <select data-testid="batch-preset-list" value={picked} onChange={(e) => setPicked(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
        <option value="">— pick a preset —</option>
        {names.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <div className="mt-2 flex flex-wrap gap-2">
        <button data-testid="batch-preset-load" onClick={() => loadPickedPreset(ops, picked)} className="btn-mini">Load</button>
        <button data-testid="batch-preset-save" onClick={() => savePickedPreset(ops, picked)} className="btn-mini">Save</button>
        <button data-testid="batch-preset-delete" onClick={() => deletePickedPreset(ops, picked, () => setPicked(""))} className="btn-mini">Delete</button>
        <button data-testid="batch-preset-load-last" onClick={() => loadLastPreset(ops)} className="btn-mini">Load last</button>
      </div>
      <input data-testid="batch-preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name" className="mt-3 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      <button data-testid="batch-preset-save-as" onClick={() => saveAsPreset(ops, name)} className="btn-ghost mt-2 w-full">Save as new</button>
    </section>
  );
}
