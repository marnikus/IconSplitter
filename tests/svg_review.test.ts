import { describe, expect, it } from "vitest";
import { stableSvgSourceId } from "../src/svg/prompt";
import { writeSvgReviewChanges, type SvgReviewChange } from "../src/svg/review";
import { loadSidecar, saveSidecar, sidecarName } from "../src/svg/sidecar";
import { isSvgSourceRunning, releaseSources, reserveSources } from "../src/svg/run/registry";
import { FakeDir, FakeFile, BrokenFile } from "./helpers/fakefs";
import { sidecarFixture, SVG_SOURCE_PATH } from "./helpers/svgfixtures";
import type { SvgSidecar } from "../src/svg/types";

function secondSidecar(): SvgSidecar {
  const value = structuredClone(sidecarFixture());
  const path = "second/rose_AI.jpg";
  const filename = "rose_AI.jpg";
  const sourceId = stableSvgSourceId(path);
  const manifest = [{ ...value.requests[0].manifest[0], sourceId, filename, relativePath: path }];
  value.sourceId = sourceId; value.sourcePath = path;
  value.requests = value.requests.map((request) => ({ ...request, manifest }));
  value.versions = value.versions.map((version) => ({ ...version, path: "second/rose_AI.svg", manifest }));
  return value;
}

function reviewChange(value: SvgSidecar): SvgReviewChange {
  return { sourceId: value.sourceId, sourcePath: value.sourcePath, version: 1,
    before: "pending", beforeAt: null, after: "approved", afterAt: "2026-10-01T13:00:00.000Z" };
}

async function store(root: FakeDir, value: SvgSidecar, broken = false): Promise<void> {
  const parent = new FakeDir(value.sourcePath.split("/")[0]);
  root.children.set(parent.name, parent);
  const name = sidecarName(value.sourcePath);
  const file = broken ? new BrokenFile(name, 200, 1, JSON.stringify(value)) : new FakeFile(name, 200, 1, JSON.stringify(value));
  parent.children.set(name, file);
}

async function reviewValue(root: FakeDir, value: SvgSidecar): Promise<string | undefined> {
  const loaded = await loadSidecar(root, value.sourceId, value.sourcePath);
  return loaded.state === "ok" ? loaded.value.versions[0].review : undefined;
}

describe("per-version SVG review persistence", () => {
  it("applies one version decision and reverses only that record", async () => {
    const root = new FakeDir("root");
    const value = sidecarFixture();
    await store(root, value);
    const extra = { ...value, versions: [...value.versions, { ...value.versions[0], version: 2, path: "folder/leaf_AI-v2.svg" }] };
    // Keep both records valid and target only the newest version.
    await saveSidecar(root, extra);
    const change = { ...reviewChange(value), version: 2 };
    expect(await writeSvgReviewChanges(root, [change], "after")).toBe(true);
    const saved = await loadSidecar(root, value.sourceId, SVG_SOURCE_PATH);
    expect(saved.state).toBe("ok");
    if (saved.state === "ok") expect(saved.value.versions.map((version) => version.review)).toEqual(["pending", "approved"]);
    expect(await writeSvgReviewChanges(root, [change], "before")).toBe(true);
    const undone = await loadSidecar(root, value.sourceId, SVG_SOURCE_PATH);
    if (undone.state === "ok") expect(undone.value.versions.map((version) => version.review)).toEqual(["pending", "pending"]);
  });

  it("rolls back earlier sidecars if any file in a bulk review fails", async () => {
    const root = new FakeDir("root");
    const first = sidecarFixture();
    const second = secondSidecar();
    await store(root, first);
    await store(root, second, true);
    expect(await writeSvgReviewChanges(root, [reviewChange(first), reviewChange(second)], "after")).toBe(false);
    expect(await reviewValue(root, first)).toBe("pending");
    expect(await reviewValue(root, second)).toBe("pending"); // the intentionally broken handle remains untouched
  });

  it("refuses review updates while a source request is active", async () => {
    const root = new FakeDir("root");
    const value = sidecarFixture();
    await store(root, value);
    reserveSources([value.sourceId]);
    expect(isSvgSourceRunning(value.sourceId)).toBe(true);
    expect(await writeSvgReviewChanges(root, [reviewChange(value)], "after")).toBe(false);
    releaseSources([value.sourceId]);
    expect(await reviewValue(root, value)).toBe("pending");
  });
});
