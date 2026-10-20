// svgregen.ts — SVG regeneration plan, batch size, and outgoing prompt builders.
// Owns: the stored setting (tolerant parser per RULE 13), the plan a run receives
// (including optional batch size 1..9 for multi-SVG regeneration), single-icon
// and multi-icon batch regeneration prompts carrying current SVG XML verbatim,
// and human-readable plan labels. Pure: zero IO, zero storage side effects.

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

export interface RegenBatchEntry {
  readonly position: number;
  readonly name: string;
  readonly code: string;
}

export const DEFAULT_REGEN: RegenSetting = { mode: "main", presetName: "" };

/** What one run is given: the main prompt, or the saved prompt's text (+ optional batch size). */
export type RegenPlan =
  | { kind: "main" }
  | { kind: "current-svg"; presetName: string; presetText: string; perRequest?: number };

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
  return regenPlanFromPresetName(setting.presetName, presets);
}

export function regenPlanFromPresetName(
  name: string,
  presets: readonly PromptPreset[],
  perRequest?: number,
): RegenResult {
  const preset = findPreset(presets, name);
  if (preset === null) return { ok: false, problem: `The saved prompt “${name}” is gone — pick another in the prompt window` };
  return regenPlanFromPreset(preset, perRequest);
}

export function regenPlanFromPreset(preset: PromptPreset | null, perRequest?: number): RegenResult {
  if (preset === null) return { ok: false, problem: NO_PRESET_PROBLEM };
  if (preset.text.trim() === "") return { ok: false, problem: `The saved prompt “${preset.name}” is empty — write it again in the prompt window` };
  const base: CurrentSvgPlan = { kind: "current-svg", presetName: preset.name, presetText: preset.text };
  const plan: CurrentSvgPlan = perRequest === undefined ? base : { ...base, perRequest: clampImagesPerRequest(perRequest) };
  return { ok: true, plan };
}

/**
 * Icons one request carries. The main mode uses the configured first-generation size;
 * the current-SVG mode uses `plan.perRequest` (default 1 when omitted).
 */
export function requestSizeFor(imagesPerRequest: number, plan: RegenPlan): number {
  return plan.kind === "current-svg"
    ? clampImagesPerRequest(plan.perRequest ?? 1)
    : clampImagesPerRequest(imagesPerRequest);
}

/** Single-icon regeneration prompt: saved prompt, required <title>, then current SVG code verbatim. */
export function currentSvgPrompt(presetText: string, name: string, code: string): string {
  return [
    presetText.trim(),
    `Icon name (use it as the SVG <title>): ${name}`,
    "Current SVG code of this icon — regenerate it from the attached image following the instructions above:",
    code.trim(),
  ].join("\n\n");
}

function formatRegenEntry(entry: RegenBatchEntry): string {
  return [
    `### ${entry.position} — Required <title>: ${entry.name}`,
    `Current SVG code to fix for ${entry.name}:`,
    entry.code.trim(),
  ].join("\n");
}

/** Multi-icon batch regeneration prompt: manifest, strict <title> rules, prompt, and all SVG codes verbatim. */
export function batchRegenPrompt(presetText: string, entries: readonly RegenBatchEntry[]): string {
  const manifestLines = entries.map((e) => `${e.position} — ${e.name}`).join("\n");
  const header = [
    "Here is a batch of icons arranged in numbered grid order (matching the attached reference sheet):",
    manifestLines,
  ].join("\n");
  const rules = [
    `Regenerate / fix all ${entries.length} SVG icons below using the attached reference grid and instructions.`,
    "CRITICAL RESPONSE RULES:",
    `1. Return one standalone <svg ...>...</svg> block per icon (${entries.length} SVGs total).`,
    "2. Inside EVERY returned <svg>, set <title>EXACT_ICON_NAME</title> using the exact name listed above (overwrite or insert <title> even if the old SVG had a missing or different <title>). Each returned SVG is matched back to its file strictly by its <title>.",
  ].join("\n");
  return [header, rules, presetText.trim(), ...entries.map(formatRegenEntry)].join("\n\n");
}

/** The words the activity log and the user see for a plan. */
export function regenLabelOf(plan: RegenPlan): string {
  return plan.kind === "main" ? "main prompt + first image" : `regenerate from current SVG (“${plan.presetName}”)`;
}
