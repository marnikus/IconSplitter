import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../src/lib/svgcomposite";
import { sanitizeSvg } from "../src/lib/svgvalidate";
import { saveDecisions } from "../src/selection/reviewstore";
import { retryRecoverableSvg } from "../src/svg/recovery";
import { saveSidecar } from "../src/svg/sidecar";
import { stableSvgSourceId } from "../src/svg/prompt";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { sidecarFixture, sourceRowFixture, SVG_MARKUP, SVG_SOURCE_PATH } from "./helpers/svgfixtures";
import type { SvgSourceRow } from "../src/svg/types";

function visibleRenderer(): void {
  class FakeImage {
    naturalWidth = 10;
    naturalHeight = 10;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { /* decode resolves below */ }
    decode = () => Promise.resolve();
  }
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
  } as unknown as CanvasRenderingContext2D);
}

async function recoveryFixture(decision: "approved" | "declined" = "approved") {
  const root = new FakeDir("root");
  const folder = new FakeDir("folder");
  root.children.set("folder", folder);
  const source = new FakeFile("leaf_AI.png", 20, 1, "stable source bytes");
  folder.children.set(source.name, source);
  const fingerprint = await sha256Hex(await source.getFile());
  const value = sidecarFixture();
  value.sourceFingerprint = fingerprint;
  value.requests[0].manifest[0].fingerprint = fingerprint;
  value.versions[0].sourceFingerprint = fingerprint;
  value.versions[0].manifest[0].fingerprint = fingerprint;
  await saveSidecar(root, value);
  const decisions = [{ pair_id: "pair-leaf", source: null, ai_result: SVG_SOURCE_PATH, decision,
    reviewed_at: "2026-10-01T12:00:00.000Z" }] as const;
  await saveDecisions(root, [...decisions]);
  const checked = sanitizeSvg(SVG_MARKUP, "leaf_AI.png");
  if (!checked.ok) throw new Error(checked.error);
  const tempName = ".leaf_AI.svg.tmp-request-1";
  folder.children.set(tempName, new FakeFile(tempName, 100, 1, checked.svg));
  const row: SvgSourceRow = sourceRowFixture({ sourceId: stableSvgSourceId(SVG_SOURCE_PATH), filename: "leaf_AI.png",
    relativePath: SVG_SOURCE_PATH, sourceFingerprint: fingerprint,
    recoverableTempPath: `folder/${tempName}`, generation: "recoverable" });
  return { root, folder, row, tempName };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("restart recovery of staged SVG files", () => {
  it("promotes a valid retained temp only when source approval and fingerprint still match", async () => {
    visibleRenderer();
    const env = await recoveryFixture();
    expect(await retryRecoverableSvg(env.root, env.row)).toBe("saved");
    expect(env.folder.children.has("leaf_AI.svg")).toBe(true);
    expect(env.folder.children.has(env.tempName)).toBe(false);
    const svg = await (await env.folder.getFileHandle("leaf_AI.svg")).getFile();
    expect(await svg.text()).toContain("<svg");
  });

  it("never promotes after Selection approval is revoked", async () => {
    visibleRenderer();
    const env = await recoveryFixture("declined");
    expect(await retryRecoverableSvg(env.root, env.row)).toBe("not-approved");
    expect(env.folder.children.has(env.tempName)).toBe(true);
    expect(env.folder.children.has("leaf_AI.svg")).toBe(false);
  });

  it("keeps the verified temp and refuses to overwrite a version that appeared meanwhile", async () => {
    visibleRenderer();
    const env = await recoveryFixture();
    env.folder.children.set("leaf_AI.svg", new FakeFile("leaf_AI.svg", 8, 1, "older version"));
    expect(await retryRecoverableSvg(env.root, env.row)).toBe("conflict");
    expect(env.folder.children.has(env.tempName)).toBe(true);
    const preserved = await (await env.folder.getFileHandle("leaf_AI.svg")).getFile();
    expect(await preserved.text()).toBe("older version");
  });

  it("does not promote malformed or nonrendering SVG and retains the temp for inspection", async () => {
    visibleRenderer();
    const env = await recoveryFixture();
    env.folder.children.set(env.tempName, new FakeFile(env.tempName, 10, 1, "<svg>broken"));
    expect(await retryRecoverableSvg(env.root, env.row)).toBe("invalid");
    expect(env.folder.children.has(env.tempName)).toBe(true);
    expect(env.folder.children.has("leaf_AI.svg")).toBe(false);
  });
});
