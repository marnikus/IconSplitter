// sidecarstore.test.ts — per-file sidecar IO on the FS handles: missing =
// pending, corrupt = warn, save = atomic with read-back verify (RULE 23).
import { describe, expect, it } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { loadSidecar, saveSidecar, sidecarNameFor } from "../src/svggen/sidecarstore";
import { addVersion, emptySidecar, type SvgVersionRec } from "../src/lib/svgsidecar";

const rec: SvgVersionRec = {
  version: 1, file: "x_AI.v1.svg", createdAt: "2026-10-01T10:00:00.000Z", prompt: "p",
  provider: "requesty", model: "openai/gpt-6.1-sol", batchId: "b1", requestId: "r1",
  position: 1, compositeHash: "h", tokensIn: 1, tokensOut: 2, tokensTotal: 3,
  cost: 0.01, costKind: "actual", validationOk: true, validationWarnings: [],
  review: "pending", status: "generated", safeError: null,
};

describe("sidecarNameFor", () => {
  it("derives the sidecar name from the AI image", () => {
    expect(sidecarNameFor("fog_AI.png")).toBe("fog_AI.svg.json");
  });
});

describe("loadSidecar", () => {
  it("missing sidecar means not generated, not an error", async () => {
    const out = await loadSidecar({ dir: new FakeDir("d"), aiName: "fog_AI.png", sourceId: "id", sourcePath: "p", fingerprint: "fp" });
    expect(out.missing).toBe(true);
    expect(out.corrupt).toBe(false);
    expect(out.sidecar.versions).toEqual([]);
  });

  it("corrupt sidecar warns without deleting the svgs", async () => {
    const dir = new FakeDir("d");
    dir.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 5, 1, "{oops"));
    dir.children.set("fog_AI.v1.svg", new FakeFile("fog_AI.v1.svg", 5, 1, "<svg/>"));
    const out = await loadSidecar({ dir, aiName: "fog_AI.png", sourceId: "id", sourcePath: "p", fingerprint: "fp" });
    expect(out.corrupt).toBe(true);
    expect(dir.children.has("fog_AI.v1.svg")).toBe(true); // untouched
  });
});

describe("saveSidecar", () => {
  it("round-trips and leaves no tmp file behind", async () => {
    const dir = new FakeDir("d");
    await saveSidecar(dir, "fog_AI.png", addVersion(emptySidecar("id", "p", "fp"), rec));
    expect([...dir.children.keys()].filter((k) => k.includes("tmp"))).toEqual([]);
    const back = await loadSidecar({ dir, aiName: "fog_AI.png", sourceId: "id", sourcePath: "p", fingerprint: "fp" });
    expect(back.sidecar.versions[0].version).toBe(1);
    expect(back.sidecar.versions[0].costKind).toBe("actual");
  });

  it("a write failure throws so the caller can offer retry, keeping in-memory state", async () => {
    const dir = new FakeDir("d");
    dir.getFileHandle = async () => { throw new Error("disk full"); };
    await expect(saveSidecar(dir, "fog_AI.png", emptySidecar("id", "p", "fp"))).rejects.toThrow();
  });
});
