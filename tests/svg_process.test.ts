import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../src/lib/svgcomposite";
import { saveDecisions } from "../src/selection/reviewstore";
import { DEFAULT_SVG_PREFERENCES } from "../src/svg/prefs";
import { runSvgBatch } from "../src/svg/run/process";
import { loadSidecar, sidecarName } from "../src/svg/sidecar";
import { stableSvgSourceId } from "../src/svg/prompt";
import type { PreparedBatch } from "../src/svg/preflight";
import type { SvgManifestItem } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { sourceRowFixture, SVG_MARKUP, SVG_SOURCE_PATH } from "./helpers/svgfixtures";

const secret = "rq_live_abcdefghijklmnopqrstuvwxyz";
const goodResponse = (svg = SVG_MARKUP) => ({ choices: [{ message: { content: JSON.stringify({
  icons: [{ position_id: 1, title: "leaf_AI.png", svg }],
}) } }], usage: { prompt_tokens: 45, completion_tokens: 30, total_tokens: 75, cost: 0.002 } });

function stubVisibleSvg(): void {
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
    drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
  } as unknown as CanvasRenderingContext2D);
}

async function environment(decision: "approved" | "declined" = "approved") {
  const root = new FakeDir("root");
  const folder = new FakeDir("folder");
  root.children.set("folder", folder);
  const image = new FakeFile("leaf_AI.png", 24, 100, "stable AI bytes");
  folder.children.set(image.name, image);
  const fingerprint = await sha256Hex(await image.getFile());
  const sourceId = stableSvgSourceId(SVG_SOURCE_PATH);
  const manifest: SvgManifestItem[] = [{ positionId: 1, sourceId, filename: "leaf_AI.png",
    relativePath: SVG_SOURCE_PATH, fingerprint }];
  await saveDecisions(root, [{ pair_id: "pair-leaf", source: null, ai_result: SVG_SOURCE_PATH,
    decision, reviewed_at: "2026-10-01T12:00:00.000Z" }]);
  const row = sourceRowFixture({ sourceId, pairId: "pair-leaf", relativePath: SVG_SOURCE_PATH,
    filename: "leaf_AI.png", sourceFingerprint: fingerprint });
  const composite = new Blob(["contact"], { type: "image/png" });
  const batch: PreparedBatch = { batchId: "batch-integration", manifest, rows: [row], composite,
    compositeUrl: "blob:contact", compositeDataUrl: "data:image/png;base64,Y29udGFjdA==", compositeHash: "c".repeat(64),
    payloadBytes: 128, requestedSize: 1, reduced: false };
  return { root, folder, image, fingerprint, sourceId, manifest, row, batch };
}

