// regenprompt.ts — which text ONE request carries (design 2026-10-09, §1/D5):
// a solo regeneration with the option armed and a preset resolved sends the
// icon's current SVG code + the preset's words + the title contract; every
// other request carries today's prompt. A version whose file cannot be read
// downgrades to the main prompt and names itself (RULE 4) — a regeneration
// that cannot show its current code is a first generation.

import { batchPrompt, singlePrompt } from "../lib/svgprompt";
import { lastGenerated, regenPrompt } from "../lib/regensvg";
import { readSvgText } from "./svgfiles";
import type { ManifestItem } from "../lib/svgbatch";
import type { DirHandleLike } from "../lib/fs";
import type { PairMeta } from "../lib/pairmeta";
import type { SvgSource } from "./sources";

export interface RegenArgs {
  enabled: boolean;
  presetText: string | null;
}

/** Everything the text decision reads, narrowed so the rule stays testable. */
export interface PromptCall {
  root: DirHandleLike;
  mainPrompt: string;
  regen: RegenArgs | undefined;
  metas: Map<string, PairMeta | null>;
  items: readonly SvgSource[];
  manifest: readonly ManifestItem[];
  /** Where a downgrade reason lands — the run's problems, never silent. */
  note: (line: string) => void;
}

export async function promptForCall(c: PromptCall): Promise<string> {
  const item = c.items.length === 1 ? c.items[0] : null;
  if (c.regen?.enabled === true && c.regen.presetText !== null && item !== null && item.solo === true) {
    const code = await currentCode(c, item);
    if (code !== null) return regenPrompt(c.regen.presetText, code, item.name);
    c.note(`${item.name}: regenerate skipped — its current SVG could not be read, so the main prompt goes`);
  }
  return c.items.length === 1
    ? singlePrompt(c.mainPrompt, c.items[0].stem)
    : batchPrompt(c.mainPrompt, c.manifest);
}

/** The newest generated version's code for a solo item, or null when unreadable. */
async function currentCode(c: PromptCall, item: SvgSource): Promise<string | null> {
  const version = lastGenerated((c.metas.get(item.id) ?? null)?.versions ?? []);
  if (version === null) return null;
  return readSvgText(c.root, version.svgPath);
}
