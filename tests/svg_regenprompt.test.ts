// svg_regenprompt.test.ts — the text and image ONE request carries (2026-10-09).
// Feature 1 (main prompt + the first image) is locked here first; Feature 2
// (the saved prompt + the icon's newest valid SVG code + the same image) is
// proven against files on an in-memory folder. Each test fails if the code is
// read from the wrong version, a failed version is used, the record copies the
// code into the pair file, or a multi-icon request carries an SVG code.
import { describe, expect, it } from "vitest";
import type { RunArgs } from "../src/svg/runtypes";
import { requestTextOf } from "../src/svg/regenprompt";
import { batchPrompt, singlePrompt } from "../src/lib/svgprompt";
import { batchManifest, planBatches, type BatchPlan } from "../src/lib/svgbatch";
import { toBatchSource, type SvgSource } from "../src/svg/sources";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairMetaFor, svgPathFor, svgSource, svgVersion } from "./helpers/svgpair";
import type { PairMeta } from "../src/lib/pairmeta";
import type { RegenPlan } from "../src/lib/svgregen";

const MAIN = "Create a clean line icon.";
const CURRENT = { kind: "current-svg", presetName: "Bolder", presetText: "Make the strokes bolder." } as const;
const OLD_CODE = "<svg viewBox=\"0 0 24 24\"><path d=\"M1 1h22\"/></svg>";
const NEW_CODE = "<svg viewBox=\"0 0 24 24\"><path d=\"M2 2h20\"/></svg>";

/** A folder holding the AI images and the SVG files the versions point at. */
function folderWith(files: Record<string, string>): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  for (const [path, text] of Object.entries(files)) {
    arch.children.set(path.split("/").pop() as string, new FakeFile(path.split("/").pop() as string, 10, 1, text));
  }
  root.children.set("architecture", arch);
  return root;
}

function planFor(sources: readonly SvgSource[]): BatchPlan {
  return planBatches(sources.map(toBatchSource), 4)[0];
}

function argsFor(root: FakeDir, regen: RegenPlan, metas: Record<string, PairMeta | null> = {}): RunArgs {
  return { root, prompt: MAIN, regen, metas: new Map(Object.entries(metas)) } as unknown as RunArgs;
}

describe("Feature 1 — regenerate = the full main prompt + the first image", () => {
  it("sends the whole main prompt with the one icon's name, and records the main prompt", async () => {
    const source = svgSource("pair_1");
    const out = await requestTextOf(argsFor(folderWith({}), { kind: "main" }), [source], planFor([source]));
    expect(out).toEqual({ ok: true, text: { prompt: singlePrompt(MAIN, source.stem), record: MAIN } });
  });

  it("a multi-icon main request keeps the batch manifest and never a code block", async () => {
    const a = svgSource("pair_1");
    const b = svgSource("pair_2");
    const plan = planFor([a, b]);
    const out = await requestTextOf(argsFor(folderWith({}), { kind: "main" }), [a, b], plan);
    expect(out).toEqual({ ok: true, text: { prompt: batchPrompt(MAIN, batchManifest(plan.items)), record: MAIN } });
  });
});

describe("Feature 2 — the saved prompt + the current SVG code + the same image", () => {
  it("sends the saved prompt, the icon name and the newest valid SVG code", async () => {
    const source = svgSource("pair_1");
    const v1 = svgPathFor(source, 1);
    const meta = pairMetaFor(source, [svgVersion(v1)]);
    const root = folderWith({ [v1]: OLD_CODE });
    const out = await requestTextOf(argsFor(root, CURRENT, { [source.id]: meta }), [source], planFor([source]));
    expect(out.ok && out.text.prompt).toContain("Make the strokes bolder.");
    expect(out.ok && out.text.prompt).toContain(OLD_CODE);
    expect(out.ok && out.text.prompt.startsWith("Make the strokes bolder.")).toBe(true);
  });

  it("takes the newest VALID version, skipping a newer failed one", async () => {
    const source = svgSource("pair_1");
    const v1 = svgPathFor(source, 1);
    const v2 = svgPathFor(source, 2);
    const meta = pairMetaFor(source, [svgVersion(v1), svgVersion(v2, { version: 2, status: "failed" })]);
    const root = folderWith({ [v1]: OLD_CODE, [v2]: NEW_CODE });
    const out = await requestTextOf(argsFor(root, CURRENT, { [source.id]: meta }), [source], planFor([source]));
    expect(out.ok && out.text.prompt).toContain(OLD_CODE);
    expect(out.ok && out.text.prompt).not.toContain(NEW_CODE);
  });

  it("records the prompt text and the name, never the SVG code", async () => {
    const source = svgSource("pair_1");
    const v1 = svgPathFor(source, 1);
    const meta = pairMetaFor(source, [svgVersion(v1)]);
    const out = await requestTextOf(argsFor(folderWith({ [v1]: OLD_CODE }), CURRENT, { [source.id]: meta }), [source], planFor([source]));
    expect(out.ok && out.text.record).toBe(singlePrompt("Make the strokes bolder.", source.stem));
    expect(out.ok && out.text.record).not.toContain(OLD_CODE);
  });

  it("an icon with no valid SVG yet is a first generation: the main prompt is sent", async () => {
    const source = svgSource("pair_1");
    const meta = pairMetaFor(source, [svgVersion(svgPathFor(source, 1), { valid: false })]);
    const out = await requestTextOf(argsFor(folderWith({}), CURRENT, { [source.id]: meta }), [source], planFor([source]));
    expect(out).toEqual({ ok: true, text: { prompt: singlePrompt(MAIN, source.stem), record: MAIN } });
  });

  it("an SVG file that cannot be read fails that icon and sends nothing", async () => {
    const source = svgSource("pair_1");
    const meta = pairMetaFor(source, [svgVersion(svgPathFor(source, 1))]);
    const out = await requestTextOf(argsFor(folderWith({}), CURRENT, { [source.id]: meta }), [source], planFor([source]));
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.error).toContain(source.name);
    expect(out.ok ? "" : out.error).toContain("nothing was sent");
  });

  it("never puts an SVG code into a multi-icon request", async () => {
    const a = svgSource("pair_1");
    const b = svgSource("pair_2");
    const meta = pairMetaFor(a, [svgVersion(svgPathFor(a, 1))]);
    const root = folderWith({ [svgPathFor(a, 1)]: OLD_CODE });
    const out = await requestTextOf(argsFor(root, CURRENT, { [a.id]: meta }), [a, b], planFor([a, b]));
    expect(out.ok && out.text.prompt).not.toContain(OLD_CODE);
  });
});