function stubSuccessfulFetch(body = goodResponse(), beforeResponse?: () => Promise<void>) {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    await beforeResponse?.();
    return new Response(JSON.stringify(body), { status: 200, headers: { "x-request-id": "provider-request-7" } });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("full approved-source generation pipeline", () => {
  it("checkpoints, sends multimodal data, maps/validates output, saves a version, then persists actual usage", async () => {
    stubVisibleSvg();
    const fetcher = stubSuccessfulFetch();
    const env = await environment();
    const result = await runSvgBatch({ root: env.root, batch: env.batch, prefs: DEFAULT_SVG_PREFERENCES, key: secret });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://router.requesty.ai/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${secret}` });
    expect((init as RequestInit).body).not.toContain(secret);
    expect(result).toMatchObject({ state: "complete", summary: { successful: 1, failed: 0, missing: 0, invalid: 0 },
      usage: { inputTokens: 45, outputTokens: 30, totalTokens: 75, actualCostUsd: 0.002 } });
    expect(env.folder.children.has("leaf_AI.svg")).toBe(true);
    const output = await (await env.folder.getFileHandle("leaf_AI.svg")).getFile();
    const savedSvg = await output.text();
    expect(savedSvg).toContain('width="10"');
    expect(savedSvg).not.toContain(secret);
    const sidecar = await loadSidecar(env.root, env.sourceId, SVG_SOURCE_PATH);
    expect(sidecar.state).toBe("ok");
    if (sidecar.state === "ok") {
      expect(sidecar.value.requests[0]).toMatchObject({ status: "complete", providerRequestId: "provider-request-7",
        usage: { totalTokens: 75, actualCostUsd: 0.002 } });
      expect(sidecar.value.versions).toHaveLength(1);
      expect(sidecar.value.versions[0]).toMatchObject({ version: 1, path: "folder/leaf_AI.svg", review: "pending", validation: { valid: true, visible: true } });
    }
    expect((await env.folder.getFileHandle(sidecarName(SVG_SOURCE_PATH))).getFile).toBeDefined();
  });

  it("refuses to send if Selection approval was removed before the durable checkpoint", async () => {
    const fetcher = stubSuccessfulFetch();
    const env = await environment("declined");
    const result = await runSvgBatch({ root: env.root, batch: env.batch, prefs: DEFAULT_SVG_PREFERENCES, key: secret });
    expect(result.state).toBe("failed");
    expect(fetcher).not.toHaveBeenCalled();
    expect(env.folder.children.has("leaf_AI.svg")).toBe(false);
  });

  it("rechecks approval after the response and never saves output after a concurrent decline", async () => {
    stubVisibleSvg();
    const env = await environment();
    const fetcher = stubSuccessfulFetch(goodResponse(), async () => {
      await saveDecisions(env.root, [{ pair_id: "pair-leaf", source: null, ai_result: SVG_SOURCE_PATH,
        decision: "declined", reviewed_at: "2026-10-01T13:00:00.000Z" }]);
    });
    const result = await runSvgBatch({ root: env.root, batch: env.batch, prefs: DEFAULT_SVG_PREFERENCES, key: secret });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ state: "partial", summary: { successful: 0, failed: 1 } });
    expect(env.folder.children.has("leaf_AI.svg")).toBe(false);
    const sidecar = await loadSidecar(env.root, env.sourceId, SVG_SOURCE_PATH);
    expect(sidecar.state).toBe("ok");
    if (sidecar.state === "ok") expect(sidecar.value.requests[0].status).toBe("partial");
  });

  it("stores unknown network outcomes and blocks a blind subsequent request", async () => {
    const first = vi.fn(async () => { throw new Error("connection lost"); });
    vi.stubGlobal("fetch", first);
    const env = await environment();
    const unknown = await runSvgBatch({ root: env.root, batch: env.batch, prefs: DEFAULT_SVG_PREFERENCES, key: secret });
    expect(unknown.state).toBe("unknown");
    expect(unknown.safeError).not.toContain(secret);
    const blockedFetch = stubSuccessfulFetch();
    const blocked = await runSvgBatch({ root: env.root, batch: env.batch, prefs: DEFAULT_SVG_PREFERENCES, key: secret });
    expect(blocked.state).toBe("failed");
    expect(blockedFetch).not.toHaveBeenCalled();
    const sidecar = await loadSidecar(env.root, env.sourceId, SVG_SOURCE_PATH);
    expect(sidecar.state).toBe("ok");
    if (sidecar.state === "ok") expect(sidecar.value.requests[0].status).toBe("unknown");
  });

  it("refuses generation when an orphan SVG has no durable sidecar history", async () => {
    const fetcher = stubSuccessfulFetch();
    const env = await environment();
    env.folder.children.set("leaf_AI.svg", new FakeFile("leaf_AI.svg", 12, 1, SVG_MARKUP));
    env.folder.children.delete(sidecarName(SVG_SOURCE_PATH));
    const result = await runSvgBatch({ root: env.root, batch: env.batch, prefs: DEFAULT_SVG_PREFERENCES, key: secret });
    expect(result.state).toBe("failed");
    expect(result.safeError).toContain("lack durable version metadata");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
