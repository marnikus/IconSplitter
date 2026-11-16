import { describe, expect, it, vi } from "vitest";
import { parsePairMeta, serializePairMeta, withReview } from "../src/lib/pairmeta";
import { withPreferred } from "../src/lib/pairpreferred";
import { mainImageOf, parseImageVersions } from "../src/lib/svgimgreg";
import { chooseMainImage, type ImageChoiceCtx } from "../src/svg/imagechoice";
import { reserveSources } from "../src/svg/jobstate";
import { toRow } from "../src/svg/rowmodel";
import type { SvgRefs } from "../src/svg/types";
import { BrokenFile, LockedFile, FakeDir, FakeFile } from "./helpers/fakefs";
import { pairMetaFor, svgSource, svgVersion } from "./helpers/svgpair";

function fixture() {
  const source = svgSource("image-choice", { name: "fog_AI.png" });
  const root = new FakeDir("root");
  const arch = new FakeDir("architecture");
  const versions = new FakeDir("AI source regeneration versions");
  root.children.set("architecture", arch);
  arch.children.set(source.name, new FakeFile(source.name, 3, 1, "original"));
  arch.children.set(versions.name, versions);
  const meta = pairMetaFor(source, [svgVersion("architecture/fog_AI.svg")], "pending");
  meta.imageVersions = parseImageVersions([1, 2].map((version) => ({
    version, file: `architecture/${versions.name}/fog_AI_v${version}.png`,
    status: version === 1 ? "done" : "failed", prompt: "p", model: "m", updatedAt: "2026-10-01T10:00:00Z",
  })));
  versions.children.set("fog_AI_v1.png", new FakeFile("fog_AI_v1.png", 3, 1, "chosen-image"));
  const record = new FakeFile("fog_AI.svg.json", 1, 1, serializePairMeta(meta));
  arch.children.set(record.name, record);
  const rows = [toRow(source, meta, false)];
  const refs: SvgRefs = { root: { current: root }, metas: new Map([[source.id, meta]]), abort: { current: null }, queue: { current: [] }, key: { current: null }, scanKey: { current: null }, seq: { current: { started: 0, latest: 0 } } };
  const ctx: ImageChoiceCtx = { refs, rows, say: vi.fn(), setRowsFn: (fn) => { ctx.rows = fn(ctx.rows); } };
  const stored = () => {
    const parsed = parsePairMeta(record.text);
    if (!parsed.ok) throw new Error("pair record no longer parses");
    return parsed.meta;
  };
  return { ctx, source, meta, arch, versions, record, stored };
}

describe("accepting an AI source version", () => {
  it("saves approval and the actual main pointer, preserving live SVG review/history", async () => {
    const f = fixture();
    const latest = withPreferred(withReview(f.meta, "declined"), 1);
    f.ctx.refs.metas.set(f.source.id, latest); // newer than the row held by the action
    await chooseMainImage(f.ctx, f.source.id, 1);
    expect(f.stored()).toMatchObject({ decision: "approved", imagePreferred: 1, review: "declined", preferred: 1 });
    expect(f.stored().versions).toEqual(latest.versions);
    expect(f.stored().imageVersions).toEqual(latest.imageVersions);
    expect(mainImageOf(f.stored(), f.source.relPath)).toBe(f.meta.imageVersions[0].file);
    expect(f.ctx.rows[0].review).toBe("declined");
    await chooseMainImage(f.ctx, f.source.id, null);
    expect(mainImageOf(f.stored(), f.source.relPath)).toBe(f.source.relPath);
    expect(f.stored().decision).toBe("approved");
  });

  it.each([2, 999, NaN])("rejects failed or unknown version %s without changing the source or approval", async (version) => {
    const f = fixture();
    const before = f.record.text;
    await chooseMainImage(f.ctx, f.source.id, version);
    expect(f.record.text).toBe(before);
    expect(f.ctx.refs.metas.get(f.source.id)).toBe(f.meta);
    expect(f.ctx.say).toHaveBeenLastCalledWith(expect.stringContaining("not a completed"), true);
  });

  it.each(["missing", "unreadable", "empty", "corrupt", "save-failed"])("fails closed for %s image/record", async (failure) => {
    const f = fixture();
    if (failure === "missing") f.versions.children.delete("fog_AI_v1.png");
    if (failure === "unreadable") f.versions.children.set("fog_AI_v1.png", new LockedFile("fog_AI_v1.png"));
    if (failure === "empty") f.versions.children.set("fog_AI_v1.png", new FakeFile("fog_AI_v1.png", 0, 1, ""));
    if (failure === "corrupt") f.ctx.rows[0].corrupt = true;
    if (failure === "save-failed") f.arch.children.set("fog_AI.svg.tmp.json", new BrokenFile("fog_AI.svg.tmp.json"));
    const before = f.record.text;
    await chooseMainImage(f.ctx, f.source.id, 1);
    expect(f.record.text).toBe(before);
    expect(f.ctx.rows[0].meta).toBe(f.meta);
    expect(f.ctx.refs.metas.get(f.source.id)).toBe(f.meta);
    expect(f.ctx.say).toHaveBeenLastCalledWith(expect.any(String), true);
  });

  it("retains source leases and refuses missing root, row or metadata", async () => {
    const f = fixture();
    const release = reserveSources(f.ctx, [f.source.id]);
    expect(release).not.toBeNull();
    await chooseMainImage(f.ctx, f.source.id, 1);
    expect(f.ctx.say).toHaveBeenLastCalledWith(expect.stringContaining("in use"), true);
    release!();
    f.ctx.refs.root.current = null;
    await chooseMainImage(f.ctx, f.source.id, 1);
    expect(f.ctx.say).toHaveBeenLastCalledWith(expect.stringContaining("No folder"), true);
    f.ctx.refs.root.current = new FakeDir("root");
    await chooseMainImage(f.ctx, "unknown", 1);
    expect(f.ctx.say).toHaveBeenLastCalledWith(expect.stringContaining("No folder"), true);
    f.ctx.rows[0].meta = null;
    f.ctx.refs.metas.delete(f.source.id);
    await chooseMainImage(f.ctx, f.source.id, 1);
    expect(f.ctx.say).toHaveBeenLastCalledWith(expect.stringContaining("no record"), true);
    expect(f.stored().decision).toBe("pending");
  });
});
