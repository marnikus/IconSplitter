// svg_register_images_ui.test.tsx — the "Register AI sources" button of the
// Generate SVG tab (user request 2026-11-02): a folder whose AI source images the
// app did not record still gets them into the pair's own image history, with the
// newest NUMBERED one made the main image — and the row thereafter behaves like a
// regeneration the tab wrote. Also pins the honest edges: the pair's own image is
// never re-registered and a folder with only it says so, a file that is not a PNG
// is not recorded, a second click adds nothing, a busy pair is refused.
import { act } from "react";
import { describe, expect, it } from "vitest";
import { parsePairMeta, serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { reserveSources, SOURCE_BUSY } from "../src/svg/jobstate";
import { runRegisterImagesFor } from "../src/svg/registerimages";
import { toListRow, toRow } from "../src/svg/rowmodel";
import { svgSource, pairMetaFor } from "./helpers/svgpair";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { FOG, click, input, installSvgPanelHooks, mount, q, settle, text, unmountPanel } from "./helpers/svgpanel";
import { armCompletionSound } from "../src/ui/completionSound";
import { completionAudio, flushCompletionAudio, recordCompletionAudio } from "./helpers/completionAudio";

installSvgPanelHooks();

/** A file whose bytes really start like a PNG, as the check requires. */
function pngFile(name: string, mtime = 3200): FakeFile {
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x20, 0x20, 0x20, 0x20]);
  const file = new FakeFile(name, bytes.length, mtime, "png");
  file.data = new Blob([bytes]);
  return file;
}

/** architecture/fog with its reference image, its AI image and whatever else is on disk. */
function rootWith(extra: Record<string, FakeDir | FakeFile>, imageVersions: Parameters<typeof pairMetaFor>[1] = []): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", pngFile("fog.png", 3000));
  arch.children.set("fog_AI.png", pngFile("fog_AI.png", 3100));
  for (const [name, file] of Object.entries(extra)) arch.children.set(name, file);
  const source = svgSource(FOG, { name: "fog_AI.png" });
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3300, serializePairMeta(pairMetaFor(source, [], "approved"))));
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3300, withImages(pairMetaFor(source, [], "approved"), imageVersions)));
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

function withImages(meta: ReturnType<typeof pairMetaFor>, versions: Parameters<typeof pairMetaFor>[1]): string {
  return serializePairMeta({ ...meta, imageVersions: versions as never });
}

function pairFileOnDisk(root: FakeDir) {
  const file = (root.children.get("architecture") as FakeDir).children.get("fog_AI.svg.json") as FakeFile;
  const parsed = parsePairMeta(file.text);
  if (!parsed.ok) throw new Error("the pair file no longer parses");
  return parsed.meta;
}

/** The mutable refs a real panel carries — leases and the queue live on them. */
function refsFor(root: FakeDir) {
  return {
    root: { current: root }, metas: new Map(), abort: { current: null },
    queue: { current: [] }, key: { current: null },
  } as never;
}

/** A context as the panel builds it, with the two writers the action uses. */
function ctxFor(root: FakeDir) {
  const source = svgSource(FOG, { name: "fog_AI.png" });
  const row = toRow(source, pairFileOnDisk(root), false);
  const said: { msg: string; err: boolean }[] = [];
  const ctx = {
    refs: refsFor(root),
    rows: [row],
    say: (msg: string, err = false) => { said.push({ msg, err }); },
    setRowsFn: (fn: (rows: typeof row[]) => typeof row[]) => { ctx.rows = fn(ctx.rows); },
  };
  return { ctx, said };
}

describe("the pair's own AI image", () => {
  it("is already what the pair shows — nothing is recorded and the line says so", async () => {
    const root = rootWith({});
    const { ctx, said } = ctxFor(root);
    await runRegisterImagesFor(ctx as never, [FOG]);
    expect(pairFileOnDisk(root).imageVersions).toEqual([]);
    expect(said.at(-1)).toEqual({
      msg: "No other AI source for fog_AI in 1 selected folder — the original fog_AI.png is already its image",
      err: false,
    });
  });
});

