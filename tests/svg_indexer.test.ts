import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizeSvg } from "../src/lib/svgvalidate";
import { sha256Hex } from "../src/lib/svgcomposite";
import { stableSvgSourceId } from "../src/svg/prompt";
import { indexApprovedSource } from "../src/svg/indexer";
import { emptySidecar, loadSidecar, saveSidecar, sidecarName } from "../src/svg/sidecar";
import { viewPair } from "./helpers/reviewpairs";
import { BrokenFile, FakeDir, FakeFile } from "./helpers/fakefs";
import { sidecarFixture, SVG_MARKUP, SVG_SOURCE_PATH } from "./helpers/svgfixtures";

function setupRenderer(alpha: number): void {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 10;
    naturalHeight = 10;
    set src(_value: string) { /* decode resolves below */ }
    decode = () => Promise.resolve();
  }
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, alpha]) }),
  } as unknown as CanvasRenderingContext2D);
}

async function rootWithFiles(sidecar = true): Promise<{ root: FakeDir; fingerprint: string }> {
  const root = new FakeDir("root");
  const folder = new FakeDir("folder");
  root.children.set("folder", folder);
  const image = new FakeFile("leaf_AI.png", 20, 100, "approved ai image");
  folder.children.set(image.name, image);
  const fingerprint = await sha256Hex(await image.getFile());
  const valid = sanitizeSvg(SVG_MARKUP, "leaf_AI.png");
  if (!valid.ok) throw new Error(valid.error);
  folder.children.set("leaf_AI.svg", new FakeFile("leaf_AI.svg", 80, 200, valid.svg));
  if (sidecar) {
    const metadata = sidecarFixture();
    const svgHash = await sha256Hex(new Blob([valid.svg]));
    metadata.sourceFingerprint = fingerprint;
    metadata.requests[0].manifest[0].fingerprint = fingerprint;
    metadata.versions[0].sourceFingerprint = fingerprint;
    metadata.versions[0].manifest[0].fingerprint = fingerprint;
    metadata.versions[0].contentHash = svgHash;
    folder.children.set(sidecarName(SVG_SOURCE_PATH), new FakeFile(sidecarName(SVG_SOURCE_PATH), 100, 200, JSON.stringify(metadata)));
  }
  return { root, fingerprint };
}

