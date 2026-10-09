// presetops.ts — the ONE rule for a prompt window's saved presets (2026-10-09):
// pick, Quick load, Delete and Save as. Shared by the metadata prompt and the
// Generate SVG prompt, so the save feature exists once. Pure over a getter and
// an io; every write goes through the store and the dispatch, so the stored list,
// the editor and the picked name cannot disagree (RULE 24).

import { useMemo, useRef } from "react";
import { findPreset, removePreset, upsertPreset, validPresetName, type PromptPreset } from "../lib/promptpresets";
import type { PresetStore } from "../state/presetstore";

/** The three state changes a preset gesture can make; each window maps them to its reducer. */
export type PresetEvent =
  | { type: "prompt"; prompt: string }
  | { type: "presets"; presets: PromptPreset[] }
  | { type: "preset-pick"; name: string };

export interface PresetModel {
  prompt: string;
  presets: readonly PromptPreset[];
  presetPick: string;
}

export interface PresetIo {
  store: PresetStore;
  dispatch: (e: PresetEvent) => void;
  say: (msg: string, err?: boolean) => void;
}

export interface PresetActions {
  pickPreset: (name: string) => void;
  quickLoadPreset: () => void;
  savePresetAs: (name: string) => void;
  deletePreset: () => void;
}

/** The actions over whatever the getter returns now — no stale closure. */
export function presetActionsOf(get: () => { m: PresetModel; io: PresetIo }): PresetActions {
  return {
    pickPreset: (name) => get().io.dispatch({ type: "preset-pick", name }),
    quickLoadPreset: () => quickLoad(get()),
    savePresetAs: (name) => saveAs(get(), name),
    deletePreset: () => remove(get()),
  };
}

type Ctx = { m: PresetModel; io: PresetIo };

/** The editor becomes the picked preset — nothing else changes. */
function quickLoad(c: Ctx): void {
  const preset = findPreset(c.m.presets, c.m.presetPick);
  if (preset === null) return c.io.say("Pick a saved prompt first", true);
  c.io.dispatch({ type: "prompt", prompt: preset.text });
  c.io.say(`Prompt preset “${preset.name}” loaded into the editor`);
}

/** Save as: a named snapshot of exactly the text on screen. */
function saveAs(c: Ctx, raw: string): void {
  const name = validPresetName(raw);
  if (name === null) return c.io.say("Give the prompt a name (1–60 characters) before saving it", true);
  const presets = upsertPreset(c.m.presets, name, c.m.prompt);
  c.io.store.save(presets);
  c.io.dispatch({ type: "presets", presets });
  c.io.dispatch({ type: "preset-pick", name });
  c.io.say(`Prompt preset “${name}” saved on this device`);
}

function remove(c: Ctx): void {
  const name = c.m.presetPick;
  if (name === "") return c.io.say("Pick a saved prompt to delete", true);
  const presets = removePreset(c.m.presets, name);
  c.io.store.save(presets);
  c.io.dispatch({ type: "presets", presets });
  c.io.dispatch({ type: "preset-pick", name: "" });
  c.io.say(`Prompt preset “${name}” deleted — the editor keeps its text`);
}

/** The React face: the latest model and io are read at call time, the actions never change. */
export function usePresetActions(m: PresetModel, io: PresetIo): PresetActions {
  const latest = useRef({ m, io });
  latest.current = { m, io };
  return useMemo(() => presetActionsOf(() => latest.current), []);
}