describe("more AI source images on disk", () => {
  it("records a numbered regeneration the app never wrote and makes it the main image", async () => {
    const versions = new FakeDir("AI source regeneration versions");
    versions.children.set("fog_AI_v3.png", pngFile("fog_AI_v3.png"));
    const root = rootWith({ "AI source regeneration versions": versions });
    const { ctx, said } = ctxFor(root);
    await runRegisterImagesFor(ctx as never, [FOG]);
    const meta = pairFileOnDisk(root);
    expect(meta.imageVersions.map((v) => [v.version, v.file, v.status, v.model])).toEqual([
      [3, "architecture/AI source regeneration versions/fog_AI_v3.png", "done", "existing file"],
    ]);
    expect(meta.imagePreferred).toBe(3);
    expect(ctx.rows[0].meta?.imagePreferred).toBe(3);
    expect(said.at(-1)).toEqual({ msg: "1 existing AI source registered — v3 is now the main image", err: false });
  });

  it("dates a found image by the file's own time, never by the click (2026-11-02)", async () => {
    const versions = new FakeDir("AI source regeneration versions");
    const old = Date.parse("2025-02-03T04:05:06.000Z");
    versions.children.set("fog_AI_v3.png", pngFile("fog_AI_v3.png", old));
    const root = rootWith({ "AI source regeneration versions": versions });
    const { ctx } = ctxFor(root);
    await runRegisterImagesFor(ctx as never, [FOG]);
    const [record] = pairFileOnDisk(root).imageVersions;
    expect(record.updatedAt).toBe("2025-02-03T04:05:06.000Z");
    // "AI source created" reads that time rather than the registration moment
    expect(toListRow(ctx.rows[0]).aiCreatedAt).toBe(old);
  });

  it("takes an unnumbered copy in under the next free number without moving the main image", async () => {
    const root = rootWith({ "fog_AI-copy.png": pngFile("fog_AI-copy.png") });
    const { ctx, said } = ctxFor(root);
    await runRegisterImagesFor(ctx as never, [FOG]);
    const meta = pairFileOnDisk(root);
    expect(meta.imageVersions.map((v) => [v.version, v.file])).toEqual([[1, "architecture/fog_AI-copy.png"]]);
    expect(meta.imagePreferred).toBeNull(); // the pair still shows its own AI image
    expect(said.at(-1)?.msg).toBe("1 existing AI source registered — the main image did not change");
  });
});

describe("the honest edges", () => {
  it("never records a file that is not a readable PNG, and says what it skipped", async () => {
    const root = rootWith({ "fog_AI_v2.png": new FakeFile("fog_AI_v2.png", 10, 3200, "not a png") });
    const { ctx, said } = ctxFor(root);
    await runRegisterImagesFor(ctx as never, [FOG]);
    expect(pairFileOnDisk(root).imageVersions).toEqual([]);
    expect(said.at(-1)).toEqual({ msg: "1 PNG file found but none could be registered", err: true });
  });

  it("adds nothing the second time", async () => {
    const root = rootWith({ "fog_AI-copy.png": pngFile("fog_AI-copy.png") });
    await runRegisterImagesFor(ctxFor(root).ctx as never, [FOG]);
    const again = ctxFor(root);
    await runRegisterImagesFor(again.ctx as never, [FOG]);
    expect(pairFileOnDisk(root).imageVersions).toHaveLength(1);
    expect(again.said.at(-1)?.msg).toBe("No other AI source for fog_AI in 1 selected folder — the original fog_AI.png is already its image");
  });

  it("refuses a pair another process holds, changing nothing", async () => {
    const root = rootWith({ "fog_AI-copy.png": pngFile("fog_AI-copy.png") });
    const { ctx, said } = ctxFor(root);
    const held = reserveSources(ctx as never, [FOG]);
    expect(held).not.toBeNull(); // the panel holds this pair while it uploads/edits
    try {
      await runRegisterImagesFor(ctx as never, [FOG]);
    } finally {
      held?.();
    }
    expect(said.at(-1)).toEqual({ msg: SOURCE_BUSY, err: true });
    expect(pairFileOnDisk(root).imageVersions).toEqual([]);
  });
});

