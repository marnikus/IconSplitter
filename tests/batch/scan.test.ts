// RULE 8 — scan runs for real over in-memory handles: recursion, ignore
// rules, identity, references, history. Deleting any of it fails here.
import { describe, expect, it } from "vitest";
import { buildStatus, groupKeyOf } from "../../src/batch/status";
import { aiImages, findReference, groupByDir, readHistory, scanRoot } from "../../src/batch/scan";
import { FakeDir, FakeFileHandle, domError, seedDir, seedFile } from "./fakes";

const OPTS = { includeExtensions: ["png", "jpg"], outputDirName: "_split_output", useContentHash: false, ignoreOutputDir: true };

function tree(): FakeDir {
  const root = new FakeDir("root");
  const cat = seedDir(root, "Category-A");
  seedFile(cat, "icon.png", "ref-bytes");
  seedFile(cat, "icon_AI.png", "ai-bytes", "image/png", 11);
  seedFile(cat, "icon_AI_7.png", "ai7-bytes", "image/png", 12);
  seedFile(cat, "notes.txt", "nope", "text/plain");
  seedFile(
    cat,
    "icon.json",
    JSON.stringify(buildStatus({ base: "icon", reference: "icon.png", referenceFound: true }, [], "2026-10-01T00:00:00.000Z")),
    "application/json",
  );
  const out = seedDir(root, "_split_output");
  seedFile(out, "x_AI.png", "old-output");
  const other = seedDir(root, "Other");
  seedFile(other, "y_AI.jpg", "jpg-bytes", "image/jpeg", 13);
  seedFile(other, "junk.json", "{oops", "application/json");
  return root;
}

describe("scanRoot — recursive walk", () => {
  it("collects images, skips output dirs and non-images, finds status files", async () => {
    const r = await scanRoot(tree(), OPTS);
    expect(r.files.map((f) => f.relPath).sort()).toEqual([
      "Category-A/icon.png",
      "Category-A/icon_AI.png",
      "Category-A/icon_AI_7.png",
      "Other/y_AI.jpg",
    ]);
    expect(r.files.find((f) => f.name === "icon_AI.png")).toMatchObject({ dir: "Category-A", size: 8, mtime: 11 });
    expect([...r.dirs.keys()].sort()).toEqual(["", "Category-A", "Other"]);
    expect(r.status.map((s) => `${s.dir}/${s.name}`).sort()).toEqual(["Category-A/icon.json", "Other/junk.json"]);
    expect(r.skipped).toBe(0);
  });

  it("hashes content only when enabled", async () => {
    const plain = await scanRoot(tree(), OPTS);
    expect(plain.files.every((f) => f.hash === undefined)).toBe(true);
    const hashed = await scanRoot(tree(), { ...OPTS, useContentHash: true });
    expect(hashed.files.every((f) => typeof f.hash === "string")).toBe(true);
    expect(hashed.files[0].hash).toHaveLength(8);
  });

  it("skips unreadable files instead of killing the scan (RULE 5)", async () => {
    const root = tree();
    const cat = root.dirs.get("Category-A")!;
    const bad = new FakeFileHandle("bad_AI.png", cat);
    bad.getFile = async () => {
      throw domError("SecurityError");
    };
    cat.files.set("bad_AI.png", bad);
    const gone = new FakeFileHandle("gone_AI.png", cat);
    gone.getFile = async () => {
      throw domError("NotFoundError");
    };
    cat.files.set("gone_AI.png", gone);
    const r = await scanRoot(root, OPTS);
    expect(r.skipped).toBe(1);
    expect(r.files.some((f) => f.name === "bad_AI.png")).toBe(false);
  });

  it("an empty root scans clean with no files (empty, not broken)", async () => {
    const r = await scanRoot(new FakeDir("empty"), OPTS);
    expect(r.files).toEqual([]);
    expect(r.skipped).toBe(0);
  });

  it("also ignores a custom output dir name", async () => {
    const root = new FakeDir("root");
    seedFile(seedDir(root, "custom_out"), "z_AI.png", "x");
    const r = await scanRoot(root, { ...OPTS, outputDirName: "custom_out" });
    expect(r.files).toEqual([]);
  });
});

describe("aiImages / groupByDir / findReference", () => {
  it("partitions AI images and links same-folder references", async () => {
    const r = await scanRoot(tree(), OPTS);
    const ai = aiImages(r.files);
    expect(ai.map((f) => f.name).sort()).toEqual(["icon_AI.png", "icon_AI_7.png", "y_AI.jpg"]);
    const byDir = groupByDir(r.files);
    const ref = findReference(ai.find((f) => f.name === "icon_AI.png")!, byDir.get("Category-A")!);
    expect(ref?.name).toBe("icon.png");
    expect(findReference(ai.find((f) => f.name === "y_AI.jpg")!, byDir.get("Other")!)).toBeNull();
  });

  it("prefers the same-extension reference", async () => {
    const root = new FakeDir("root");
    seedFile(root, "i.png", "r1");
    seedFile(root, "i.jpg", "r2", "image/jpeg");
    seedFile(root, "i_AI.png", "ai");
    const r = await scanRoot(root, OPTS);
    const ai = aiImages(r.files)[0];
    expect(findReference(ai, groupByDir(r.files).get("")!)?.name).toBe("i.png");
  });
});

describe("readHistory", () => {
  it("parses valid status files and skips corrupt ones", async () => {
    const r = await scanRoot(tree(), OPTS);
    const hist = await readHistory(r.status);
    expect([...hist.keys()]).toEqual([groupKeyOf({ dir: "Category-A", base: "icon" })]);
  });
});
