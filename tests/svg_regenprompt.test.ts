// svg_regenprompt.test.ts — the text ONE request carries (2026-10-09, batch
// regeneration 2026-10-20). Feature 1 (the batch's own prompt + the images) is
// locked here first; Feature 2 (the saved prompt + the current SVG code of
// EVERY icon the request carries) is proven against the frozen code map the
// confirmation handed the queue. Each test fails if a request mixes the two
// prompts, if a missing code is quietly replaced by the main prompt, or if the
// pair file ever records a code.
import { describe, expect, it } from "vitest";
import type { RunArgs } from "../src/svg/runtypes";
import { requestTextOf } from "../src/svg/regenprompt";
import { batchPrompt, singlePrompt } from "../src/lib/svgprompt";
import { batchManifest, planBatches, type BatchPlan } from "../src/lib/svgbatch";
import { regenBatchPrompt, regenRecordText } from "../src/lib/svgregen";
import { toBatchSource, type SvgSource } from "../src/svg/sources";
import type { RegenCode } from "../src/svg/regencodes";

const MAIN = "Create a clean line icon.";
const PRESET = "Make the strokes bolder.";
const CODE_1 = '<svg viewBox="0 0 24 24"><path d="M1 1h22"/></svg>';
const CODE_2 = '<svg viewBox="0 0 24 24"><path d="M2 2h20"/></svg>';

const CURRENT = (size: number) => ({ kind: "current-svg", presetName: "Bolder", presetText: PRESET, size }) as const;

function planFor(sources: readonly SvgSource[], perRequest = 4): BatchPlan {
  return planBatches(sources.map(toBatchSource), perRequest)[0];
}

function codeFor(source: SvgSource, code: string | null): RegenCode {
  return { sourceId: source.id, name: source.name, version: 1, svgPath: `${source.dirPath}/${source.stem}_v1.svg`, code };
}

function argsFor(_sources: readonly SvgSource[], codes: RegenCode[], regen: RunArgs["regen"] = { kind: "main" }): RunArgs {
  return {
    prompt: MAIN, regen,
    regenCodes: new Map(codes.map((c) => [c.sourceId, c])),
  } as unknown as RunArgs;
}

describe("Feature 1 — a batch without a regeneration plan sends the chosen prompt", () => {
  it("sends the whole main prompt with the one icon's name, and records the main prompt", async () => {
    const source = { id: "pair_1", stem: "icon-1_AI", name: "icon-1_AI.png" } as SvgSource;
    const out = await requestTextOf(argsFor([source], []), [source], planFor([source]));
    expect(out).toEqual({ ok: true, text: { prompt: singlePrompt(MAIN, source.stem), record: MAIN, records: new Map() } });
  });

  it("a saved preset is what a generation batch sends — the main prompt is not merged in", async () => {
    const a = { id: "pair_1", stem: "icon-1_AI", name: "icon-1_AI.png" } as SvgSource;
    const args = { ...argsFor([a], []), promptChoice: { kind: "preset", name: "Bolder", text: PRESET } } as RunArgs;
    const out = await requestTextOf(args, [a], planFor([a]));
    expect(out.ok && out.text.prompt).toContain(PRESET);
    expect(out.ok && out.text.prompt).not.toContain(MAIN);
    expect(out.ok && out.text.record).toBe(PRESET);
  });

  it("a multi-icon main request keeps the batch manifest and never a code block", async () => {
    const a = { id: "pair_1", stem: "icon-1_AI", name: "icon-1_AI.png" } as SvgSource;
    const b = { id: "pair_2", stem: "icon-2_AI", name: "icon-2_AI.png" } as SvgSource;
    const plan = planFor([a, b]);
    const out = await requestTextOf(argsFor([a, b], []), [a, b], plan);
    expect(out).toEqual({ ok: true, text: { prompt: batchPrompt(MAIN, batchManifest(plan.items)), record: MAIN, records: new Map() } });
  });
});

describe("Feature 2 — the saved prompt + every carried icon's current SVG code", () => {
  it("one icon at size 1 keeps the single-icon text (today's request)", async () => {
    const a = { id: "pair_1", stem: "icon-1_AI", name: "icon-1_AI.png" } as SvgSource;
    const plan = planFor([a], 1);
    const out = await requestTextOf(argsFor([a], [codeFor(a, CODE_1)], CURRENT(1)), [a], plan);
    expect(out.ok && out.text.prompt).toBe(regenBatchPrompt(PRESET, [{ position: 1, name: a.stem, code: CODE_1 }]));
    expect(out.ok && out.text.prompt.startsWith(PRESET)).toBe(true);
    expect(out.ok && out.text.prompt).toContain(CODE_1);
  });

  it("a batch carries every icon's own code, in manifest order, and no other request's", async () => {
    const a = { id: "pair_1", stem: "icon-1_AI", name: "icon-1_AI.png" } as SvgSource;
    const b = { id: "pair_2", stem: "icon-2_AI", name: "icon-2_AI.png" } as SvgSource;
    const c = { id: "pair_3", stem: "icon-3_AI", name: "icon-3_AI.png" } as SvgSource;
    const plan = planFor([a, b, c], 4);
    const out = await requestTextOf(argsFor([a, b], [codeFor(a, CODE_1), codeFor(b, CODE_2)], CURRENT(4)), [a, b], plan);
    const text = out.ok ? out.text.prompt : "";
    expect(text).toContain("Here is a batch of 2 icons to regenerate");
    expect(text).toContain("2 — icon-2_AI");
    expect(text).toContain(CODE_1);
    expect(text).toContain(CODE_2);
    expect(text.indexOf(CODE_1)).toBeLessThan(text.indexOf(CODE_2));
  });

  it("records the preset and the position, never a code", async () => {
    const a = { id: "pair_1", stem: "icon-1_AI", name: "icon-1_AI.png" } as SvgSource;
    const b = { id: "pair_2", stem: "icon-2_AI", name: "icon-2_AI.png" } as SvgSource;
    const plan = planFor([a, b], 4);
    const out = await requestTextOf(argsFor([a, b], [codeFor(a, CODE_1), codeFor(b, CODE_2)], CURRENT(4)), [a, b], plan);
    expect(out.ok && out.text.records?.get(a.id)).toBe(regenRecordText(PRESET, 2, 1));
    expect(out.ok && out.text.records?.get(b.id)).toBe(regenRecordText(PRESET, 2, 2));
    expect(out.ok && out.text.records?.get(a.id)).not.toContain("<svg");
  });

  it("an icon whose frozen code is missing fails the request — never a main-prompt fallback", async () => {
    const a = { id: "pair_1", stem: "icon-1_AI", name: "icon-1_AI.png" } as SvgSource;
    const b = { id: "pair_2", stem: "icon-2_AI", name: "icon-2_AI.png" } as SvgSource;
    const out = await requestTextOf(argsFor([a, b], [codeFor(a, CODE_1)], CURRENT(4)), [a, b], planFor([a, b], 4));
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.error).toContain(b.name);
    expect(out.ok ? "" : out.error).toContain("nothing was sent");
    expect(out.ok ? "" : out.error).not.toContain(MAIN);
  });

  it("refuses a batch whose prompt would pass the ceiling, naming the limit", async () => {
    const a = { id: "pair_1", stem: "icon-1_AI", name: "icon-1_AI.png" } as SvgSource;
    const huge = `<svg>${"x".repeat(25_000)}</svg>`;
    const out = await requestTextOf(argsFor([a], [codeFor(a, huge)], CURRENT(1)), [a], planFor([a], 1));
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.error).toContain("longer than");
  });
});
