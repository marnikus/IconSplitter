// TDD cycle 10 — state sync: <base>.json written beside the reference,
// refreshed on every scan, corrupt payloads replaced safely (RULE 13).
import { describe, expect, it } from "vitest";
import { syncStateFiles } from "../src/batch/statewrite";
import { parseState } from "../src/lib/statefile";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import type { AiImageEntry } from "../src/lib/scan";

const img = (dirPath: string, name: string, base: string, ref: string | null = `${dirPath}/${base}.png`): AiImageEntry => ({
  name,
  relPath: dirPath === "" ? name : `${dirPath}/${name}`,
  dirPath,
  size: 10,
  mtime: 1,
  ai: { base, suffix: "", ext: ".png" },
  refRelPath: ref,
});

async function readJson(root: FakeDir, dirPath: string, json: string) {
  const dir = dirPath === "" ? root : await root.getDirectoryHandle(dirPath);
  const fh = await dir.getFileHandle(json);
  return parseState(await (await fh.getFile()).text());
}

describe("syncStateFiles", () => {
  it("writes one <base>.json per reference into its source folder", async () => {
    const root = new FakeDir("root");
    await root.getDirectoryHandle("Category-A", { create: true });
    const images = [
      img("Category-A", "icon_AI.png", "icon"),
      img("Category-A", "icon_AI_7.png", "icon"),
      img("", "star_AI.png", "star"),
    ];
    await syncStateFiles(root, images, [], "t1");
    const a = await readJson(root, "Category-A", "icon.json");
    expect(a!.sources.map((s) => s.relPath).sort()).toEqual([
      "Category-A/icon_AI.png", "Category-A/icon_AI_7.png",
    ]);
    expect(a!.sources.every((s) => s.status === "unprocessed")).toBe(true);
    const s = await readJson(root, "", "star.json");
    expect(s!.sources).toHaveLength(1);
  });

  it("a vanished source is kept as 'missing' on the next sync (history)", async () => {
    const root = new FakeDir("root");
    await syncStateFiles(root, [img("", "a_AI.png", "a"), img("", "b_AI.png", "b")], [], "t1");
    await syncStateFiles(root, [img("", "a_AI.png", "a")], [{ dirPath: "", base: "b" }], "t2");
    const b = await readJson(root, "", "b.json");
    expect(b!.sources[0].status).toBe("missing");
  });

  it("corrupt existing JSON is replaced, not fatal (RULE 13)", async () => {
    const root = new FakeDir("root");
    const dir = root;
    dir.children.set("a.json", new FakeFile("a.json", 5, 1, "{broken"));
    await syncStateFiles(root, [img("", "a_AI.png", "a")], [], "t1");
    const a = await readJson(root, "", "a.json");
    expect(a!.sources).toHaveLength(1);
  });
});
