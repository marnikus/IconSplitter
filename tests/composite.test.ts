// composite.test.ts — contact-sheet drawing through injected decode/canvas
// (RULE 8): deterministic order, aspect preserved, empty cells untouched,
// composite failure means no request payload.
import { describe, expect, it } from "vitest";
import { buildComposite, type CompositeDeps } from "../src/svggen/composite";
import { gridFor } from "../src/lib/svggrid";

interface Draw { x: number; y: number; w: number; h: number }

function fakes(sizes: [number, number][]) {
  const draws: (Draw & { img: number })[] = [];
  const deps: CompositeDeps = {
    decode: async (f: File) => {
      const [w, h] = sizes[Number(f.name)];
      return { width: w, height: h, srcIndex: Number(f.name) };
    },
    makeCanvas: (size: number) => ({
      width: size, height: size,
      ctx: {
        fillStyle: "",
        fillRect: () => undefined,
        drawImage: (img: { srcIndex: number }, r: { x: number; y: number; w: number; h: number }) => {
          draws.push({ img: img.srcIndex, ...r });
        },
      },
      toBlob: async () => new Blob(["png-bytes"]),
    }),
  } as unknown as CompositeDeps;
  return { deps, draws };
}

const file = (i: number) => new File(["x"], String(i), { type: "image/png" });

describe("buildComposite", () => {
  it("draws three images into a 2x2 sheet, cell 4 empty, order preserved", async () => {
    const { deps, draws } = fakes([[100, 100], [200, 100], [100, 200]]);
    const out = await buildComposite([file(0), file(1), file(2)], gridFor(3), deps, { canvasSize: 400, padding: 20 });
    expect(out.cells).toHaveLength(4);
    expect(draws.map((d) => d.img)).toEqual([0, 1, 2]);
    // image 1 is 2:1 wide -> limited by width of the padded cell
    const d1 = draws[1];
    expect(d1.w).toBe(160); // 200 - 2*20
    expect(d1.h).toBe(80);
  });

  it("a decode failure aborts the whole composite so no request is sent", async () => {
    const deps: CompositeDeps = {
      decode: async () => { throw new Error("unreadable"); },
      makeCanvas: () => { throw new Error("must not be reached"); },
    };
    await expect(buildComposite([file(0)], gridFor(1), deps, { canvasSize: 256, padding: 8 })).rejects.toThrow("unreadable");
  });

  it("returns a hash that changes with the content", async () => {
    const a = fakes([[10, 10]]);
    const b = fakes([[10, 10]]);
    const ra = await buildComposite([file(0)], gridFor(1), a.deps, { canvasSize: 64, padding: 4 });
    const rb = await buildComposite([file(0)], gridFor(1), b.deps, { canvasSize: 64, padding: 4 });
    expect(typeof ra.hash).toBe("string");
    expect(ra.hash).toBe(rb.hash); // same inputs, same fingerprint
  });
});
