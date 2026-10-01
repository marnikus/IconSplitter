import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../src/lib/svgcomposite";
import { DEFAULT_SVG_PREFERENCES } from "../src/svg/prefs";
import { prepareBatches } from "../src/svg/preflight";
import { stableSvgSourceId } from "../src/svg/prompt";
import { buildRequestPayload } from "../src/svg/requesty";
import type { SvgSourceRow } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { sourceRowFixture } from "./helpers/svgfixtures";

function setupCanvas() {
  const calls = { drawImage: vi.fn(), fillRect: vi.fn(), fillText: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    ...calls, fillStyle: "", font: "", textAlign: "", textBaseline: "",
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["contact-sheet"], { type: "image/png" })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 80, height: 60, close: vi.fn() })));
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:contact-sheet");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  return calls;
}

async function setupRows(paths: string[]): Promise<{ root: FakeDir; rows: SvgSourceRow[] }> {
  const root = new FakeDir("root");
  const dir = new FakeDir("sources");
  root.children.set("sources", dir);
  const rows: SvgSourceRow[] = [];
  for (const path of paths) {
    const filename = path.split("/").at(-1)!;
    const handle = new FakeFile(filename, 12, 1, `bytes:${filename}`);
    dir.children.set(filename, handle);
    const fingerprint = await sha256Hex(await handle.getFile());
    const relativePath = `sources/${filename}`;
    rows.push(sourceRowFixture({ sourceId: stableSvgSourceId(relativePath), filename, relativePath, sourceFingerprint: fingerprint, pairId: `pair-${filename}` }));
  }
  return { root, rows };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Requesty local preflight", () => {
  it("sorts by one canonical relative-path order and assigns explicit row-major IDs", async () => {
    const calls = setupCanvas();
    const { root, rows } = await setupRows(["z_AI.png", "B_AI.png", "a_AI.png"]);
    const prepared = await prepareBatches(root, rows, { ...DEFAULT_SVG_PREFERENCES, imagesPerRequest: 2, cellSize: 256, paddingPx: 16 });
    expect(prepared.actualBatchCount).toBe(2);
    expect(prepared.batches[0].manifest.map((item) => [item.positionId, item.filename])).toEqual([[1, "a_AI.png"], [2, "B_AI.png"]]);
    expect(prepared.batches[1].manifest.map((item) => [item.positionId, item.filename])).toEqual([[1, "z_AI.png"]]);
    expect(calls.drawImage).toHaveBeenCalledTimes(3);
    for (const batch of prepared.batches) URL.revokeObjectURL(batch.compositeUrl);
  });

  it("uses the exact JSON body byte count and never includes an API key", async () => {
    setupCanvas();
    const { root, rows } = await setupRows(["leaf_AI.png"]);
    const prefs = { ...DEFAULT_SVG_PREFERENCES, imagesPerRequest: 1, cellSize: 256, paddingPx: 16 };
    const [batch] = (await prepareBatches(root, rows, prefs)).batches;
    const body = buildRequestPayload({
      config: { baseUrl: prefs.baseUrl, model: prefs.model, timeoutMs: prefs.timeoutMs,
        rateLimitRetries: prefs.rateLimitRetries, maxOutputTokens: prefs.maxOutputTokens },
      key: "rq_live_abcdefghijklmnopqrstuvwxyz", manifest: batch.manifest, prompt: prefs.prompt,
      compositeDataUrl: batch.compositeDataUrl,
    });
    expect(batch.payloadBytes).toBe(new TextEncoder().encode(JSON.stringify(body)).byteLength);
    expect(JSON.stringify(body)).not.toContain("rq_live_abcdefghijklmnopqrstuvwxyz");
    expect(batch.compositeDataUrl).toMatch(/^data:image\/png;base64,/);
    URL.revokeObjectURL(batch.compositeUrl);
  });

  it("auto-reduces image count against the full request-body cap, not just PNG bytes", async () => {
    setupCanvas();
    const { root, rows } = await setupRows(["one_AI.png", "two_AI.png"]);
    const singlePrefs = { ...DEFAULT_SVG_PREFERENCES, imagesPerRequest: 1, cellSize: 256, paddingPx: 16 };
    const single = await prepareBatches(root, [rows[0]], singlePrefs);
    const cap = single.batches[0].payloadBytes;
    URL.revokeObjectURL(single.batches[0].compositeUrl);
    const prepared = await prepareBatches(root, rows, { ...singlePrefs, imagesPerRequest: 2, maxPayloadBytes: cap, autoReducePayload: true });
    expect(prepared.autoReduced).toBe(true);
    expect(prepared.batches.map((batch) => batch.rows.length)).toEqual([1, 1]);
    expect(prepared.batches.every((batch) => batch.payloadBytes <= cap)).toBe(true);
    prepared.batches.forEach((batch) => URL.revokeObjectURL(batch.compositeUrl));
  });

  it("stops before contact-sheet drawing if an approved source changes after scanning", async () => {
    const calls = setupCanvas();
    const { root, rows } = await setupRows(["leaf_AI.png"]);
    const dir = root.children.get("sources") as FakeDir;
    (dir.children.get("leaf_AI.png") as FakeFile).text = "edited outside the app";
    await expect(prepareBatches(root, rows, DEFAULT_SVG_PREFERENCES)).rejects.toThrow("changed after scan");
    expect(calls.drawImage).not.toHaveBeenCalled();
  });

  it("fails locally when a single complete request body remains over the cap", async () => {
    setupCanvas();
    const { root, rows } = await setupRows(["leaf_AI.png"]);
    await expect(prepareBatches(root, rows, { ...DEFAULT_SVG_PREFERENCES, maxPayloadBytes: 1 }))
      .rejects.toThrow("Contact sheet exceeds");
  });
});
