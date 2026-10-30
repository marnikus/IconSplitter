// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newPairMeta } from "../src/lib/pairmeta";
import { fingerprintOf, type PreparedImageSource } from "../src/svg/imgprepare";
import { sourceChangeReason } from "../src/svg/imgstale";
import type { SvgRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";

async function fixture() {
  const root = new FakeDir("icons");
  root.children.set("a.png", new FakeFile("a.png", 1, 1, "a"));
  const row = { source: { id: "a", name: "a.png", relPath: "a.png", dirPath: "", stem: "a", metaPath: "a.svg.json" }, meta: null } as SvgRow;
  const blob = new Blob(["a"], { type: "image/png" });
  const source: PreparedImageSource = { row, blob, path: "a.png", preferred: null, fingerprint: await fingerprintOf(blob) };
  return { root, source };
}

describe("prepared image edit applied only to its original main source", () => {
  it("allows an unchanged pair and refuses changed bytes", async () => {
    const { root, source } = await fixture();
    expect(await sourceChangeReason(root, source, null)).toBeNull();
    root.children.set("a.png", new FakeFile("a.png", 2, 2, "changed"));
    expect(await sourceChangeReason(root, source, null)).toMatch(/changed/i);
  });

  it("refuses a new preferred version even when the original bytes are unchanged", async () => {
    const { root, source } = await fixture();
    const meta = newPairMeta({ id: "a", base: "a", suffix: "", dirPath: "", ai: { relPath: "a.png", name: "a.png", fingerprint: "1:1" }, source: null });
    meta.imageVersions = [{ version: 1, file: "v1.png", status: "done", prompt: "p", model: "m", requestId: null, error: null, updatedAt: "today",
      usage: { input: null, output: null, total: null }, cost: { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" } }];
    meta.imagePreferred = 1;
    expect(await sourceChangeReason(root, source, meta)).toMatch(/changed/i);
  });
});
