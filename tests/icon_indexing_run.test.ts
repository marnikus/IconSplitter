// icon_indexing_run.test.ts — the real indexing loop over an in-memory folder
// with a fake renderer + embedder (the browser/model seams). Pins: index files
// written next to each SVG, up-to-date icons skipped, image vector reused when
// only metadata changed, per-icon failure isolation (RULE 5), cancellation, and
// reading the index back during a scan.
import { describe, expect, it } from "vitest";
import { runIndexing } from "../src/svgBuilder/indexer/runIndexing";
import { readIconIndex } from "../src/svgBuilder/indexer/indexstore";
import type { IndexRuntime, RenderedIcon } from "../src/svgBuilder/indexer/runtime";
import type { BuilderIconAsset } from "../src/lib/svgBuilder/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20"/></svg>';

function asset(id: string, over: Partial<BuilderIconAsset> = {}): BuilderIconAsset {
  return { id, base: id, suffix: "", label: id, category: "c", tags: [], svgPath: `icons/${id}_AI.svg`, svgName: `${id}_AI.svg`,
    version: 1, fingerprint: `f-${id}`, metaPath: `icons/${id}_AI.svg.json`, approved: true, ...over };
}

function folder(ids: string[]): FakeDir {
  const root = new FakeDir("root");
  const icons = new FakeDir("icons");
  root.children.set("icons", icons);
  for (const id of ids) icons.children.set(`${id}_AI.svg`, new FakeFile(`${id}_AI.svg`, SVG.length, 1, SVG));
  return root;
}

function fakeRuntime(opts: { failOn?: string } = {}) {
  const calls = { render: 0, image: 0, text: 0, loads: 0 };
  const runtime: IndexRuntime = {
    render: async (): Promise<RenderedIcon> => { calls.render++; return { rgba: new Uint8ClampedArray(4), width: 1, height: 1 }; },
    createEmbedder: async () => ({
      load: async (cb) => { calls.loads++; cb({ file: "model.onnx", loaded: 1, total: 1 }); },
      embed: async (input) => {
        if (input.id === opts.failOn) throw new Error("boom");
        if (input.pixels) calls.image++;
        if (input.text) calls.text++;
        return { image: input.pixels ? Float32Array.from([1, 0]) : null, text: input.text ? Float32Array.from([0, 1]) : null };
      },
      dispose: () => undefined,
    }),
  };
  return { runtime, calls };
}

const job = (root: FakeDir, assets: BuilderIconAsset[], index = new Map(), signal = new AbortController().signal) => ({
  root, assets, index, signal, onProgress: () => undefined,
  readSvg: async (id: string) => (assets.some((a) => a.id === id) ? SVG : null),
});

describe("icons indexing", () => {
  it("writes <svg>.index.json next to each approved SVG and reads it back", async () => {
    const root = folder(["a", "b"]);
    const assets = [asset("a", { title: "Apple", keywords: ["fruit"] }), asset("b")];
    const { runtime, calls } = fakeRuntime();
    const out = await runIndexing(job(root, assets), runtime);
    expect(out).toMatchObject({ indexed: 2, skipped: 0, failed: 0, cancelled: false });
    expect([...(root.children.get("icons") as FakeDir).children.keys()].sort())
      .toEqual(["a_AI.svg", "a_AI.svg.index.json", "b_AI.svg", "b_AI.svg.index.json"]);
    expect(calls).toMatchObject({ render: 2, image: 2, text: 1, loads: 1 });
    const back = await readIconIndex(root, assets);
    expect(back.get("a")!.vectors.text).not.toBeNull();
    expect(back.get("b")!.vectors.text).toBeNull();
  });

  it("skips up-to-date icons and never loads the models when nothing is to do", async () => {
    const root = folder(["a"]);
    const first = await runIndexing(job(root, [asset("a")]), fakeRuntime().runtime);
    const { runtime, calls } = fakeRuntime();
    const again = await runIndexing(job(root, [asset("a")], first.index), runtime);
    expect(again).toMatchObject({ indexed: 0, skipped: 1 });
    expect(calls.loads).toBe(0);
  });

  it("re-embeds only the text when just the metadata changed", async () => {
    const root = folder(["a"]);
    const first = await runIndexing(job(root, [asset("a")]), fakeRuntime().runtime);
    const { runtime, calls } = fakeRuntime();
    await runIndexing(job(root, [asset("a", { title: "Apple" })], first.index), runtime);
    expect(calls).toMatchObject({ render: 0, image: 0, text: 1 });
  });

  it("isolates a failing icon and keeps indexing the rest", async () => {
    const root = folder(["a", "b", "c"]);
    const out = await runIndexing(job(root, [asset("a"), asset("b"), asset("c")]), fakeRuntime({ failOn: "b" }).runtime);
    expect(out).toMatchObject({ indexed: 2, failed: 1 });
    expect((root.children.get("icons") as FakeDir).children.has("b_AI.svg.index.json")).toBe(false);
  });

  it("stops when cancelled", async () => {
    const root = folder(["a", "b"]);
    const ctl = new AbortController();
    ctl.abort();
    const out = await runIndexing(job(root, [asset("a"), asset("b")], new Map(), ctl.signal), fakeRuntime().runtime);
    expect(out).toMatchObject({ cancelled: true, indexed: 0 });
  });

  it("ignores an index file written for another icon", async () => {
    const root = folder(["a"]);
    await runIndexing(job(root, [asset("a")]), fakeRuntime().runtime);
    expect((await readIconIndex(root, [asset("zzz", { svgPath: "icons/a_AI.svg" })])).size).toBe(0);
  });
});
