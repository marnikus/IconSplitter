// svg_paste_overwrite.test.tsx — Paste in a row preview's corner (user,
// 2026-11-17): the clipboard's SVG code or PNG image is written OVER the file
// that preview shows. Red witnesses first: the buttons, the overwrite, the
// recoverable parking of the old bytes, undo/redo, paste-creates-v1 through the
// registration owner, and the honest refusals. Contract:
// docs/current/sor/svg-clipboard-paste.md.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePairMeta, serializePairMeta, type PairMeta } from "../src/lib/pairmeta";
import type { ImageVersion } from "../src/lib/svgimgreg";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { FOG, click, installSvgPanelHooks, mount, q, settle, text } from "./helpers/svgpanel";

installSvgPanelHooks();

const doc = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="${fill}"/></svg>`;
const V1 = doc("#c22f2f");
const AI_MAIN = "fog_AI_v2.png";
/** PNG signature + a few bytes: what imgfiles.isReadablePng proves. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7, 7]);

/** fog approved, AI image + one valid SVG version — or no SVG at all. */
function makeRoot(withSvg = true): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "old-ai-bytes"));
  const versions = withSvg ? [svgVersion("architecture/fog_AI.svg", { version: 1 })] : [];
  if (withSvg) arch.children.set("fog_AI.svg", new FakeFile("fog_AI.svg", 10, 3200, V1));
  // one accepted regeneration, so the AI preview's 🗑 is awake and Paste has a version file to hit
  arch.children.set(AI_MAIN, new FakeFile(AI_MAIN, 20, 3150, "old-ai-bytes"));
  const meta = pairFile("architecture", "fog_AI.png", { decision: "approved", versions });
  meta.imageVersions = [imgVersion(1, `architecture/${AI_MAIN}`)];
  meta.imagePreferred = 1;
  const sidecar = serializePairMeta(meta);
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", sidecar.length, 3200, sidecar));
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

/** A done image version record, the shape imgimport writes. */
const imgVersion = (version: number, file: string): ImageVersion => ({
  version, file, status: "done", prompt: "p", model: "m", requestId: null, error: null, updatedAt: "2026-11-01T00:00:00.000Z",
  usage: { input: null, output: null, total: null }, cost: { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" },
});

const arch = (root: FakeDir) => root.children.get("architecture") as FakeDir;
const file = (root: FakeDir, name: string) => arch(root).children.get(name) as FakeFile | undefined;
const bytesOf = async (f: FakeFile) => new Uint8Array(await (await f.getFile()).arrayBuffer());
const metaOf = (root: FakeDir): PairMeta => {
  const parsed = parsePairMeta((file(root, "fog_AI.svg.json") as FakeFile).text);
  if (!parsed.ok) throw new Error("the pair file no longer parses");
  return parsed.meta;
};
const trash = (root: FakeDir) => arch(root).children.get(".removed versions") as FakeDir | undefined;

/** The clipboard the paste button reads: a PNG item, text, both, or neither. */
function stubClipboard(opts: { text?: string; png?: Uint8Array; otherType?: string }): void {
  const items: { types: string[]; getType: (t: string) => Promise<Blob> }[] = [];
  if (opts.png) items.push({ types: ["image/png"], getType: async (t) => new Blob([opts.png as BlobPart], { type: t }) });
  if (opts.otherType) items.push({ types: [opts.otherType], getType: async (t) => new Blob([new Uint8Array([1, 2, 3]) as BlobPart], { type: t }) });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: async () => opts.text ?? "", read: async () => items, writeText: async () => undefined },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
});

async function mountRoot(root: FakeDir): Promise<void> {
  await mount(root);
  await settle();
}

describe("Paste sits in every preview's corner", () => {
  it("one Paste per preview that has a file to overwrite — rightmost, the 🗑 left of it", async () => {
    await mountRoot(makeRoot());
    const pasteAi = q(`[data-testid=svg-paste-ai-${FOG}]`);
    const pasteSvg = q(`[data-testid=svg-paste-svg-${FOG}]`);
    expect(pasteAi).not.toBeNull();
    expect(pasteSvg).not.toBeNull();
    expect(q(`[data-testid=svg-ai-${FOG}]`)?.contains(pasteAi as Node)).toBe(true);
    expect(q(`[data-testid=svg-prev-frame-${FOG}]`)?.contains(pasteSvg as Node)).toBe(true);
    // one corner cluster: the 🗑 (this preview has a version) left of Paste
    const can = q(`[data-testid=svg-ai-trash-${FOG}]`);
    expect(can).not.toBeNull();
    expect(can?.parentElement).toBe(pasteAi?.parentElement);
    const kids = [...(pasteAi?.parentElement?.children ?? [])];
    expect(kids.indexOf(can as HTMLElement)).toBeLessThan(kids.indexOf(pasteAi as HTMLElement));
    // no base face on a plain row → no base Paste either
    expect(q(`[data-testid=svg-paste-base-${FOG}]`)).toBeNull();
  });
});

describe("Paste overwrites the file the preview shows — recoverably", () => {
  it("a PNG from the clipboard replaces the AI source; the old bytes park in .removed versions; Undo swaps back, Redo forward", async () => {
    const root = makeRoot();
    await mountRoot(root);
    const before = await bytesOf(file(root, AI_MAIN) as FakeFile);
    stubClipboard({ png: PNG });
    await click(q(`[data-testid=svg-paste-ai-${FOG}]`)!);
    await vi.waitFor(async () => expect([...(await bytesOf(file(root, AI_MAIN) as FakeFile))]).toEqual([...PNG]));
    // the overwritten bytes are NOT destroyed: parked under a unique name
    const parked = [...(trash(root)?.children.values() ?? [])].filter((c) => c.name.startsWith(`${AI_MAIN}.overwritten-`));
    expect(parked).toHaveLength(1);
    expect([...(await bytesOf(parked[0] as FakeFile))]).toEqual([...before]);
    await click(q("[data-testid=hist-undo]")!);
    await vi.waitFor(async () => expect([...(await bytesOf(file(root, AI_MAIN) as FakeFile))]).toEqual([...before]));
    // the paste parked in its staging, so Redo can bring it back
    await click(q("[data-testid=hist-redo]")!);
    await vi.waitFor(async () => expect([...(await bytesOf(file(root, AI_MAIN) as FakeFile))]).toEqual([...PNG]));
  });

  it("SVG code from the clipboard replaces the shown version's file; Undo restores the old code", async () => {
    const root = makeRoot();
    await mountRoot(root);
    const pasted = doc("#123456");
    stubClipboard({ text: pasted });
    await click(q(`[data-testid=svg-paste-svg-${FOG}]`)!);
    await vi.waitFor(() => expect((file(root, "fog_AI.svg") as FakeFile).text).toBe(pasted));
    expect(q(`[data-testid=svg-prev-${FOG}]`)?.getAttribute("data-version")).toBe("1");
    await click(q("[data-testid=hist-undo]")!);
    await vi.waitFor(() => expect((file(root, "fog_AI.svg") as FakeFile).text).toBe(V1));
  });

  it("on a No SVG preview the paste CREATES v1 through the registration owner; Undo takes it back out", async () => {
    const root = makeRoot(false);
    await mountRoot(root);
    expect(q(`[data-testid=svg-prev-${FOG}]`)?.textContent).toContain("No SVG");
    expect(q(`[data-testid=svg-paste-svg-${FOG}]`)).not.toBeNull();
    const pasted = doc("#0000ee");
    stubClipboard({ text: pasted });
    await click(q(`[data-testid=svg-paste-svg-${FOG}]`)!);
    await vi.waitFor(() => expect((file(root, "fog_AI.svg") as FakeFile)?.text).toBe(pasted));
    expect(metaOf(root).versions.map((v) => v.version)).toEqual([1]);
    expect(q(`[data-testid=svg-ver-chip-${FOG}-1]`)).not.toBeNull();
    await click(q("[data-testid=hist-undo]")!);
    await vi.waitFor(() => expect(file(root, "fog_AI.svg")).toBeUndefined());
    expect(metaOf(root).versions).toEqual([]);
  });
});

describe("Paste refuses honestly", () => {
  it("text on a PNG preview, an image on the SVG preview, and code that fails the gate: one toast each, nothing written", async () => {
    const root = makeRoot();
    await mountRoot(root);
    stubClipboard({ text: "hello, not an image" });
    await click(q(`[data-testid=svg-paste-ai-${FOG}]`)!);
    await settle();
    expect(q("[data-testid=svg-toast]")?.className).toContain("error");
    expect(text("[data-testid=svg-toast]")).toContain("PNG");
    expect([...(await bytesOf(file(root, AI_MAIN) as FakeFile))]).not.toEqual([...PNG]);

    stubClipboard({ png: PNG });
    await click(q(`[data-testid=svg-paste-svg-${FOG}]`)!);
    await settle();
    expect(q("[data-testid=svg-toast]")?.className).toContain("error");
    expect((file(root, "fog_AI.svg") as FakeFile).text).toBe(V1);

    stubClipboard({ text: "<html><body>not svg</body></html>" });
    await click(q(`[data-testid=svg-paste-svg-${FOG}]`)!);
    await settle();
    expect(q("[data-testid=svg-toast]")?.className).toContain("error");
    expect(text("[data-testid=svg-toast]")).toContain("not <svg>");
    expect((file(root, "fog_AI.svg") as FakeFile).text).toBe(V1);

    stubClipboard({ otherType: "image/jpeg" });
    await click(q(`[data-testid=svg-paste-ai-${FOG}]`)!);
    await settle();
    expect(q("[data-testid=svg-toast]")?.className).toContain("error");
    expect(text("[data-testid=svg-toast]")).toContain("PNG");
    expect((file(root, AI_MAIN) as FakeFile).text).toBe("old-ai-bytes");
  });
});
