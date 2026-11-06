import { afterEach, describe, expect, it, vi } from "vitest";
import { planImageEditGroups } from "../src/lib/svgimgbatch";
import { cropEditedSheet, normalizedReturnedBlob, renderEditSheet } from "../src/lib/svgimgpixels";

const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
const group = (n: number) => planImageEditGroups(Array.from({ length: n }, (_, i) => ({
  id: `pair-${i}`, name: `icon-${i}.png`, fingerprint: `v${i}`,
})), n, 1024)[0];

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("image-edit composite pixels", () => {
  it("renders all nine occupied cells and none of the blank slots", () => {
    const drawn: number[][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      fillStyle: "", fillRect: () => undefined,
      drawImage: (...args: unknown[]) => drawn.push(args.slice(1) as number[]),
    }) as never);
    const sources = Array.from({ length: 9 }, () => ({ src: {} as CanvasImageSource, w: 100, h: 100 }));
    const canvas = renderEditSheet(group(9), sources);
    expect([canvas.width, canvas.height]).toEqual([1024, 1024]);
    expect(drawn).toHaveLength(9);
    expect(drawn[0][0]).toBeLessThan(drawn[1][0]);
    expect(drawn[8][1]).toBeGreaterThan(drawn[0][1]);
    drawn.length = 0;
    renderEditSheet(group(5), sources.slice(0, 5));
    expect(drawn).toHaveLength(5);
  });

  it("keeps the minimum 256-pixel drawable cell at the densest supported grid", () => {
    const draws: number[][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      fillStyle: "", fillRect: () => undefined,
      drawImage: (...args: unknown[]) => draws.push(args.slice(1) as number[]),
    }) as never);
    const input = Array.from({ length: 9 }, (_, i) => ({ id: `i${i}`, name: `i${i}.png`, fingerprint: `f${i}` }));
    const [plan] = planImageEditGroups(input, 9, 768);
    renderEditSheet(plan, input.map(() => ({ src: {} as CanvasImageSource, w: 256, h: 256 })));
    expect(draws[0]).toEqual([0, 0, 256, 256]);
  });

  it("maps returned 1536-pixel 3x3 slots to the original pair ids and PNG crops", async () => {
    const draws: number[][] = [];
    vi.stubGlobal("createImageBitmap", async () => ({ width: 1536, height: 1536, close: () => undefined }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      fillStyle: "", fillRect: () => undefined,
      drawImage: (...args: unknown[]) => draws.push(args.slice(1) as number[]),
    }) as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["PNG"], { type: "image/png" })));
    const out = await cropEditedSheet(group(9), png());
    expect(out.map((crop) => crop.id)).toEqual(group(9).cells.map((cell) => cell.id));
    expect(out.every((crop) => crop.blob.type === "image/png")).toBe(true);
    expect(draws[4].slice(0, 4)).toEqual([512, 512, 512, 512]);
    expect(draws[8].slice(0, 4)).toEqual([1024, 1024, 512, 512]);
  });

  it("corrects a mislabeled JPEG response for the review preview before PNG cropping", async () => {
    const jpeg = new Blob([new Uint8Array([255, 216, 255, 0])], { type: "image/png" });
    const normalized = await normalizedReturnedBlob(jpeg);
    expect(normalized.type).toBe("image/jpeg");
    expect([...new Uint8Array(await normalized.arrayBuffer())]).toEqual([255, 216, 255, 0]);
  });

  it("refuses a changed aspect ratio before writing any crop", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 1536, height: 1024, close: () => undefined }));
    await expect(cropEditedSheet(group(4), png())).rejects.toThrow(/square/i);
  });

  it("rejects mislabeled arbitrary bytes instead of saving a fake PNG", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 1024, height: 1024, close: () => undefined }));
    await expect(cropEditedSheet(group(4), new Blob(["not an image"], { type: "image/png" }))).rejects.toThrow(/bytes|format/i);
  });
});
