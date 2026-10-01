import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "../src/lib/svgvalidate";
import { atomicSaveSvg, findSvgFiles, nextSvgVersion, parseSvgFileName, svgFileName } from "../src/svg/files";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { SVG_MARKUP, SVG_SOURCE_PATH } from "./helpers/svgfixtures";

function rootWithFolder(): FakeDir {
  const root = new FakeDir("root");
  root.children.set("folder", new FakeDir("folder"));
  return root;
}

function canonicalSvg(): string {
  const checked = sanitizeSvg(SVG_MARKUP, "leaf_AI.png");
  if (!checked.ok) throw new Error(checked.error);
  return checked.svg;
}

describe("versioned SVG filesystem delivery", () => {
  it("parses version suffixes including two-digit versions and escaped source names", () => {
    expect(svgFileName("leaf_AI.png", 1)).toBe("leaf_AI.svg");
    expect(svgFileName("leaf_AI.png", 10)).toBe("leaf_AI-v10.svg");
    expect(parseSvgFileName("leaf_AI.svg", "leaf_AI.png")).toBe(1);
    expect(parseSvgFileName("leaf_AI-v2.svg", "leaf_AI.png")).toBe(2);
    expect(parseSvgFileName("leaf_AI-v10.svg", "leaf_AI.png")).toBe(10);
    expect(parseSvgFileName("a.b_AI-v10.svg", "a.b_AI.png")).toBe(10);
    expect(parseSvgFileName("leaf_AI-v1.svg", "leaf_AI.png")).toBeNull();
    expect(parseSvgFileName("other-v2.svg", "leaf_AI.png")).toBeNull();
  });

  it("recursively identifies versioned outputs and recoverable temp names", async () => {
    const root = rootWithFolder();
    const folder = root.children.get("folder") as FakeDir;
    folder.children.set("leaf_AI.svg", new FakeFile("leaf_AI.svg"));
    folder.children.set("leaf_AI-v10.svg", new FakeFile("leaf_AI-v10.svg"));
    folder.children.set(".leaf_AI-v12.svg.tmp-request-1", new FakeFile(".leaf_AI-v12.svg.tmp-request-1"));
    folder.children.set("unrelated.svg", new FakeFile("unrelated.svg"));
    expect(await findSvgFiles(root, SVG_SOURCE_PATH)).toEqual([
      { name: "leaf_AI.svg", path: "folder/leaf_AI.svg", version: 1, temporary: false },
      { name: "leaf_AI-v10.svg", path: "folder/leaf_AI-v10.svg", version: 10, temporary: false },
      { name: ".leaf_AI-v12.svg.tmp-request-1", path: "folder/.leaf_AI-v12.svg.tmp-request-1", version: 12, temporary: true },
    ]);
    expect(await nextSvgVersion(root, SVG_SOURCE_PATH, [4])).toBe(13);
  });

  it("writes a validated canonical SVG via a staged no-overwrite rename", async () => {
    const root = rootWithFolder();
    const content = canonicalSvg();
    const saved = await atomicSaveSvg({ root, sourcePath: SVG_SOURCE_PATH, version: 1, svg: content, requestId: "request-1" });
    expect(saved).toEqual({ saved: true, path: "folder/leaf_AI.svg", version: 1, recoverableTempPath: null });
    const folder = root.children.get("folder") as FakeDir;
    expect([...folder.children.keys()]).toEqual(["leaf_AI.svg"]);
    await expect((await (await folder.getFileHandle("leaf_AI.svg")).getFile()).text()).resolves.toBe(content);
    await expect(atomicSaveSvg({ root, sourcePath: SVG_SOURCE_PATH, version: 1, svg: content, requestId: "request-2" }))
      .rejects.toThrow("refusing to overwrite");
    expect(await nextSvgVersion(root, SVG_SOURCE_PATH, [])).toBe(2);
  });

  it("refuses unsafe or wrong-title content before creating an SVG output", async () => {
    const root = rootWithFolder();
    await expect(atomicSaveSvg({ root, sourcePath: SVG_SOURCE_PATH, version: 1, svg: "<svg onload='x'></svg>", requestId: "request-1" }))
      .rejects.toThrow("verification failed");
    expect((root.children.get("folder") as FakeDir).children.size).toBe(0);
  });
});
