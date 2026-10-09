// svg_regen.test.ts — the v2 regeneration run executes for real (RULE 8): with
// the option on and a preset resolved, an icon that already has a generated
// version leaves ALONE, carrying its current SVG code + the preset's text +
// the same reference image (design 2026-10-09 D4/D5), while a brand-new icon
// in the same run still gets the main prompt. No preset text, or a version
// file that cannot be read, downgrades that icon to the main prompt and says
// so in the run's problems — a regeneration that cannot show its current code
// is a first generation (RULE 4). The pair file records the text that ran (D6).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type SvgConfig } from "../src/lib/svgconfig";
import { capsFor, type SamplingParams } from "../src/lib/modelcaps";
import { compositeLayout } from "../src/lib/svgcomposite";
import { runGeneration, type RunEvent } from "../src/svg/runner";
import { clearInflight } from "../src/svg/journal";
import type { PairMeta } from "../src/lib/pairmeta";
import type { SvgSource } from "../src/svg/sources";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { answerFor, requestItems } from "./helpers/svgtransport";
import { pairMetaFor, svgPathFor, svgSource, svgVersion } from "./helpers/svgpair";

vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly SvgSource[]) => ({
      dataUrl: `data:image/png;base64,${sources.map((s) => s.relPath).join("|")}`,
      hash: `h${sources.length}`,
      layout: compositeLayout(sources.length),
      bytes: 10,
    })),
  };
});

const MAIN = "the main quality prompt";
const PRESET = "Keep the stroke weight even and the corners sharp.";
const OLD_CODE = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><title>old</title><path d=\"M1 1h22\"/></svg>";
const PARAMS: SamplingParams = { temperature: null, maxTokens: 8_000, effort: "low" };

interface Sent { prompt: string; items: string[] }

/** Records the text + composite of every request; answers like a quiet provider. */
function recorder(): { sent: Sent[]; fetch: typeof fetch } {
  const sent: Sent[] = [];
  const fetch = async (_url: string, init: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init.body)) as { messages: { content: { type: string; text?: string }[] }[] };
    sent.push({ prompt: body.messages[0].content.find((c) => c.type === "text")?.text ?? "", items: requestItems(init) });
    return answerFor(requestItems(init));
  };
  return { sent, fetch: fetch as typeof fetch };
}

/** pair_1 already has a generated v1 on disk; pair_2 is brand new. */
function fixture(withFile: boolean) {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  root.children.set("architecture", arch);
  const one = svgSource("pair_1", { name: "one_AI.png" });
  const two = svgSource("pair_2", { name: "two_AI.png" });
  for (const s of [one, two]) {
    arch.children.set(s.name, new FakeFile(s.name, 20, 3000, "png"));
    arch.children.set(s.sourcePath?.split("/").pop() ?? "", new FakeFile(s.sourcePath?.split("/").pop() ?? "", 12, 2000, "ref"));
  }
  if (withFile) arch.children.set(svgPathFor(one, 1).split("/").pop() ?? "", new FakeFile(svgPathFor(one, 1).split("/").pop() ?? "", OLD_CODE.length, 4000, OLD_CODE));
  const metas = new Map<string, PairMeta | null>([
    ["pair_1", pairMetaFor(one, [svgVersion(svgPathFor(one, 1))])],
    ["pair_2", pairMetaFor(two, [])],
  ]);
  return { root, one, two, metas };
}

function args(root: FakeDir, sources: SvgSource[], metas: Map<string, PairMeta | null>, regen: { enabled: boolean; presetText: string | null }) {
  const events: RunEvent[] = [];
  const config: SvgConfig = { ...DEFAULT_CONFIG, retries: 0, imagesPerRequest: 4 };
  return {
    events, metas,
    run: () => runGeneration({
      root, apiKey: ["rq", "live", "regen_test_key_1234"].join("_"), config,
      caps: capsFor(config.model), params: PARAMS, prompt: MAIN, sources, metas, regen,
      onEvent: (e) => events.push(e), signal: new AbortController().signal,
    }),
  };
}

beforeEach(() => clearInflight());
afterEach(() => { vi.unstubAllGlobals(); clearInflight(); });

describe("regenerate from current SVG — the v2 request (D4/D5)", () => {
  it("sends the old SVG code + the preset text + the same ref image, alone; the new icon gets the main prompt", async () => {
    const { root, one, two, metas } = fixture(true);
    const t = recorder();
    vi.stubGlobal("fetch", t.fetch);
    const summary = await args(root, [{ ...one, solo: true }, two], metas, { enabled: true, presetText: PRESET }).run();

    expect(t.sent).toHaveLength(2); // the re-generation travelled alone
    expect(t.sent[0].items).toEqual([one.relPath]);
    expect(t.sent[1].items).toEqual([two.relPath]);
    // v2: the preset's words and the current code, not the main prompt
    expect(t.sent[0].prompt).toContain(PRESET);
    expect(t.sent[0].prompt).toContain(OLD_CODE);
    expect(t.sent[0].prompt).not.toContain(MAIN);
    expect(t.sent[0].prompt).toContain(`Icon name (use it as the SVG <title>): ${one.stem}`);
    // v1, unchanged: the main prompt, no old code
    expect(t.sent[1].prompt).toContain(MAIN);
    expect(t.sent[1].prompt).not.toContain(OLD_CODE);
    expect(summary.saved).toBe(2);
  });

  it("records the v2 text in the pair file, so 'what produced this version' stays true (D6)", async () => {
    const { root, one, two, metas } = fixture(true);
    vi.stubGlobal("fetch", recorder().fetch);
    await args(root, [{ ...one, solo: true }, two], metas, { enabled: true, presetText: PRESET }).run();
    const stored = metas.get("pair_1")?.versions.at(-1)?.prompt ?? "";
    expect(stored).toContain(PRESET);
    expect(stored).toContain(OLD_CODE);
  });

  it("without a preset text the run is exactly today's run: one batched request, main prompt", async () => {
    const { root, one, two, metas } = fixture(true);
    const t = recorder();
    vi.stubGlobal("fetch", t.fetch);
    const summary = await args(root, [{ ...one, solo: true }, two], metas, { enabled: true, presetText: null }).run();
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].items).toEqual([one.relPath, two.relPath]);
    expect(t.sent[0].prompt).toContain(MAIN);
    expect(t.sent[0].prompt).not.toContain(OLD_CODE);
    expect(summary.saved).toBe(2);
  });

  it("a version whose file cannot be read downgrades to the main prompt and names itself (D5/RULE 4)", async () => {
    const { root, one, two, metas } = fixture(false); // meta says v1 exists; the file does not
    const t = recorder();
    vi.stubGlobal("fetch", t.fetch);
    const summary = await args(root, [{ ...one, solo: true }, two], metas, { enabled: true, presetText: PRESET }).run();
    const regenRequest = t.sent.find((s) => s.items.includes(one.relPath));
    expect(regenRequest?.prompt).toContain(MAIN);
    expect(regenRequest?.prompt).not.toContain(OLD_CODE);
    expect(summary.problems.join(" ")).toContain(one.name);
    expect(summary.saved).toBe(2);
  });
});