describe("approved-source SVG indexing and recovery", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("loads and revalidates SVG versions only for approved AI sources", async () => {
    setupRenderer(255);
    const { root, fingerprint } = await rootWithFiles();
    const pair = viewPair("leaf", { dir: "folder", decision: "approved" });
    const row = await indexApprovedSource({ root, pair, fingerprint, now: "2026-10-01T14:00:00.000Z" });
    expect(row).toMatchObject({ sourceId: stableSvgSourceId(SVG_SOURCE_PATH), generation: "generated",
      sidecarState: "ok", review: "pending", newestVersion: 1, newestSvg: expect.stringContaining("<svg") });
    expect(row?.versions[0]).toMatchObject({ available: true, validation: { valid: true, visible: true } });

    const pending = await indexApprovedSource({ root, pair: { ...pair, decision: "pending" }, fingerprint, now: "2026-10-01T14:00:00.000Z" });
    expect(pending).toBeNull();
  });

  it("rebuilds missing sidecar version metadata from a valid SVG and keeps the recovered review durable", async () => {
    setupRenderer(255);
    const { root, fingerprint } = await rootWithFiles(false);
    const pair = viewPair("leaf", { dir: "folder", decision: "approved" });
    const row = await indexApprovedSource({ root, pair, fingerprint, now: "2026-10-01T14:00:00.000Z" });
    expect(row).toMatchObject({ sidecarState: "ok", generation: "recovered", newestVersion: 1 });
    expect(row?.versions[0]).toMatchObject({ recovered: true, requestId: "recovered", review: "pending" });
    const folder = root.children.get("folder") as FakeDir;
    const metadata = await (await folder.getFileHandle(sidecarName(SVG_SOURCE_PATH))).getFile();
    const saved = JSON.parse(await metadata.text()) as { versions: unknown[]; requests: unknown[] };
    expect(saved.versions).toHaveLength(1);
    expect(saved.requests).toHaveLength(0);
    expect((await loadSidecar(root, stableSvgSourceId(SVG_SOURCE_PATH), SVG_SOURCE_PATH)).state).toBe("ok");
  });

  it("persists valid orphan versions discovered beside an otherwise valid sidecar", async () => {
    setupRenderer(255);
    const { root, fingerprint } = await rootWithFiles();
    const folder = root.children.get("folder") as FakeDir;
    const valid = sanitizeSvg(SVG_MARKUP, "leaf_AI.png");
    if (!valid.ok) throw new Error(valid.error);
    folder.children.set("leaf_AI-v2.svg", new FakeFile("leaf_AI-v2.svg", 80, 201, valid.svg));
    const pair = viewPair("leaf", { dir: "folder", decision: "approved" });
    const row = await indexApprovedSource({ root, pair, fingerprint, now: "2026-10-01T14:00:00.000Z" });
    expect(row?.versions.map((version) => version.version)).toEqual([1, 2]);
    const saved = await loadSidecar(root, stableSvgSourceId(SVG_SOURCE_PATH), SVG_SOURCE_PATH);
    expect(saved.state).toBe("ok");
    if (saved.state === "ok") expect(saved.value.versions.map((version) => version.version)).toEqual([1, 2]);
  });

  it("marks the row write-failed and blocks edits when recovered metadata cannot be persisted", async () => {
    setupRenderer(255);
    const { root, fingerprint } = await rootWithFiles(false);
    const folder = root.children.get("folder") as FakeDir;
    const metadata = emptySidecar(stableSvgSourceId(SVG_SOURCE_PATH), SVG_SOURCE_PATH, fingerprint, "2026-10-01T14:00:00.000Z");
    await saveSidecar(root, metadata);
    const name = sidecarName(SVG_SOURCE_PATH);
    folder.children.set(name, new BrokenFile(name, 200, 1, JSON.stringify(metadata)));
    const pair = viewPair("leaf", { dir: "folder", decision: "approved" });
    const row = await indexApprovedSource({ root, pair, fingerprint, now: "2026-10-01T14:00:00.000Z" });
    expect(row).toMatchObject({ sidecarState: "write-failed", generation: "recovered", newestVersion: 1 });
    expect(row?.safeError).toContain("Retry the rescan");
  });

  it("does not claim invisible or malformed output as a version", async () => {
    setupRenderer(0);
    const { root, fingerprint } = await rootWithFiles(false);
    const folder = root.children.get("folder") as FakeDir;
    folder.children.set("leaf_AI.svg", new FakeFile("leaf_AI.svg", 10, 200, "<svg>broken"));
    const pair = viewPair("leaf", { dir: "folder", decision: "approved" });
    const row = await indexApprovedSource({ root, pair, fingerprint, now: "2026-10-01T14:00:00.000Z" });
    expect(row).toMatchObject({ sidecarState: "missing", generation: "pending", newestSvg: null, versions: [] });
  });

  it("does not overwrite a corrupt sidecar while it preserves sanitized orphan output previews", async () => {
    setupRenderer(255);
    const { root, fingerprint } = await rootWithFiles(false);
    const folder = root.children.get("folder") as FakeDir;
    const name = sidecarName(SVG_SOURCE_PATH);
    folder.children.set(name, new FakeFile(name, 10, 200, "corrupt"));
    const pair = viewPair("leaf", { dir: "folder", decision: "approved" });
    const row = await indexApprovedSource({ root, pair, fingerprint, now: "2026-10-01T14:00:00.000Z" });
    expect(row).toMatchObject({ sidecarState: "corrupt", generation: "corrupt", newestSvg: expect.stringContaining("<svg") });
    await expect((await (await folder.getFileHandle(name)).getFile()).text()).resolves.toBe("corrupt");
  });
});
