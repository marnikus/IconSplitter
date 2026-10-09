// regensvg.ts — the v2 regeneration rule, pure (design 2026-10-09, D1): the
// option's stored shape, its parse/serialize pair (RULE 13), the text of a v2
// request, and the "which version is the current code" pick. No IO, no React —
// the store that keeps the option is svg/regenstore, the splitter that honours
// the solo mark is lib/svgbatch, and the run that reads the code is svg/runbatch.
//
// Why a second generation mode at all: a first generation starts from the
// reference image alone; a regeneration can hand the provider the icon it
// already produced, so the request improves what is there instead of redrawing
// it from zero. The user chose which saved prompt preset travels with the code.

import type { SvgVersion } from "./svgmodel";

/** The option as stored: ON/OFF plus the NAME of the preset whose text travels. */
export interface RegenSettings {
  enabled: boolean;
  /** A saved prompt preset's name; "" until the user picks one. */
  preset: string;
}

export const DEFAULT_REGEN_SETTINGS: RegenSettings = { enabled: false, preset: "" };

/** Stored value → option. A half-broken payload keeps the usable half, never guesses. */
export function parseRegenSettings(raw: unknown): RegenSettings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_REGEN_SETTINGS };
  const r = raw as { enabled?: unknown; preset?: unknown };
  return { enabled: r.enabled === true, preset: typeof r.preset === "string" ? r.preset : "" };
}

export function serializeRegenSettings(s: RegenSettings): string {
  return JSON.stringify({ enabled: s.enabled, preset: s.preset });
}

/**
 * The v2 text: the preset's own words, one instruction naming the code block
 * and the reference image, the icon's current SVG in a fenced block, and the
 * SAME title-contract line a first generation uses (`singlePrompt`) — so the
 * answer is extracted, matched and titled exactly as it always was.
 */
export function regenPrompt(presetText: string, code: string, name: string): string {
  return [
    presetText.trim(),
    "",
    "The SVG code below is this icon's current generated version. Regenerate it as one complete, "
    + "improved SVG document of the same icon, guided by the reference image.",
    "",
    "Current SVG code:",
    "```svg",
    code,
    "```",
    "",
    `Icon name (use it as the SVG <title>): ${name}`,
  ].join("\n");
}

/** The newest version that really generated — the code a v2 request carries. */
export function lastGenerated(versions: readonly SvgVersion[]): SvgVersion | null {
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    if (versions[i].status === "generated") return versions[i];
  }
  return null;
}
