import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compositeLayout } from "../src/lib/svgcomposite";
import { capsFor, sanitizeParams } from "../src/lib/modelcaps";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import type { PairMeta } from "../src/lib/pairmeta";
import { batchRegenPrompt } from "../src/lib/svgregen";
import { loadRegenBatchPref, saveRegenBatchPref, REGEN_BATCH_PREF_KEY } from "../src/svg/regenprefs";
import { toBatchSourcesUnique, type SvgSource } from "../src/svg/sources";
import { runGeneration, type RunEvent } from "../src/svg/runner";
import { FakeDir } from "./helpers/fakefs";
import { pairMetaFor, svgPathFor, svgSource, svgVersion } from "./helpers/svgpair";
import { requestItems, requestPrompt } from "./helpers/svgtransport";

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

async function textAt(root: FakeDir, relPath: string): Promise<string> {
  const parts = relPath.split("/").filter(Boolean);
  let dir: FakeDir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]) as FakeDir;
  }
  const file = await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
  return file.text();
}

async function putText(root: FakeDir, relPath: string, content: string): Promise<void> {
  const parts = relPath.split("/").filter(Boolean);
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true }) as FakeDir;
  }
  const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fh.createWritable();
  await writable.write(new Blob([content]));
  await writable.close();
}

function sseResponse(content: string, usage = { prompt_tokens: 400, completion_tokens: 800, total_tokens: 1200, cost: 0.04 }): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", "x-request-id": "req_batch_regen" } });
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("batch SVG regeneration — prefs, prompt builder, unique batch stems, and streaming runner", () => {
  it("loads default 4, persists valid counts 1..9, and warns on corrupt storage (RULE 13)", () => {
    expect(loadRegenBatchPref()).toEqual({ count: 4, warning: false });
    saveRegenBatchPref(6);
    expect(loadRegenBatchPref()).toEqual({ count: 6, warning: false });
    saveRegenBatchPref(0);
    saveRegenBatchPref(99);
    expect(loadRegenBatchPref()).toEqual({ count: 6, warning: false });
    localStorage.setItem(REGEN_BATCH_PREF_KEY, "{bad-json");
    expect(loadRegenBatchPref()).toEqual({ count: 4, warning: true });
  });

  it("disambiguates colliding stems across split subfolders while keeping plain stems when unique", () => {
    const a1 = { ...svgSource("icon_1"), id: "split_01/icon_1_AI", relPath: "split_01/icon_1_AI.png", dirPath: "split_01" };
    const a2 = { ...svgSource("icon_2"), id: "split_01/icon_2_AI", relPath: "split_01/icon_2_AI.png", dirPath: "split_01" };
    expect(toBatchSourcesUnique([a1, a2]).map((u) => u.name)).toEqual(["icon_1_AI", "icon_2_AI"]);

    const b1 = { ...svgSource("icon_1"), id: "split_02/icon_1_AI", relPath: "split_02/icon_1_AI.png", dirPath: "split_02" };
    expect(toBatchSourcesUnique([a1, b1]).map((u) => u.name)).toEqual(["split_01/icon_1_AI", "split_02/icon_1_AI"]);
  });

  it("constructs batchRegenPrompt with manifest, explicit <title> rules, and every icon's code verbatim", () => {
    const text = batchRegenPrompt("Make strokes uniform 2px.", [
      { position: 1, name: "icon_1_AI", code: '<svg viewBox="0 0 24 24"><title>stale</title><path d="M1 1h2"/></svg>' },
      { position: 2, name: "icon_2_AI", code: '<svg viewBox="0 0 24 24"><circle cx="5" cy="5" r="3"/></svg>' },
    ]);
    expect(text).toContain("1 — icon_1_AI\n2 — icon_2_AI");
    expect(text).toContain("Make strokes uniform 2px.");
    expect(text).toContain("Required <title>: icon_1_AI");
    expect(text).toContain("Required <title>: icon_2_AI");
    expect(text).toContain('<svg viewBox="0 0 24 24"><title>stale</title><path d="M1 1h2"/></svg>');
    expect(text).toContain('<svg viewBox="0 0 24 24"><circle cx="5" cy="5" r="3"/></svg>');
  });

  it("regenerates 6 icons at perRequest = 4 in 2 batch requests (4 + 2), matching scrambled responses strictly by <title>", async () => {
    const root = new FakeDir("root");
    const metas = new Map<string, PairMeta>();
    const sources: SvgSource[] = [];
    const oldCodeOf = (i: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>stale_${i}</title><path d="M${i} 0h10"/></svg>`;

    for (let i = 1; i <= 6; i++) {
      const s = svgSource(`icon_${i}`);
      sources.push(s);
      await putText(root, s.relPath, "png");
      const v1Path = svgPathFor(s, 1);
      await putText(root, v1Path, oldCodeOf(i));
      metas.set(s.id, pairMetaFor(s, [svgVersion(v1Path)]));
    }

    const calls: { items: string[]; prompt: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const items = requestItems(init);
      const prompt = requestPrompt(init);
      calls.push({ items, prompt });
      // Return raw <svg> blocks in REVERSED / SCRAMBLED order!
      const reversed = [...items].reverse().map((relPath) => {
        const stem = (relPath.split("/").pop() ?? relPath).replace(/\.png$/, "");
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${stem}</title><path id="fixed-${stem}" d="M2 2h20v20H2z"/></svg>`;
      }).join("\n\n");
      return sseResponse(reversed);
    }));

    const events: RunEvent[] = [];
    const caps = capsFor(DEFAULT_CONFIG.model, []);
    const summary = await runGeneration({
      root,
      apiKey: "rk-test",
      config: { ...DEFAULT_CONFIG, retries: 0 },
      caps,
      params: sanitizeParams(caps, {}).params,
      prompt: "Unused main editor prompt",
      regen: { kind: "current-svg", presetName: "Fix Batch 4", presetText: "Fix stroke joins across batch.", perRequest: 4 },
      sources,
      metas,
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].items).toHaveLength(4);
    expect(calls[1].items).toHaveLength(2);
    for (let i = 1; i <= 4; i++) expect(calls[0].prompt).toContain(oldCodeOf(i));
    for (let i = 5; i <= 6; i++) expect(calls[1].prompt).toContain(oldCodeOf(i));

    expect(summary.saved).toBe(6);
    expect(summary.failed).toBe(0);
    expect(summary.missing).toBe(0);

    for (let i = 1; i <= 6; i++) {
      const s = sources[i - 1];
      expect(await textAt(root, svgPathFor(s, 1))).toBe(oldCodeOf(i));
      expect(await textAt(root, svgPathFor(s, 2))).toContain(`id="fixed-${s.stem}"`);
      const savedMeta = metas.get(s.id)!;
      expect(savedMeta.versions).toHaveLength(2);
      const v2 = savedMeta.versions[1];
      expect(v2.review).toBe("needs-review");
      expect(v2.prompt).toContain("Fix stroke joins across batch.");
      expect(v2.prompt).not.toContain("<svg");
      expect(v2.cost.basis).toBe("batch-split");
      expect(v2.cost.estimated).toBeCloseTo(i <= 4 ? 0.01 : 0.02, 5);
    }
  });

  it("isolates duplicate-title and missing-title blocks in a batch without corrupting healthy icons (RULE 5)", async () => {
    const root = new FakeDir("root");
    const metas = new Map<string, PairMeta>();
    const sources: SvgSource[] = [];
    for (let i = 1; i <= 4; i++) {
      const s = svgSource(`icon_${i}`);
      sources.push(s);
      await putText(root, s.relPath, "png");
      const v1Path = svgPathFor(s, 1);
      await putText(root, v1Path, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h5"/></svg>`);
      metas.set(s.id, pairMetaFor(s, [svgVersion(v1Path)]));
    }

    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${sources[3].stem}</title><path id="ok-4" d="M1 1h8"/></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${sources[1].stem}</title><path id="dup-a" d="M1 1h8"/></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${sources[1].stem}</title><path id="dup-b" d="M1 1h8"/></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path id="no-title-3" d="M1 1h8"/></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${sources[0].stem}</title><path id="ok-1" d="M1 1h8"/></svg>`,
    ].join("\n\n"))));

    const caps2 = capsFor(DEFAULT_CONFIG.model, []);
    const summary = await runGeneration({
      root,
      apiKey: "rk-test",
      config: { ...DEFAULT_CONFIG, retries: 0 },
      caps: caps2,
      params: sanitizeParams(caps2, {}).params,
      prompt: "Main",
      regen: { kind: "current-svg", presetName: "Fix", presetText: "Fix all icons.", perRequest: 4 },
      sources,
      metas,
      signal: new AbortController().signal,
      onEvent: () => {},
    });

    expect(summary.saved).toBe(2);
    expect(summary.missing).toBe(2);
    expect(await textAt(root, svgPathFor(sources[0], 2))).toContain('id="ok-1"');
    expect(await textAt(root, svgPathFor(sources[3], 2))).toContain('id="ok-4"');
    expect(metas.get(sources[1].id)!.versions).toHaveLength(1);
    expect(metas.get(sources[2].id)!.versions).toHaveLength(1);
  });
});
