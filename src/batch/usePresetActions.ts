// usePresetActions.ts — the preset actions of the Batch tab (spec §3): patch
// the form, save under a name, load, delete. Presets live in localStorage and
// the folders a preset used live beside it in IndexedDB (batch/store.ts); this
// module only sequences them and tells the user what happened.

import { useCallback } from "react";
import type { Preset } from "../lib/presets";
import { loadPresets, saveHandles, saveLastName, savePresets } from "./store";
import type { Ctx, Setter } from "./useBatch";

type Say = (msg: string, err?: boolean) => void;
/** Re-opens the folders a preset used — owned by useBatch, which also scans. */
type Apply = (ctx: Ctx, setS: Setter, preset: Preset) => Promise<void>;

export function usePresetActions(ctx: Ctx, setS: Setter, say: Say, applyHandles: Apply) {
  const setPreset = useCallback((patch: Partial<Preset>) => {
    setS((p) => ({ ...p, preset: { ...p.preset, ...patch } }));
  }, [setS]);

  const savePreset = useCallback(async (name: string) => {
    const named = { ...ctx.state.current.preset, name };
    savePresets([...loadPresets().filter((p) => p.name !== name), named]);
    saveLastName(name);
    await saveHandles(name, { source: ctx.root.current ?? undefined, dest: ctx.dest.current ?? undefined });
    setS((p) => ({ ...p, preset: named, presetNames: loadPresets().map((x) => x.name) }));
    say(`Preset “${name}” saved`);
  }, [ctx, setS, say]);

  const loadPreset = useCallback(async (name: string) => {
    const found = loadPresets().find((p) => p.name === name);
    if (!found) return say(`Preset “${name}” not found`, true);
    saveLastName(name);
    await applyHandles(ctx, setS, found);
  }, [ctx, setS, say, applyHandles]);

  const deletePreset = useCallback((name: string) => {
    savePresets(loadPresets().filter((p) => p.name !== name));
    setS((p) => ({ ...p, presetNames: loadPresets().map((x) => x.name) }));
    say(`Preset “${name}” deleted`);
  }, [setS, say]);

  return { setPreset, savePreset, loadPreset, deletePreset };
}
