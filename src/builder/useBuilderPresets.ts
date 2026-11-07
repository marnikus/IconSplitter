// useBuilderPresets.ts — saving and restoring a whole sheet (design §4.2).
//
// Applying a preset is a deliberate replacement of what is on screen, so it goes
// through the SAME apply path as every other mutation (state/apply) and lands as one
// undoable step. A slot naming an icon the library no longer has becomes a hole in
// place — never silently substituted with a different icon, which would make the
// restored sheet a different sheet.
//
// The seed travels with the preset, so applying it reproduces the selection it was
// saved with rather than re-rolling it.

import { useCallback, useState } from "react";
import { SHIPPED_PRESETS, applyPreset, presetFromSheet, presetNameOf, type BuilderPreset } from "../lib/builder/preset";
import { deleteUserPreset, loadUserPresets, saveUserPreset } from "./presetstore";
import { applyBuilderConfig, applyBuilderSelection, applyBuilderSeed } from "../state/apply";

export interface BuilderPresets {
  builtin: readonly BuilderPreset[];
  user: BuilderPreset[];
  name: string;
  setName: (name: string) => void;
  /** The name the sheet on screen was last saved/applied as ("" when unnamed). */
  current: string;
  save: (sheet: SheetSnapshot) => void;
  apply: (preset: BuilderPreset, known: readonly string[]) => void;
  remove: (name: string) => void;
}

/** What a preset is made of: the design and the selection that fills it. */
export interface SheetSnapshot {
  config: BuilderPreset["config"];
  selection: { slots: (string | null)[]; locked: string[]; seed: number };
}

/** The shipped list plus the user's own, and the four actions over them. */
export function useBuilderPresets(): BuilderPresets {
  const [user, setUser] = useState<BuilderPreset[]>(() => loadUserPresets());
  const [name, setName] = useState("");
  const [current, setCurrent] = useState("");
  const save = useCallback((sheet: SheetSnapshot) => {
    const preset = presetFromSheet(name, sheet);
    setUser(saveUserPreset(preset));
    setCurrent(presetNameOf(preset));
    setName("");
  }, [name]);
  const apply = useCallback((preset: BuilderPreset, known: readonly string[]) => {
    const sheet = applyPreset(preset, known);
    // One preset is three undoable facts; each goes through apply, so undo replays
    // them like any other change.
    applyBuilderConfig(sheet.config);
    applyBuilderSelection({ slots: sheet.selection.slots, locked: sheet.selection.locked });
    applyBuilderSeed({ seed: sheet.selection.seed });
    setCurrent(preset.name);
  }, []);
  const remove = useCallback((target: string) => setUser(deleteUserPreset(target)), []);
  return { builtin: SHIPPED_PRESETS, user, name, setName, current, save, apply, remove };
}
