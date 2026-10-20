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

// Batch regeneration (2026-10-20): one request carries up to a full 3x3 sheet.
export const REGEN_PER_REQUEST_MIN = 1;
export const REGEN_PER_REQUEST_MAX = 9;
export const DEFAULT_REGEN_PER_REQUEST = REGEN_PER_REQUEST_MAX;
/** One SVG code longer than this is refused, never truncated. */
export const REGEN_CODE_MAX_CHARS = 20_000;
/** The whole request text ceiling — a longer batch asks for fewer icons. */
export const REGEN_PROMPT_MAX_CHARS = 60_000;
const RECORD_MAX_CHARS = 2_000;
/** What a plan built without an explicit size carries: today's one-icon request. */
const LEGACY_REGEN_SIZE = 1;

/** The stored "icons per regeneration request" preference. */
export const REGEN_BATCH_VERSION = 1;

export interface RegenBatchPref {
  count: number;
}

export const DEFAULT_REGEN_BATCH: RegenBatchPref = { count: DEFAULT_REGEN_PER_REQUEST };

export function clampRegenPerRequest(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_REGEN_PER_REQUEST;
  return Math.min(REGEN_PER_REQUEST_MAX, Math.max(REGEN_PER_REQUEST_MIN, Math.round(n)));
}

/** Stored value → preference: anything foreign costs one default (RULE 13). */
export function parseRegenBatch(raw: unknown): RegenBatchPref {
  if (!isRecord(raw) || raw.v !== REGEN_BATCH_VERSION) return DEFAULT_REGEN_BATCH;
  return { count: clampRegenPerRequest(raw.count) };
}

export function serializeRegenBatch(pref: RegenBatchPref): string {
  return JSON.stringify({ v: REGEN_BATCH_VERSION, count: clampRegenPerRequest(pref.count) });
}

/** One line under the size control: what the number really means. */
export function regenBatchPrefText(count: number): string {
  const n = clampRegenPerRequest(count);
  if (n === 1) return "one icon per request — the same request as before, with a single code";
  return `${n} icon(s) per request — one square sheet and ${n === REGEN_PER_REQUEST_MAX ? "a full 3×3 grid" : `a ${n}-cell batch`} of current SVG code`;
}

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
  /** `size` is frozen with the plan: one request carries this many icons (1..9). */
  | { kind: "current-svg"; presetName: string; presetText: string; size: number };

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

export function regenPlanFromPresetName(name: string, presets: readonly PromptPreset[], size = LEGACY_REGEN_SIZE): RegenResult {
  const preset = findPreset(presets, name);
  if (preset === null) return { ok: false, problem: `The saved prompt “${name}” is gone — pick another in the prompt window` };
  return regenPlanFromPreset(preset, size);
}

/**
 * `size` defaults to 1 on purpose: the legacy stored setting predates batching,
 * so only a caller that asks for a batch (the popup, the queue) makes one.
 */
export function regenPlanFromPreset(preset: PromptPreset | null, size = LEGACY_REGEN_SIZE): RegenResult {
  if (preset === null) return { ok: false, problem: NO_PRESET_PROBLEM };
  if (preset.text.trim() === "") return { ok: false, problem: `The saved prompt “${preset.name}” is empty — write it again in the prompt window` };
  return { ok: true, plan: { kind: "current-svg", presetName: preset.name, presetText: preset.text, size: clampRegenPerRequest(size) } };
}

/**
 * Icons one request carries. The main mode keeps the user's configured size;
 * the current-SVG mode reads the size frozen in its own plan (1..9, default 9),
 * because a batch request carries one code per icon.
 */
export function requestSizeFor(imagesPerRequest: number, plan: RegenPlan): number {
  return plan.kind === "current-svg" ? clampRegenPerRequest(plan.size) : clampImagesPerRequest(imagesPerRequest);
}

/** One icon of a batch request: its manifest position, name and current code. */
export interface RegenCodeItem {
  position: number;
  name: string;
  code: string;
}

const REGEN_RULES =
  "Rules: Return exactly one complete SVG document for every position, in the same numeric order starting from 1. " +
  "Each SVG's <title> must be exactly the name of its position, with no extra words and no file extension. " +
  "Do not merge, move, swap, add, remove or renumber icons. Use the attached grid only as the picture of the same " +
  "numbered icons: keep each icon's artwork, proportions and orientation, and change only what the instructions above " +
  "ask for. Return only the SVGs — no commentary, no introduction, no explanations.";

/**
 * The text one batch regeneration request carries: the saved prompt, the ordered
 * manifest, the response contract, then every icon's own current SVG code. One
 * icon keeps the original single-icon text, so size 1 is unchanged.
 */
export function regenBatchPrompt(presetText: string, items: readonly RegenCodeItem[]): string {
  if (items.length === 1) return currentSvgPrompt(presetText, items[0].name, items[0].code);
  const manifest = items.map((i) => `${i.position} — ${i.name}`).join("\n");
  const codes = items.map((i) => `Current SVG code for position ${i.position} (${i.name}):\n${i.code.trim()}`);
  return [
    presetText.trim(),
    `Here is a batch of ${items.length} icons to regenerate, in numbered grid order:\n${manifest}`,
    REGEN_RULES,
    ...codes,
  ].join("\n\n");
}

/**
 * What the pair file keeps for this version: the prompt in short form plus the
 * position, NEVER the code and never another icon's text (RULE 20).
 */
export function regenRecordText(presetText: string, count: number, position: number): string {
  const text = presetText.trim();
  const short = text.length > RECORD_MAX_CHARS ? `${text.slice(0, RECORD_MAX_CHARS)}…` : text;
  return count <= 1 ? short : `${short} — regenerate in a batch of ${count}, position ${position}/${count}`;
}

/** Why this batch must not be sent, or null when it may. Nothing is truncated. */
export function regenPromptProblem(presetText: string, items: readonly RegenCodeItem[]): string | null {
  if (presetText.trim() === "") return "The regeneration prompt is empty — pick a saved prompt";
  const long = items.find((i) => i.code.length > REGEN_CODE_MAX_CHARS);
  if (long !== undefined) return `${long.name}: its SVG code is longer than ${REGEN_CODE_MAX_CHARS.toLocaleString("en-US")} characters — nothing will be sent`;
  if (regenBatchPrompt(presetText, items).length > REGEN_PROMPT_MAX_CHARS) {
    return `A request with ${items.length} icons exceeds the prompt limit — choose fewer icons per request`;
  }
  return null;
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
  if (plan.kind === "main") return "main prompt + first image";
  return `regenerate from current SVG (“${plan.presetName}”, ${clampRegenPerRequest(plan.size)} per request)`;
}
