import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_CONNECTION } from "../src/lib/svgconnections";
import { prepareImageEditRun } from "../src/svg/imgprepare";
import type { SvgRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const rows = (ids: string[]): SvgRow[] => ids.map((id) => ({
  source: { id, name: `${id}.png`, relPath: `${id}.png`, dirPath: "", stem: id, metaPath: `${id}.svg.json` },
  meta: null, corrupt: false,
}) as unknown as SvgRow);

const folder = () => {
  const root = new FakeDir("icons");
  for (const id of ["a", "b", "c", "d"]) root.children.set(`${id}.png`, new FakeFile(`${id}.png`, 4, 1, id));
  return root;
};

function canvasShim() {
  const drawn: string[] = [];
  vi.stubGlobal("createImageBitmap", async (file: File) => ({
    width: 100, height: 100, content: await file.text(), close: () => undefined,
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
    fillStyle: "", fillRect: () => undefined,
    drawImage: (source: { content: string }) => drawn.push(source.content),
  }) as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob([`SHEET:${drawn.join(",")}`], { type: "image/png" })));
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("prepared image-edit reference", () => {
  it("preserves selection order and sends the exact composite bytes shown in preview", async () => {
    canvasShim();
    const ids = ["c", "a", "d", "b"];
    const run = await prepareImageEditRun({ root: folder(), rows: rows(["a", "b", "c", "d"]), ids,
      count: 4, conn: DEFAULT_IMAGE_CONNECTION, prompt: "Thin the lines" });
    expect(run.groups).toHaveLength(1);
    const [group] = run.groups;
    expect(group.plan.cells.map((cell) => cell.id)).toEqual(ids);
    expect(await group.reference.text()).toBe("SHEET:c,a,d,b");
    expect(group.prompt).toMatch(/Thin the lines/);
    expect(group.prompt).toMatch(/same cell positions/i);
    expect(group.sources.every((source) => source.fingerprint.length > 0)).toBe(true);
  });

  it("disambiguates equal filenames by relative folder in the review manifest", async () => {
    canvasShim();
    const root = new FakeDir("icons");
    const north = new FakeDir("north");
    const south = new FakeDir("south");
    north.children.set("same_AI.png", new FakeFile("same_AI.png", 4, 1, "n"));
    south.children.set("same_AI.png", new FakeFile("same_AI.png", 4, 1, "s"));
    root.children.set("north", north);
    root.children.set("south", south);
    const listed = ["north", "south"].map((dir) => ({
      source: { id: dir, name: "same_AI.png", relPath: `${dir}/same_AI.png`, dirPath: dir, stem: "same_AI", metaPath: `${dir}/same_AI.svg.json` },
      meta: null, corrupt: false,
    })) as unknown as SvgRow[];
    const run = await prepareImageEditRun({ root, rows: listed, ids: ["north", "south"], count: 2,
      conn: DEFAULT_IMAGE_CONNECTION, prompt: "thin" });
    expect(run.groups[0].plan.cells.map((cell) => cell.name)).toEqual(["north/same_AI.png", "south/same_AI.png"]);
  });

  it("reports one unpreparable group but keeps the other previewed groups sendable", async () => {
    canvasShim();
    const root = folder();
    root.children.delete("a.png");
    root.children.set("e.png", new FakeFile("e.png", 4, 1, "e"));
    const run = await prepareImageEditRun({ root, rows: rows(["a", "b", "c", "d", "e"]),
      ids: ["a", "b", "c", "d", "e"], count: 2, conn: DEFAULT_IMAGE_CONNECTION, prompt: "thin" });
    expect(run.skipped).toEqual([{ ids: ["a", "b"], reason: expect.stringMatching(/a\.png/i) }]);
    expect(run.groups.map((group) => group.plan.cells.map((cell) => cell.id))).toEqual([["c", "d"], ["e"]]);
  });

  it("releases a bitmap when a source decode reports empty dimensions", async () => {
    canvasShim();
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", async () => ({ width: 0, height: 0, close }));
    await expect(prepareImageEditRun({ root: folder(), rows: rows(["a", "b"]), ids: ["a", "b"],
      count: 2, conn: DEFAULT_IMAGE_CONNECTION, prompt: "thin" })).rejects.toThrow(/decode/i);
    expect(close).toHaveBeenCalled();
  });

  it("refuses an unreadable reference or non-square connection before any send", async () => {
    canvasShim();
    const args = { root: folder(), rows: rows(["a", "b"]), ids: ["a", "b"], count: 2,
      conn: DEFAULT_IMAGE_CONNECTION, prompt: "thin" };
    args.root.children.delete("a.png");
    await expect(prepareImageEditRun(args)).rejects.toThrow(/a\.png|could not be read/i);
    const landscape = { ...DEFAULT_IMAGE_CONNECTION, image: { ...DEFAULT_IMAGE_CONNECTION.image, sizePreset: "1536x1024" as const } };
    await expect(prepareImageEditRun({ ...args, root: folder(), conn: landscape })).rejects.toThrow(/square/i);
  });
});
