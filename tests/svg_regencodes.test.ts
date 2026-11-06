// @vitest-environment node
// svg_regencodes.test.ts — the one reader of a regeneration's current SVG code
// (2026-10-20). The confirmation previews these texts and the queued batch
// carries them, so what is shown is what is sent; an unreadable or missing code
// is a NAMED row that never enters the plan (no silent main-prompt fallback).
import { describe, expect, it } from "vitest";
import { loadRegenCodes, readRegenCode } from "../src/svg/regencodes";
import { toRow } from "../src/svg/rowmodel";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairMetaFor, svgPathFor, svgSource, svgVersion } from "./helpers/svgpair";

const CODE_V1 = '<svg viewBox="0 0 24 24"><path d="M1 1h22"/></svg>';
const CODE_V2 = '<svg viewBox="0 0 24 24"><path d="M2 2h20"/></svg>';

function folderWith(files: Record<string, string>): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  root.children.set("architecture", arch);
  for (const [path, text] of Object.entries(files)) {
    const name = path.split("/").pop() as string;
    arch.children.set(name, new FakeFile(name, text.length, 1, text));
  }
  return root;
}

describe("readRegenCode — the version the row shows", () => {
  it("reads the newest valid version and reports its path and version", async () => {
    const source = svgSource("pair_1");
    const v1 = svgPathFor(source, 1);
    const root = folderWith({ [v1]: CODE_V1 });
    const row = toRow(source, pairMetaFor(source, [svgVersion(v1)]), false);
    expect(await readRegenCode(root, row)).toEqual({
      sourceId: source.id, name: source.name, version: 1, svgPath: v1, code: CODE_V1,
    });
  });

  it("prefers the version the user chose (I-54), not blindly the newest", async () => {
    const source = svgSource("pair_1");
    const v1 = svgPathFor(source, 1);
    const v2 = svgPathFor(source, 2);
    const root = folderWith({ [v1]: CODE_V1, [v2]: CODE_V2 });
    const meta = pairMetaFor(source, [svgVersion(v1), svgVersion(v2, { version: 2 })], "approved");
    const row = { ...toRow(source, meta, false), preferred: { ...svgVersion(v2, { version: 2 }) } };
    const out = await readRegenCode(root, row);
    expect(out?.version).toBe(2);
    expect(out?.code).toBe(CODE_V2);
  });

  it("answers null for a row with no usable version", async () => {
    const source = svgSource("pair_1");
    const row = toRow(source, pairMetaFor(source, []), false);
    expect(await readRegenCode(folderWith({}), row)).toBeNull();
  });

  it("keeps the code null when the file is gone, so the caller can exclude it", async () => {
    const source = svgSource("pair_1");
    const v1 = svgPathFor(source, 1);
    const row = toRow(source, pairMetaFor(source, [svgVersion(v1)]), false);
    const out = await readRegenCode(folderWith({}), row);
    expect(out?.code).toBeNull();
    expect(out?.svgPath).toBe(v1);
  });
});

describe("loadRegenCodes — the whole selection, in pick order", () => {
  it("collects the readable codes and names the unreadable ones", async () => {
    const a = svgSource("pair_1");
    const b = svgSource("pair_2");
    const c = svgSource("pair_3");
    const root = folderWith({ [svgPathFor(a, 1)]: CODE_V1, [svgPathFor(b, 1)]: CODE_V2 });
    const rows = [a, b, c].map((s) => toRow(s, pairMetaFor(s, [svgVersion(svgPathFor(s, 1))]), false));
    const out = await loadRegenCodes(root, rows, [b.id, a.id, c.id]);
    expect([...out.codes.keys()]).toEqual([b.id, a.id]);
    expect(out.missing).toEqual([c.id]);
    expect(out.codes.get(a.id)?.code).toBe(CODE_V1);
  });

  it("is empty and honest when the folder holds nothing", async () => {
    const a = svgSource("pair_1");
    const out = await loadRegenCodes(folderWith({}), [toRow(a, null, false)], [a.id]);
    expect(out.codes.size).toBe(0);
    expect(out.missing).toEqual([a.id]);
  });
});
