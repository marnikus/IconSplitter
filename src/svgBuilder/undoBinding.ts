// undoBinding.ts — the one applier the global history uses for builder config.
// The workspace stays mounted after its first visit, so undo/redo can restore
// a config even while another tab is active (RULE 12).
import { parseBuilderUndoPatch } from "../lib/svgBuilder/undo";
import type { BuilderUndoPatch } from "../lib/svgBuilder/types";

type ConfigApplier = (patch: BuilderUndoPatch) => boolean;

let applier: ConfigApplier | null = null;

export function bindBuilderConfigApplier(next: ConfigApplier): () => void {
  applier = next;
  return () => { if (applier === next) applier = null; };
}

export function applyBuilderConfig(value: unknown): boolean {
  const patch = parseBuilderUndoPatch(value);
  return patch !== null && applier !== null && applier(patch);
}
