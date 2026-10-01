import { describe, expect, it } from "vitest";
import { stableSvgSourceId } from "../src/svg/prompt";
import {
  appendVersion, loadSidecar, parseSvgSidecar, recoverInterrupted, saveSidecar, sidecarName, upsertRequest,
} from "../src/svg/sidecar";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { requestRecord, sidecarFixture, SVG_SOURCE_PATH, SVG_TIME, versionRecord } from "./helpers/svgfixtures";

function rootWithSourceFolder(): FakeDir {
  const root = new FakeDir("root");
  root.children.set("folder", new FakeDir("folder"));
  return root;
}

describe("SVG sidecar validation and persistence", () => {
  it("round-trips valid requests, versions, actual usage and source identity", () => {
    const valid = sidecarFixture();
    const parsed = parseSvgSidecar(JSON.stringify(valid), valid.sourceId, valid.sourcePath);
    expect(parsed).toEqual(valid);
    expect(sidecarName(SVG_SOURCE_PATH)).toBe("leaf_AI.png.svg.json");
    expect(parseSvgSidecar(JSON.stringify(valid), "wrong-id", valid.sourcePath)).toBeNull();
  });

  it("round-trips recovered SVG metadata when the original request history is unavailable", () => {
    const base = sidecarFixture();
    base.requests = [];
    base.versions[0] = { ...versionRecord(), requestId: "recovered", batchId: "recovered",
      prompt: "", model: "", manifest: [] };
    const parsed = parseSvgSidecar(JSON.stringify(base), base.sourceId, base.sourcePath);
    expect(parsed).not.toBeNull();
    expect(parsed?.versions[0]).toMatchObject({ requestId: "recovered", manifest: [] });
  });

  it("rejects unsafe paths, inconsistent request/version mappings, invalid hashes and credentials", () => {
    const base = sidecarFixture();
    const unsafePath = structuredClone(base);
    unsafePath.versions[0].path = "../escape.svg";
    expect(parseSvgSidecar(JSON.stringify(unsafePath), base.sourceId, base.sourcePath)).toBeNull();

    const wrongMapping = structuredClone(base);
    wrongMapping.versions[0].positionId = 2;
    expect(parseSvgSidecar(JSON.stringify(wrongMapping), base.sourceId, base.sourcePath)).toBeNull();

    const badHash = structuredClone(base);
    badHash.sourceFingerprint = "short";
    expect(parseSvgSidecar(JSON.stringify(badHash), base.sourceId, base.sourcePath)).toBeNull();

    const keyText = structuredClone(base);
    keyText.requests[0].prompt = "rq_live_abcdefghijklmnopqrstuvwxyz";
    expect(parseSvgSidecar(JSON.stringify(keyText), base.sourceId, base.sourcePath)).toBeNull();
    expect(parseSvgSidecar("{broken", base.sourceId, base.sourcePath)).toBeNull();
  });

  it("marks a non-running checkpoint unknown after restart but preserves a live request", () => {
    const base = sidecarFixture();
    const pending = upsertRequest(base, requestRecord("in-progress"), SVG_TIME);
    const recovered = recoverInterrupted(pending, "2026-10-01T13:00:00.000Z");
    expect(recovered.requests.at(-1)).toMatchObject({ status: "unknown", finishedAt: "2026-10-01T13:00:00.000Z" });
    expect(recovered.requests.at(-1)?.safeError).toContain("Check Requesty before retrying");
    expect(recoverInterrupted(pending, SVG_TIME, () => true)).toBe(pending);
  });

  it("upserts requests and appends immutable version records", () => {
    const base = sidecarFixture();
    const retried = upsertRequest(base, { ...requestRecord("failed"), safeError: "429" }, "2026-10-01T13:00:00.000Z");
    expect(retried.requests).toHaveLength(1);
    expect(retried.requests[0].status).toBe("failed");
    const next = appendVersion(retried, versionRecord(2), "2026-10-01T13:01:00.000Z");
    expect(next.versions.map((version) => version.version)).toEqual([1, 2]);
    expect(base.versions).toHaveLength(1);
  });

  it("creates, verifies and cleans its temporary sidecar before exposing a valid read", async () => {
    const root = rootWithSourceFolder();
    const value = sidecarFixture();
    await saveSidecar(root, value);
    const loaded = await loadSidecar(root, value.sourceId, value.sourcePath);
    expect(loaded).toEqual({ state: "ok", value });
    const folder = root.children.get("folder") as FakeDir;
    expect([...folder.children.keys()]).toEqual([sidecarName(SVG_SOURCE_PATH)]);

    const changed = { ...value, updatedAt: "2026-10-01T13:00:00.000Z", lastSafeError: "rq_live_abcdefghijklmnopqrstuvwxyz" };
    await saveSidecar(root, changed);
    const savedFolder = root.children.get("folder") as FakeDir;
    const savedText = await (await savedFolder.getFileHandle(sidecarName(SVG_SOURCE_PATH))).getFile().then((file) => file.text());
    expect(savedText).not.toContain("rq_live_abcdefghijklmnopqrstuvwxyz");
    const reread = await loadSidecar(root, value.sourceId, value.sourcePath);
    expect(reread.state).toBe("ok");
    if (reread.state === "ok") expect(reread.value.lastSafeError).toBe("[redacted]");
  });

  it("refuses to persist a credential-like prompt instead of silently leaking or rewriting it", async () => {
    const root = rootWithSourceFolder();
    const value = sidecarFixture();
    value.requests[0].prompt = "rq_live_abcdefghijklmnopqrstuvwxyz";
    await expect(saveSidecar(root, value)).rejects.toThrow("Credential-like text was blocked");
    expect((root.children.get("folder") as FakeDir).children.size).toBe(0);
  });

  it("distinguishes missing metadata from corrupt data without deleting either", async () => {
    const root = rootWithSourceFolder();
    const sourceId = stableSvgSourceId(SVG_SOURCE_PATH);
    expect(await loadSidecar(root, sourceId, SVG_SOURCE_PATH)).toEqual({ state: "missing", value: null });
    const folder = root.children.get("folder") as FakeDir;
    const name = sidecarName(SVG_SOURCE_PATH);
    folder.children.set(name, new FakeFile(name, 12, 1000, "not-json"));
    expect(await loadSidecar(root, sourceId, SVG_SOURCE_PATH)).toEqual({ state: "corrupt", value: null });
    expect(folder.children.has(name)).toBe(true);
  });
});
