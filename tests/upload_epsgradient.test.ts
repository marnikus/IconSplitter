import { describe, expect, it } from "vitest";
import shadow from "../src/svg/templates/shadow.svg?raw";
import { writeEps, verifyEpsDocument } from "../src/lib/upload/eps";
import { embedXmpMetadataInEps } from "../src/lib/upload/epsmetadata";
import { builtinConverter } from "../src/lib/upload/epsconv/builtin";

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const gradient = (tag = "linearGradient", stops = '<stop stop-color="red"/><stop offset="1" stop-color="blue"/>', attrs = "") =>
  `<defs><${tag} id="g" ${attrs}>${stops}</${tag}></defs>`;
const shape = '<rect width="100" height="100" fill="url(#g)"/>';
const epsOf = (input: string) => {
  const out = writeEps(input, "#fff");
  if (!out.ok) throw new Error(out.reason);
  expect(verifyEpsDocument(out.eps).errors).toEqual([]);
  return out.eps;
};

describe("native vector-only EPS gradients", () => {
  it("emits axial and radial shadings clipped to vector paths, never image operators", () => {
    for (const [tag, type] of [["linearGradient", 2], ["radialGradient", 3]] as const) {
      const eps = epsOf(svg(gradient(tag) + shape));
      expect(eps).toContain(`/ShadingType ${type}`);
      expect(eps).toContain("clip newpath");
      expect(eps).toContain("shfill");
      expect(eps).not.toMatch(/\b(image|colorimage|imagemask)\b/);
    }
  });

  it("converts the actual transformed radial shadow with varying alpha as vector shading", async () => {
    const out = await builtinConverter.convert({ svg: shadow, background: "#fff", title: "shadow.eps" }, {} as never);
    expect(out.ok, out.ok ? "" : out.reason).toBe(true);
    if (!out.ok) return;
    expect(out.eps).toContain("/ShadingType 3");
    expect(out.eps).toContain("/FunctionType 3");
    expect(out.eps).toContain("[101.561 0 0 11.8669 101.561 11.8669] concat");
    expect(verifyEpsDocument(out.eps).errors).toEqual([]);
  });

  it("resolves local href inheritance, object bounds, nested transforms and styled stops", () => {
    const defs = gradient("linearGradient", '<stop style="stop-color:#f00;stop-opacity:1"/><stop offset="100%" stop-color="#00f"/>')
      + '<defs><linearGradient id="copy" href="#g" gradientTransform="rotate(10)"/></defs>';
    const eps = epsOf(svg(defs + '<g transform="translate(2 3)"><rect x="10" y="20" width="30" height="40" fill="url(#copy)"/></g>'));
    expect(eps).toContain("[1 0 0 1 2 3] concat");
    expect(eps).toContain("/ShadingType 2");
  });

  it("handles a colored proven backdrop but refuses alpha on overlapping artwork", () => {
    const defs = gradient("radialGradient", '<stop stop-opacity="0.2"/><stop offset="1" stop-opacity="0"/>');
    expect(epsOf(svg(defs + '<rect width="100" height="100" fill="blue"/>' + shape))).toContain("shfill");
    const bad = writeEps(svg(defs + '<circle cx="50" cy="50" r="10"/>' + shape), "#fff");
    expect(bad).toMatchObject({ ok: false, reason: expect.stringMatching(/backdrop|overlap/) });
  });

  it.each([
    gradient("linearGradient", undefined, 'spreadMethod="reflect"') + shape,
    gradient("radialGradient", undefined, 'r="0"') + shape,
    gradient("linearGradient", undefined, 'gradientTransform="scale(0)"') + shape,
    '<defs><linearGradient id="g" href="#g"/></defs>' + shape,
    '<rect width="100" height="100" fill="url(#missing)"/>',
    gradient("linearGradient", undefined, 'color-interpolation="linearRGB"') + shape,
    gradient() + '<path d="M0 0L50 50" fill="none" stroke="url(#g)"/>',
  ])("refuses unsupported or malformed vector paints rather than substituting pixels", (body) => {
    expect(writeEps(svg(body), "#fff").ok).toBe(false);
  });

  it("preserves even-odd vector clipping and a separate solid stroke", () => {
    const eps = epsOf(svg(gradient() + '<path fill-rule="evenodd" d="M0 0H100V100H0Z M20 20H80V80H20Z" fill="url(#g)" stroke="black"/>'));
    expect(eps).toContain("eoclip newpath");
    expect(eps).toContain("grestore 0 0 0 setrgbcolor");
    expect(eps).toContain("stroke");
  });

  it("does not silently ignore inline SVG compositing effects or malformed coordinates", () => {
    for (const body of [
      gradient() + '<rect width="100" height="100" fill="url(#g)" style="filter:url(#f)"/>',
      gradient("linearGradient", undefined, 'x1="not-a-number"') + shape,
      gradient("linearGradient", '<stop/><stop offset="0.0000000000001" stop-color="red"/><stop offset="1"/>') + shape,
      gradient("linearGradient", undefined, 'gradientTransform="warp(3)"') + shape,
      gradient("radialGradient", undefined, 'fr="0.1"') + shape,
      gradient("linearGradient", undefined, 'gradientTransform="translate(1e999)"') + shape,
      '<defs><linearGradient id="g" href="https://invalid/g"/></defs>' + shape,
    ]) expect(writeEps(svg(body), "#fff").ok).toBe(false);
  });

  it("verifies final metadata-bearing EPS and rejects injected raster and unknown code", () => {
    const eps = epsOf(svg(gradient() + shape));
    const final = embedXmpMetadataInEps(eps, { title: "image", description: "image is metadata text", tags: ["vector"] });
    expect(verifyEpsDocument(final).errors).toEqual([]);
    for (const code of ["image", "colorimage", "imagemask", "/x /image load def", "<00> image", "currentfile", "BI /W 1 ID 00 EI"]) {
      expect(verifyEpsDocument(final.replace("%%EOF", `${code}\n%%EOF`)).ok, code).toBe(false);
    }
    expect(verifyEpsDocument(final.replace("/pdfmark /cleartomark", "/image /cleartomark")).ok).toBe(false);
    expect(verifyEpsDocument(eps.replace("/ShadingType 2", "/ImageType 1")).ok).toBe(false);
    expect(verifyEpsDocument(eps.replace("/Coords [0 0 1 0]", "/Coords [0 0 0 0]")).ok).toBe(false);
  });
});
