// promptactions.ts — the metadata prompt panel's actions (RULE 13/24): edit,
// reset to the documented default, pick a saved preset, Quick-load it, Delete it
// and Save as (with a name). Every action writes through promptstore, so the
// panel's state and the stored payload cannot disagree, and the prompt the ONE
// confirmed request carries is always exactly what the editor shows.

import { useCallback, useRef, type Dispatch } from "react";
import { DEFAULT_METADATA_PROMPT } from "../lib/upload/meta";
import { findPreset, removePreset, upsertPreset, validPresetName } from "../lib/upload/promptpresets";
import { savePresets } from "./promptstore";
import type { UploadAction, UploadModel } from "./statemodel";

/** Only what these actions need: the model, the dispatch and the one say line. */
export interface PromptCtx {
  m: UploadModel;
  dispatch: Dispatch<UploadAction>;
  say: (msg: string, err?: boolean) => void;
}

export interface PromptActions {
  setPrompt: (text: string) => void;
  resetPrompt: () => void;
  pickPreset: (name: string) => void;
  quickLoadPreset: () => void;
  savePresetAs: (name: string) => void;
  deletePreset: () => void;
}

export function usePromptActions(ctx: PromptCtx): PromptActions {
  const latest = useRef(ctx);
  latest.current = ctx;
  return {
    setPrompt: useCallback((text: string) => latest.current.dispatch({ type: "prompt", prompt: text }), []),
    resetPrompt: useCallback(() => resetOf(latest.current), []),
    pickPreset: useCallback((name: string) => latest.current.dispatch({ type: "preset-pick", name }), []),
    quickLoadPreset: useCallback(() => quickLoadOf(latest.current), []),
    savePresetAs: useCallback((name: string) => saveAsOf(latest.current, name), []),
    deletePreset: useCallback(() => deleteOf(latest.current), []),
  };
}

function resetOf(c: PromptCtx): void {
  c.dispatch({ type: "prompt", prompt: DEFAULT_METADATA_PROMPT });
  c.say("Metadata prompt reset to the default");
}

/** The editor becomes the picked preset — nothing else changes. */
function quickLoadOf(c: PromptCtx): void {
  const preset = findPreset(c.m.presets, c.m.presetPick);
  if (preset === null) return c.say("Pick a saved prompt first", true);
  c.dispatch({ type: "prompt", prompt: preset.text });
  c.say(`Prompt preset “${preset.name}” loaded into the editor`);
}

/** Save as: a named snapshot of exactly the text on screen. */
function saveAsOf(c: PromptCtx, raw: string): void {
  const name = validPresetName(raw);
  if (name === null) return c.say("Give the prompt a name (1–60 characters) before saving it", true);
  const presets = upsertPreset(c.m.presets, name, c.m.prompt);
  savePresets(presets);
  c.dispatch({ type: "presets", presets });
  c.dispatch({ type: "preset-pick", name });
  c.say(`Prompt preset “${name}” saved on this device`);
}

function deleteOf(c: PromptCtx): void {
  const name = c.m.presetPick;
  if (name === "") return c.say("Pick a saved prompt to delete", true);
  const presets = removePreset(c.m.presets, name);
  savePresets(presets);
  c.dispatch({ type: "presets", presets });
  c.dispatch({ type: "preset-pick", name: "" });
  c.say(`Prompt preset “${name}” deleted — the editor keeps its text`);
}
