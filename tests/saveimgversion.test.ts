// saveimgversion.test.ts — saveAiVersion validates, writes into the versions
// subfolder, never overwrites, and returns an updated PairMeta (RULE 23/I-71/I-72).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAiVersion } from "../src/img/saveimg";
import { FakeDir } from "./helpers/fakefs";
import { AI_VERSIONS_DIR } from "../src/lib/imgfile";
import type { SvgSource } from "../src/svg/sources";

// Tiny 1×1 PNG (valid).
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function pngBlob(): Blob {
  const bin = atob(ONE_PIXEL_PNG_BASE64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

function source(): SvgSource {
  return {
    id: "pair-a-icon--", name: "icon_AI.png", stem: "icon_AI", relPath: "a/icon_AI.png", dirPath: "a",
    fingerprint: "1:1", problems: [], metaPath: "a/icon_AI.svg.json", base: "icon", suffix: "",
    sourcePath: "a/icon.png", sourceFingerprint: "1:1",
  };
}

describe("saveAiVersion — validates, writes, versions (RULE 23 / I-71 / I-72)", () => {
  let root: FakeDir;
  beforeEach(() => {
    root = new FakeDir("root");
    global.createImageBitmap = vi.fn().mockResolvedValue({
      width: 1, height: 1, close: () => {},
    } as unknown as ImageBitmap);
  });
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete global.createImageBitmap;
  });

  it("writes v2 into AI_VERSIONS_DIR when the original is at v1", async () => {
    const out = await saveAiVersion({
      root, source: source(), blob: pngBlob(), format: "png",
      prompt: "p", provider: "openai", model: "openai/gpt-image-2.5-sunburst",
      requestedAt: "t", fromVersion: 1, batch: null, requestId: null, meta: null,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.version).toBe(2);
    expect(out.imagePath).toBe(`a/${AI_VERSIONS_DIR}/icon_AI_v2.png`);
    expect(out.width).toBe(1);
    const aDir = await root.getDirectoryHandle("a");
    const versionsDir = await aDir.getDirectoryHandle(AI_VERSIONS_DIR);
    expect(versionsDir).toBeDefined();
    const fh = await versionsDir.getFileHandle("icon_AI_v2.png");
    expect(fh).toBeDefined();
    expect(out.meta.aiVersions).toHaveLength(1);
    expect(out.meta.aiVersions[0].version).toBe(2);
    expect(out.meta.aiVersions[0].imagePath).toBe(out.imagePath);
  });

  it("refuses an empty blob without writing", async () => {
    const out = await saveAiVersion({
      root, source: source(), blob: new Blob([], { type: "image/png" }),
      format: "png", prompt: "p", provider: "openai", model: "m", requestedAt: "t",
      fromVersion: 1, batch: null, requestId: null, meta: null,
    });
    expect(out.ok).toBe(false);
  });

  it("picks v=3 after an existing v2 file on disk (never overwrites)", async () => {
    const sub = await (await root.getDirectoryHandle("a", { create: true }))
      .getDirectoryHandle(AI_VERSIONS_DIR, { create: true });
    await sub.getFileHandle("icon_AI_v2.png", { create: true });
    const out = await saveAiVersion({
      root, source: source(), blob: pngBlob(), format: "png",
      prompt: "p", provider: "openai", model: "m", requestedAt: "t",
      fromVersion: 2, batch: null, requestId: null, meta: null,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.version).toBe(3);
  });
});
