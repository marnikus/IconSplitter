// @vitest-environment node
import { describe, expect, it } from "vitest";
import { vectorStops, gradientFunction, VECTOR_COLOR_ERROR } from "../src/lib/upload/epsgradientfunction";
import { psData, parsePsData, psNumber } from "../src/lib/upload/epspsdata";
import { checkShading } from "../src/lib/upload/epsshading";
import { checkPostScript } from "../src/lib/upload/epscheck";

const bg = { r: 1, g: 1, b: 1 };
const stops = [{ offset: 0, color: { r: 0, g: 0.1, b: 1 }, alpha: 0.2 },
  { offset: 1, color: { r: 1, g: 0.6, b: 0 }, alpha: 0.9 }];
const fn = gradientFunction(vectorStops(stops, bg, 0.7));
const shading = { ShadingType: 2, ColorSpace: "DeviceRGB", Coords: [0, 0, 1, 0], Function: fn, Extend: [true, true] };

describe("vector gradient functions and the closed PostScript data grammar", () => {
  it("bounds nonlinear color × alpha interpolation error throughout every segment", () => {
    const s = vectorStops(stops, bg, 0.7);
    expect(s.length).toBeGreaterThan(2); // merely mixing the two original stops is wrong
    for (let i = 0; i + 1 < s.length; i++) for (let j = 0; j <= 10; j++) {
      const t = j / 10, x = s[i].offset + (s[i + 1].offset - s[i].offset) * t;
      const source = [x, 0.1 + 0.5 * x, 1 - x];
      const alpha = (0.2 + 0.7 * x) * 0.7;
      for (let c = 0; c < 3; c++) {
        const actual = s[i].color[c] + (s[i + 1].color[c] - s[i].color[c]) * t;
        expect(Math.abs(actual - (source[c] * alpha + 1 - alpha))).toBeLessThanOrEqual(VECTOR_COLOR_ERROR + 1e-12);
      }
    }
  });

  it("round-trips the only supported vector data, preserving precision and valid zeroes", () => {
    expect(parsePsData(psData(shading))).toEqual(JSON.parse(JSON.stringify(parsePsData(psData(shading)))));
    expect(() => checkShading(psData(shading))).not.toThrow();
    expect(psNumber(100)).toBe("100");
    expect(psNumber(0)).toBe("0");
    expect(psNumber(0.649038)).toBe("0.649038");
    expect(() => psNumber(Infinity)).toThrow();
    expect(() => psNumber(1e13)).toThrow();
    expect(() => vectorStops(Array.from({ length: 256 }, (_, i) => ({ offset: i / 255, color: i % 2 ? bg : { r: 0, g: 0, b: 0 }, alpha: i % 2 })), bg, 1)).toThrow(/budget/);
  });

  it.each(["<< /x 1 /x 2 >>", "<< /x", "[0 1", "{ image }", "<00>", "(image)", "/Bad#69mage", "NaN", "1 2", "[<0>]"])("rejects ambiguous, executable or stream-bearing data: %s", (text) => {
    expect(() => parsePsData(text)).toThrow();
  });

  it("limits data size and nesting instead of exhausting the parser", () => {
    expect(() => parsePsData(" ".repeat(2_000_001))).toThrow(/limit/);
    expect(() => parsePsData("[".repeat(20) + "0" + "]".repeat(20))).toThrow(/nesting/);
  });

  it.each([
    { ...shading, ImageType: 1 }, { ...shading, Coords: [0, 0] },
    { ...shading, Coords: [0, 0, 0, 0] }, { ...shading, Extend: [true, false] },
    { ...shading, ColorSpace: "Pattern" }, { ...shading, Function: { ...fn, Bounds: [1] } },
    { ...shading, Function: { ...fn, Encode: [1, 0] } }, { ...shading, Function: { ...fn, Domain: [0, 2] } },
    { ...shading, Function: { FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0], C1: [1, 1, 2], N: 1 } },
    { ...shading, ShadingType: 3, Coords: [0, 0, 0, 0, 0, 0] },
    { ...shading, Function: "Image" },
  ])("rejects unverified shading dictionaries", (d) => {
    expect(() => checkShading(psData(d))).toThrow();
  });

  it("cannot hide raster operations in procedures, aliases, strings, previews, patterns or fonts", () => {
    for (const program of [
      "image", "colorimage", "imagemask", "/a /image load def", "/a { image } bind def a",
      "<< /PatternType 1 /PaintProc { image } >> makepattern", "<00> image", "currentfile /ASCII85Decode filter image",
      "(image) cvx exec", "[105 109 97 103 101] cvx exec", "/FontType 3 def", "%%BeginPreview: 1 1 1 1\n% 00\n%%EndPreview", "%%BeginBinary: 20\n% data", "%%BeginData: 2 Hex Lines\n%ff",
    ]) expect(checkPostScript(program).length, program).toBeGreaterThan(0);
    expect(checkPostScript("% image is just a comment\nnewpath 0 0 moveto 1 1 lineto clip newpath")).toEqual([]);
    expect(checkPostScript("newpath 0 0 moveto 1 1 lineto eofill")).toEqual([]);
    expect(checkPostScript("clip")).toEqual(["line 1: clip has no current path"]);
    expect(checkPostScript("eoclip")).toEqual(["line 1: eoclip has no current path"]);
    expect(checkPostScript(`${psData(shading)} shfill image`).length).toBeGreaterThan(0);
    expect(checkPostScript(`${psData(shading)} shfill`)).toEqual([]);
  });
});