describe("the button in the tab", () => {
  const SPLIT_ID = pairId("split_01", "download-icon-01", "_01");

  /** .../download-icon-01_AI/split_01/download-icon-01_AI_01.png + the pre-split image beside it. */
  function splitRoot(): FakeDir {
    const root = new FakeDir("split_root");
    const dir = new FakeDir("split_01");
    dir.children.set("download-icon-01.png", pngFile("download-icon-01.png", 3000));
    dir.children.set("download-icon-01_AI_01.png", pngFile("download-icon-01_AI_01.png", 3100));
    dir.children.set("download-icon-01_AI.png", pngFile("download-icon-01_AI.png", 3200));
    root.children.set("split_01", dir);
    const recs = [{
      pair_id: SPLIT_ID, source: "split_01/download-icon-01.png",
      ai_result: "split_01/download-icon-01_AI_01.png", decision: "approved", reviewed_at: "2026-11-01T09:00:00.000Z",
    }];
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
    return root;
  }

  it("is disabled with nothing selected and registers the selected folder on a click", async () => {
    recordCompletionAudio();
    armCompletionSound();
    const root = splitRoot();
    await mount(root);
    expect(input("[data-testid=svg-register-images]").hasAttribute("disabled")).toBe(true);
    await act(async () => input(`[data-testid=svg-check-${SPLIT_ID}]`).click());
    await settle();
    await click(q("[data-testid=svg-register-images]") as HTMLElement);
    await settle();
    const file = (root.children.get("split_01") as FakeDir).children.get("download-icon-01_AI_01.svg.json") as FakeFile;
    const parsed = parsePairMeta(file.text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.meta.imageVersions.map((v) => [v.version, v.file])).toEqual([[1, "split_01/download-icon-01_AI.png"]]);
    expect(parsed.meta.imagePreferred).toBeNull(); // the split image stays what the pair shows
    expect(text("[data-testid=svg-toast]")).toBe("1 existing AI source registered — the main image did not change");
    expect(text(`[data-testid=svg-ai-chip-${SPLIT_ID}-1]`)).toBe("v1");
    // The pass reports through the shared bar and is audible when it ends.
    expect(text("[data-testid=register-images-progress-title]")).toBe("Registering AI sources complete");
    expect(text("[data-testid=register-images-progress-percent]")).toBe("100%");
    expect(q("[data-testid=register-images-progress-header]")?.className).toContain("complete");
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(1);
    await unmountPanel();
  });
});

describe("hidden AI source versions are repaired (2026-11-06 report)", () => {
  const failed = (version: number, file: string) => ({
    version, file, status: "failed", prompt: "", model: "m", requestId: null, error: "timeout", updatedAt: "2026-11-02T00:00:00.000Z",
    usage: { input: null, output: null, total: null }, cost: { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" },
  });

  it("a recorded-but-failed image whose PNG is on disk becomes a usable version and the main image", async () => {
    const root = rootWith({ "fog_AI_v2.png": pngFile("fog_AI_v2.png") }, [failed(2, "architecture/fog_AI_v2.png")] as never);
    const { ctx } = ctxFor(root);
    await runRegisterImagesFor(ctx as never, [FOG]);
    const meta = pairFileOnDisk(root);
    expect(meta.imageVersions.map((v) => [v.version, v.status, v.error])).toEqual([[2, "done", null]]);
    expect(meta.imagePreferred).toBe(2);
  });

  it("a failed record whose file is not a readable PNG stays failed and is counted as skipped", async () => {
    const root = rootWith({ "fog_AI_v2.png": new FakeFile("fog_AI_v2.png", 4, 3200, "nope") }, [failed(2, "architecture/fog_AI_v2.png")] as never);
    const { ctx, said } = ctxFor(root);
    await runRegisterImagesFor(ctx as never, [FOG]);
    expect(pairFileOnDisk(root).imageVersions[0].status).toBe("failed");
    expect(said.at(-1)?.msg).toContain("found but none could be registered");
  });
});
