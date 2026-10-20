// svgregen_batch.test.ts — batch regeneration (2026-10-20): one request may
// carry up to N icons, each with its own current SVG code, and the answer is
// matched back by name. Locks the prompt text, the record text (never a code),
// the limits that refuse a request before it is sent, and the size arithmetic.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGEN_PER_REQUEST, REGEN_CODE_MAX_CHARS, REGEN_PER_REQUEST_MAX, REGEN_PER_REQUEST_MIN,
  clampRegenPerRequest, currentSvgPrompt, regenBatchPrompt,
  regenLabelOf, regenPlanFromPreset, regenPromptProblem, regenRecordText, requestSizeFor,
} from "../src/lib/svgregen";
import type { PromptPreset } from "../src/lib/promptpresets";

const CODE_A = '<svg viewBox="0 0 24 24"><title>icon-a_AI</title><path d="M1 1h22"/></svg>';
const CODE_B = '<svg viewBox="0 0 24 24"><title>icon-b_AI</title><path d="M2 2h20"/></svg>';
const PRESET: PromptPreset = { name: "Bolder", text: "Make the strokes bolder." };

const items = (codes: string[]) => codes.map((code, i) => ({ position: i + 1, name: `icon-${String.fromCharCode(97 + i)}_AI`, code }));

describe("clampRegenPerRequest — 1..9, default 9", () => {
  it("keeps a whole number inside the range and clamps everything else", () => {
    expect(clampRegenPerRequest(9)).toBe(9);
    expect(clampRegenPerRequest(1)).toBe(1);
    expect(clampRegenPerRequest(0)).toBe(REGEN_PER_REQUEST_MIN);
    expect(clampRegenPerRequest(42)).toBe(REGEN_PER_REQUEST_MAX);
    expect(clampRegenPerRequest(4.6)).toBe(5);
    expect(clampRegenPerRequest("7")).toBe(7);
    expect(clampRegenPerRequest(undefined)).toBe(DEFAULT_REGEN_PER_REQUEST);
    expect(clampRegenPerRequest(Number.NaN)).toBe(DEFAULT_REGEN_PER_REQUEST);
  });

  it("a full 3x3 sheet is the default and the maximum", () => {
    expect(DEFAULT_REGEN_PER_REQUEST).toBe(9);
    expect(REGEN_PER_REQUEST_MAX).toBe(9);
  });
});

describe("clampRegenPerRequest — the ONE configured size (2026-10-20)", () => {
  it("clamps whatever the connection's Images / request holds into 1..9", () => {
    expect(clampRegenPerRequest(9)).toBe(9);
    expect(clampRegenPerRequest(4)).toBe(4);
    expect(clampRegenPerRequest(99)).toBe(REGEN_PER_REQUEST_MAX);
    expect(clampRegenPerRequest(0)).toBe(1);
    expect(clampRegenPerRequest("6")).toBe(6);
  });

  it("costs one default for junk instead of guessing", () => {
    expect(clampRegenPerRequest("x")).toBe(DEFAULT_REGEN_PER_REQUEST);
    expect(clampRegenPerRequest(undefined)).toBe(DEFAULT_REGEN_PER_REQUEST);
  });
});

describe("regenBatchPrompt — the preset, the manifest, the rules, then every code", () => {
  it("a one-icon request is exactly the single-icon text (today's behaviour)", () => {
    expect(regenBatchPrompt(PRESET.text, items([CODE_A]))).toBe(currentSvgPrompt(PRESET.text, "icon-a_AI", CODE_A));
  });

  it("names every position in the manifest and carries every code verbatim", () => {
    const text = regenBatchPrompt(PRESET.text, items([CODE_A, CODE_B]));
    expect(text.startsWith("Make the strokes bolder.")).toBe(true);
    expect(text).toContain("Here is a batch of 2 icons to regenerate");
    expect(text).toContain("1 — icon-a_AI");
    expect(text).toContain("2 — icon-b_AI");
    expect(text).toContain("Current SVG code for position 1 (icon-a_AI):");
    expect(text).toContain("Current SVG code for position 2 (icon-b_AI):");
    expect(text).toContain(CODE_A);
    expect(text).toContain(CODE_B);
    expect(text.indexOf(CODE_A)).toBeLessThan(text.indexOf(CODE_B));
  });

  it("fixes the <title> contract and forbids merging, moving or renumbering", () => {
    const text = regenBatchPrompt(PRESET.text, items([CODE_A, CODE_B]));
    expect(text).toContain("Each SVG's <title> must be exactly the name of its position");
    expect(text).toContain("Do not merge, move, swap, add, remove or renumber icons.");
    expect(text.toLowerCase()).toContain("no commentary");
  });
});

describe("regenRecordText — what the pair file keeps", () => {
  it("never contains an SVG code and names the position in a batch", () => {
    const text = regenRecordText(PRESET.text, 4, 3);
    expect(text).toContain("Make the strokes bolder.");
    expect(text).toContain("position 3/4");
    expect(text).not.toContain("<svg");
  });

  it("a one-icon batch keeps the prompt alone", () => {
    expect(regenRecordText(PRESET.text, 1, 1)).toBe("Make the strokes bolder.");
  });

  it("cuts a very long prompt with an ellipsis instead of storing it whole", () => {
    const long = regenRecordText("x".repeat(5_000), 2, 1);
    expect(long.length).toBeLessThan(2_100);
    expect(long).toContain("…");
  });
});

describe("regenPromptProblem — refused before a byte is sent", () => {
  it("accepts an ordinary batch", () => {
    expect(regenPromptProblem(PRESET.text, items([CODE_A, CODE_B]))).toBeNull();
  });

  it("refuses an empty prompt", () => {
    expect(regenPromptProblem("   ", items([CODE_A]))).toContain("empty");
  });

  it("refuses one code above the per-code ceiling, naming the icon", () => {
    const huge = `<svg>${"x".repeat(REGEN_CODE_MAX_CHARS)}</svg>`;
    const why = regenPromptProblem(PRESET.text, items([CODE_A, huge]));
    expect(why).toContain("icon-b_AI");
    expect(why).toContain("longer than");
  });

  it("refuses a batch whose whole prompt is too large and asks for fewer icons", () => {
    const big = `<svg>${"x".repeat(15_000)}</svg>`;
    const why = regenPromptProblem(PRESET.text, items([big, big, big, big, big]));
    expect(why).toContain("exceeds the prompt limit");
  });
});

describe("the plan carries its own size (frozen with the batch)", () => {
  it("a current-svg plan knows how many icons one request carries", () => {
    const plan = regenPlanFromPreset(PRESET, 4);
    expect(plan.ok && plan.plan).toEqual({ kind: "current-svg", presetName: "Bolder", presetText: PRESET.text, size: 4 });
  });

  it("keeps the user's generation size for the main plan", () => {
    expect(requestSizeFor(4, { kind: "main" })).toBe(4);
    expect(requestSizeFor(4, regenPlanOfPlan(3))).toBe(3);
    expect(requestSizeFor(4, regenPlanOfPlan(99))).toBe(REGEN_PER_REQUEST_MAX);
  });

  it("names the size in the label the log and the user see", () => {
    const plan = regenPlanFromPreset(PRESET, 6);
    expect(regenLabelOf(plan.ok ? plan.plan : { kind: "main" })).toContain("6");
  });
});

function regenPlanOfPlan(size: number) {
  const out = regenPlanFromPreset(PRESET, size);
  if (!out.ok) throw new Error(out.problem);
  return out.plan;
}
