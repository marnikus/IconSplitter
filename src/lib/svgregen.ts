// svgregen.ts — how a regeneration is asked (2026-10-09, "Regenerate SVG from").
// Owns: the stored choice (main prompt + first image, or the saved prompt +
// the icon's current SVG code), its tolerant parser (RULE 13), the plan a run
// is given (a missing saved prompt is a named problem, never a guess), the
// request size each plan implies (one icon per request in the current-SVG
// mode) and the one prompt text that carries the SVG code. Pure: no storage,
// no IO — src/svg/regenstore.ts reads the presets and hands them in.

import { isRecord } from "./isrecord";
import { clampImagesPerRequest } from "./svgconfig";
import { findPreset, validPresetName, type PromptPreset } from "./promptpresets";

export const REGEN_VERSION = 1;

export type RegenMode = "main" | "current-svg";

/** What the Export settings row stores: the mode and the saved prompt's name. */
export interface RegenSetting {
  mode: RegenMode;
  presetName: string;
}

export const DEFAULT_REGEN: RegenSetting = { mode: "main", presetName: "" };

/** What one run is given: the main prompt, or the saved prompt's text. */
export type RegenPlan =
  | { kind: "main" }
  | { kind: "current-svg"; presetName: string; presetText: string };

/** The plan of the default mode, shared by every caller that needs "no regeneration choice". */
export const MAIN_PLAN: RegenPlan = { kind: "main" };

export type CurrentSvgPlan = Extract<RegenPlan, { kind: "current-svg" }>;

export type RegenResult = { ok: true; plan: RegenPlan } | { ok: false; problem: string };

export const NO_PRESET_PROBLEM = "Regenerate from current SVG needs a saved prompt — pick one in Export settings";

/** Stored value → setting. Anything foreign costs one ignored load. */
export function parseRegen(raw: unknown): RegenSetting {
  if (!isRecord(raw) || raw.v !== REGEN_VERSION) return DEFAULT_REGEN;
  const mode: RegenMode = raw.mode === "current-svg" ? "current-svg" : "main";
  const name = typeof raw.presetName === "string" ? validPresetName(raw.presetName) : null;
  return { mode, presetName: name ?? "" };
}

export function serializeRegen(setting: RegenSetting): string {
  return JSON.stringify({ v: REGEN_VERSION, mode: setting.mode, presetName: setting.presetName });
}

/** The plan a run gets: the main mode always works; the other needs a usable saved prompt. */
export function regenPlanOf(setting: RegenSetting, presets: readonly PromptPreset[]): RegenResult {
  if (setting.mode === "main") return { ok: true, plan: { kind: "main" } };
  if (setting.presetName === "") return { ok: false, problem: NO_PRESET_PROBLEM };
  const preset = findPreset(presets, setting.presetName);
  if (preset === null) return { ok: false, problem: `The saved prompt “${setting.presetName}” is gone — pick another in Export settings` };
  if (preset.text.trim() === "") return { ok: false, problem: `The saved prompt “${preset.name}” is empty — write it again in Export settings` };
  return { ok: true, plan: { kind: "current-svg", presetName: preset.name, presetText: preset.text } };
}

/**
 * Icons one request carries. The main mode keeps the user's configured size;
 * the current-SVG mode sends each icon alone, because each carries its own code.
 */
export function requestSizeFor(imagesPerRequest: number, plan: RegenPlan): number {
  return plan.kind === "current-svg" ? 1 : clampImagesPerRequest(imagesPerRequest);
}

/** The saved prompt, the icon-name line, then the icon's current SVG code verbatim. */
export function currentSvgPrompt(presetText: string, name: string, code: string): string {
  return [
    presetText.trim(),
    `Icon name (use it as the SVG <title>): ${name}`,
    "Current SVG code of this icon — regenerate it from the attached image following the instructions above:",
    code.trim(),
  ].join("\n\n");
}

/** The words the activity log and the user see for a plan. */
export function regenLabelOf(plan: RegenPlan): string {
  return plan.kind === "main" ? "main prompt + first image" : `regenerate from current SVG (“${plan.presetName}”)`;
}
