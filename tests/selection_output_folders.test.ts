// The real Selection V2 scan must prune whole output trees, not media suffixes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCAN_IDLE } from "../src/lib/scanseq";
import { pairEntries, pairId } from "../src/lib/pairing";
import { serializePairMeta } from "../src/lib/pairmeta";
import { parseImageVersions, preferredImagePath } from "../src/lib/svgimgreg";
import { initialSelState, type SelState } from "../src/selection/state";
import { rescan } from "../src/selection/rootsource";
import { resolveFile } from "../src/selection/handles";
import { readSvgText } from "../src/svg/svgfiles";
import { getAppState, patchV2, patchView, resetAppStore } from "../src/state/appstore";
import { loadSourceIndex } from "../src/state/sourceindex";
import { BrokenFile, FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";

const EXCLUDED = ["eXpOrT", "aI SoUrCe ReGeNeRaTiOn VeRsIoNs", "SvG VeRsIoNs"];
const COURT = pairId("architecture", "court", "");

describe("Selection V2 output-folder exclusions", () => {
  beforeEach(() => { localStorage.clear(); resetAppStore(); });

  it.each(EXCLUDED)("prunes %s at depth before reading media or sidecars", async (name) => {
    const root = sourceRoot();
    const excluded = folder(root.children.get("architecture") as FakeDir, "deeper", name);
    const nested = folder(excluded, "nested", "deeper");
    for (const ext of ["svg", "jpg", "jpeg", "eps", "png", "gif", "webp", "bmp", "tiff"]) {
      nested.children.set(`ghost.${ext}`, new FakeFile(`ghost.${ext}`));
      nested.children.set(`ghost_AI.${ext}`, new FakeFile(`ghost_AI.${ext}`));
    }
    excluded.children.set("ghost.svg", new FakeFile("ghost.svg"));
    excluded.children.set("ghost_AI.svg.json", new FakeFile("ghost_AI.svg.json", 5, 10, "{bad"));
    excluded.children.set("locked.png", new BrokenFile("locked.png", 99));
    const entries = vi.spyOn(excluded, "entries");
    const h = harness(root);
    await h.scan();
    expect(h.state().pairs.map((p) => [p.pairId, p.decision])).toEqual([[COURT, "approved"]]);
    expect(h.state().corruptFiles).toEqual([]);
    expect(h.state().scope).toEqual({ split: false, outside: 0 });
    expect(h.messages).toEqual([]);
    expect(entries).not.toHaveBeenCalled();
    expect([...loadSourceIndex().keys()]).toEqual([COURT]);
  });

  it.each(EXCLUDED)("does not traverse or read metadata when the picked root is %s", async (name) => {
    const root = new FakeDir(name);
    root.children.set("ghost.svg", new FakeFile("ghost.svg"));
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 5, 10, "{bad"));
    folder(root, "nested").children.set("ghost_AI.jpg", new FakeFile("ghost_AI.jpg"));
    const entries = vi.spyOn(root, "entries");
    const files = vi.spyOn(root, "getFileHandle");
    const h = harness(root);
    await h.scan();
    expect(h.state().pairs).toEqual([]);
    expect(h.state().corrupt).toBe(false);
    expect(h.state().corruptFiles).toEqual([]);
    expect(h.state().busy).toBeNull();
    expect(h.messages).toEqual([]);
    expect(entries).not.toHaveBeenCalled();
    expect(files).not.toHaveBeenCalled();
  });

  it("keeps near-miss source directories instead of substring matching", async () => {
    const root = new FakeDir("sources");
    const names = ["exports", "my export", "exported", "export-source", "SVG versions originals", "AI source regeneration versions backup"];
    for (const name of names) {
      const dir = folder(root, name);
      dir.children.set("icon.jpeg", new FakeFile("icon.jpeg"));
      dir.children.set("icon_AI.jpeg", new FakeFile("icon_AI.jpeg"));
    }
    const h = harness(root);
    await h.scan();
    expect(h.state().pairs.map((p) => p.relDir).sort()).toEqual([...names].sort());
    expect(h.state().pairs.every((p) => p.source !== null && p.ai !== null)).toBe(true);
  });

  it("ignores split markers inside excluded trees when establishing scope", async () => {
    const root = sourceRoot();
    const hiddenSplit = folder(root, "export", "_split_output", "split_01");
    hiddenSplit.children.set("ghost.png", new FakeFile("ghost.png"));
    hiddenSplit.children.set("ghost_AI_01.png", new FakeFile("ghost_AI_01.png"));
    const h = harness(root);
    await h.scan();
    expect(h.state().scope).toEqual({ split: false, outside: 0 });
    expect(h.state().pairs.map((p) => p.pairId)).toEqual([COURT]);
  });

  it("removes stale output rows/checks/index entries while retaining a real checked pair", async () => {
    const root = sourceRoot();
    const h = harness(root);
    const stale = pairEntries([{ name: "ghost.svg", relPath: "export/ghost.svg", dirPath: "export", size: 10, mtime: 1, error: null }])[0];
    h.ctx.state.current = { ...initialSelState(), pairs: [{ ...stale, decision: "pending", reviewedAt: null }], selectedId: stale.pairId };
    patchV2({ checked: [stale.pairId, COURT], anchorId: stale.pairId });
    patchView({ selectedId: stale.pairId });
    await h.scan();
    expect(h.state().pairs.map((p) => p.pairId)).toEqual([COURT]);
    expect(h.state().selectedId).toBe(COURT);
    expect(getAppState().v2.checked).toEqual([COURT]);
    expect(getAppState().v2.anchorId).toBeNull();
    expect([...loadSourceIndex().keys()]).toEqual([COURT]);
  });

  it("treats a completed empty scan as authoritative for checked ids", async () => {
    const root = new FakeDir("sources");
    folder(root, "export").children.set("ghost.svg", new FakeFile("ghost.svg"));
    patchV2({ checked: ["old-export-row"], anchorId: "old-export-row" });
    const h = harness(root);
    await h.scan();
    expect(h.state().pairs).toEqual([]);
    expect(getAppState().v2.checked).toEqual([]);
    expect(getAppState().v2.anchorId).toBeNull();
    expect([...loadSourceIndex().keys()]).toEqual([]);
  });

  it("preserves valid checks and the range anchor without rewriting their state", async () => {
    patchV2({ checked: [COURT], anchorId: COURT });
    const before = getAppState().v2;
    const h = harness(sourceRoot());
    await h.scan();
    await h.scan();
    expect(getAppState().v2).toBe(before);
    expect(getAppState().v2.checked).toEqual([COURT]);
    expect(getAppState().v2.anchorId).toBe(COURT);
  });

  it("does not block explicit version reads used by main images and SVG previews", async () => {
    const root = sourceRoot();
    const imagePath = "architecture/AI source regeneration versions/court_AI_v1.png";
    const images = folder(root.children.get("architecture") as FakeDir, "AI source regeneration versions");
    images.children.set("court_AI_v1.png", new FakeFile("court_AI_v1.png", 10, 10, "image bytes"));
    const svgs = folder(root.children.get("architecture") as FakeDir, "SVG versions");
    svgs.children.set("court.svg", new FakeFile("court.svg", 10, 10, "<svg/>"));
    const h = harness(root);
    await h.scan();
    const versions = parseImageVersions([{ version: 1, file: imagePath, status: "done", prompt: "", model: "test", requestId: null, error: null, updatedAt: "2026-10-24T10:00:00.000Z" }]);
    const path = preferredImagePath(versions, 1, "fallback.png");
    expect(path).toBe(imagePath);
    const image = await resolveFile(root, path);
    expect(await (await image!.getFile()).text()).toBe("image bytes");
    expect(await readSvgText(root, "architecture/SVG versions/court.svg")).toBe("<svg/>");
    expect(h.state().pairs.map((p) => p.pairId)).toEqual([COURT]);
  });
});

function sourceRoot(): FakeDir {
  const root = new FakeDir("sources");
  const arch = folder(root, "architecture");
  for (const name of ["court.png", "court_AI.png"]) arch.children.set(name, new FakeFile(name));
  const text = serializePairMeta(pairFile("architecture", "court_AI.png", { decision: "approved" }));
  arch.children.set("court_AI.svg.json", new FakeFile("court_AI.svg.json", text.length, 10, text));
  return root;
}

function folder(root: FakeDir, ...names: string[]): FakeDir {
  let dir = root;
  for (const name of names) {
    const next = new FakeDir(name);
    dir.children.set(name, next);
    dir = next;
  }
  return dir;
}

function harness(root: FakeDir) {
  const ctx = { root: { current: root }, state: { current: initialSelState() }, seq: { current: SCAN_IDLE }, hist: {} as Parameters<typeof rescan>[0]["hist"] };
  const set: Parameters<typeof rescan>[1] = (next) => {
    ctx.state.current = typeof next === "function" ? next(ctx.state.current) : next;
  };
  const messages: string[] = [];
  return { ctx, state: (): SelState => ctx.state.current, messages, scan: () => rescan(ctx, set, (m) => { messages.push(m); }) };
}
