// svgup_optimizer.test.ts — the browser half of the optimizer with the report's
// §3.1 gate in place: SVGO may rewrite geometry (that is the point of running the
// full preset), but only when the verifier can prove the two documents render to
// the same pixels. A refused optimisation writes the UNOPTIMISED copy — never a
// document nobody checked. With no renderer at all (an environment without a
// canvas) the module falls back to the plugins that cannot change a pixel.
import { describe, expect, it } from "vitest";
import { optimizeSvg, type PixelRender } from "../src/svgupload/optimizer";

const SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">',
  "<!-- editor comment -->",
  '<path d="M2 2h20v20H2z" fill="#123456" stroke-width="1.5"/>',
  "</svg>",
].join("");

/** White 256×256; `black` blacks out that many pixels (3% at 2000). */
function frame(black = 0): Uint8Array {
  const pixels = new Uint8Array(256 * 256 * 4).fill(255);
  for (let i = 0; i < black; i += 1) pixels[i * 4] = 0;
  return pixels;
}

/** A renderer that answers with the pixels the caller asked for. */
function renders(black: number): PixelRender {
  return async () => frame(black);
}

describe("optimizeSvg with the appearance gate", () => {
  it("keeps the optimised copy when the pixels match and it is smaller", async () => {
    const out = await optimizeSvg(SVG, true, renders(0));
    expect(out.applied).toBe(true);
    expect(out.bytesAfter).toBeLessThan(out.bytesBefore);
    expect(out.svg).not.toContain("editor comment");
    expect(out.warnings).toEqual([]);
  });

  it("writes the unoptimised copy when a pixel moved beyond the tolerance", async () => {
    let first = true;
    const pixels: PixelRender = async () => { const p = frame(first ? 0 : 2000); first = false; return p; };
    const out = await optimizeSvg(SVG, true, pixels);
    expect(out.applied).toBe(false);
    expect(out.svg).toBe(SVG);
    expect(out.warnings.join(" ")).toContain("changed the artwork");
  });

  it("writes the unoptimised copy when a side cannot be rendered at all", async () => {
    const out = await optimizeSvg(SVG, true, async () => null);
    expect(out.applied).toBe(false);
    expect(out.svg).toBe(SVG);
  });

  it("runs only the plugins that cannot change a pixel when no renderer exists", async () => {
    const out = await optimizeSvg(SVG, true);
    expect(out.applied).toBe(true);
    expect(out.svg).not.toContain("editor comment"); // the conservative pair still ran
    expect(out.svg).toContain('d="M2 2h20v20H2z"');   // the geometry was NOT rewritten
  });

  it("leaves the document alone when the setting is off, renderer or not", async () => {
    const out = await optimizeSvg(SVG, false, renders(2000));
    expect(out.applied).toBe(false);
    expect(out.svg).toBe(SVG);
  });
});
