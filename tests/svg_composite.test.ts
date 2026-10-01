import { afterEach, describe, expect, it, vi } from "vitest";
import { blobDataUrl, containRect, createContactSheet, sha256Hex, squareGrid } from "../src/lib/svgcomposite";

interface CanvasCall { name: string; args: unknown[] }

function canvasRecorder(): CanvasCall[] {
  const calls: CanvasCall[] = [];
  const context = {
    fillStyle: "", font: "", textAlign: "", textBaseline: "",
    fillRect: (...args: unknown[]) => calls.push({ name: "fillRect", args }),
    drawImage: (...args: unknown[]) => calls.push({ name: "drawImage", args }),
    fillText: (...args: unknown[]) => calls.push({ name: "fillText", args }),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("square contact-sheet geometry", () => {
  it("uses row-major numbered positions and a square canvas with empty cells", () => {
    expect(squareGrid(1, 256, 16)).toMatchObject({ columns: 1, rows: 1, canvasSize: 256, emptyCells: 0, cells: [{ positionId: 1, x: 0, y: 0 }] });
    expect(squareGrid(4, 512, 32).cells).toEqual([
      { positionId: 1, x: 0, y: 0 }, { positionId: 2, x: 512, y: 0 },
      { positionId: 3, x: 0, y: 512 }, { positionId: 4, x: 512, y: 512 },
    ]);
    expect(squareGrid(5, 256, 16)).toMatchObject({ columns: 3, rows: 2, canvasSize: 768, emptyCells: 4 });
    expect(squareGrid(9, 256, 16)).toMatchObject({ columns: 3, rows: 3, canvasSize: 768, emptyCells: 0 });
  });

  it("rejects invalid counts, cell sizes, and padding", () => {
    for (const count of [0, 10, 1.2]) expect(() => squareGrid(count)).toThrow(RangeError);
    expect(() => squareGrid(1, 0)).toThrow(RangeError);
    expect(() => squareGrid(1, 128, 64)).toThrow(RangeError);
    expect(() => containRect({ sourceWidth: 0, sourceHeight: 4, boxSize: 5, x: 0, y: 0 })).toThrow(RangeError);
    expect(() => containRect({ sourceWidth: Number.NaN, sourceHeight: 4, boxSize: 5, x: 0, y: 0 })).toThrow(RangeError);
  });

  it("contains source images without cropping and centers both aspect ratios", () => {
    expect(containRect({ sourceWidth: 200, sourceHeight: 100, boxSize: 80, x: 10, y: 20 }))
      .toEqual({ x: 10, y: 40, width: 80, height: 40 });
    expect(containRect({ sourceWidth: 100, sourceHeight: 200, boxSize: 80, x: 0, y: 0 }))
      .toEqual({ x: 20, y: 0, width: 40, height: 80 });
  });

  it("draws both images in manifest order, labels their position IDs, and closes bitmaps", async () => {
    const calls = canvasRecorder();
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async (file: File) => ({
      width: file.name === "wide.png" ? 200 : 100, height: file.name === "wide.png" ? 100 : 200, close,
    })));
    const files = [new File(["a"], "wide.png"), new File(["b"], "tall.png")];
    const output = await createContactSheet(files, 256, 16);
    expect(output.type).toBe("image/png");
    expect(output.size).toBeGreaterThan(0);
    expect(calls.filter((call) => call.name === "drawImage")).toHaveLength(2);
    expect(calls.filter((call) => call.name === "fillText").map((call) => call.args[0])).toEqual(["1", "2"]);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("encodes the PNG data URL and fingerprints bytes with SHA-256", async () => {
    const blob = new Blob(["abc"], { type: "image/png" });
    await expect(blobDataUrl(blob)).resolves.toBe("data:image/png;base64,YWJj");
    await expect(sha256Hex(blob)).resolves.toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
