// eps_export.test.ts — the EPS is a real EPSF-3.0 conversion, and the verifier
// proves it (RULE 3/13). Geometry, paint, transforms and `<use>` all have to
// survive; unsupported features have to be reported, not guessed at.
import { describe, expect, it } from "vitest";
import { buildDrawing } from "../src/lib/epsdraw";
import { pathOps, psColour, svgToEps } from "../src/lib/epssvg";
import { epsSummary, verifyEps } from "../src/lib/epsverify";
import { colourOf } from "../src/lib/epspath";
import { documentBounds } from "../src/lib/uploadbounds";

const at = (svg: string) => ({ svg, widthPt: 288, heightPt: 288 });
const icon = (inner: string, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

describe("svgToEps", () => {
  it("writes an EPSF-3.0 file with a header, a bounding box and showpage", () => {
    const file = svgToEps(at(icon('<rect x="10" y="10" width="80" height="80" fill="#ff0000"/>')));
    expect(file.ok).toBe(true);
    expect(file.eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(file.eps).toContain("%%BoundingBox:");
    expect(file.eps).toContain("showpage");
    expect(file.eps.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("converts geometry in PostScript points, origin bottom-left", () => {
    // 100 user units -> 288 pt, so the rect's bottom-left corner is at (28.8, 28.8).
    const file = svgToEps(at(icon('<rect x="10" y="10" width="80" height="80" fill="#ff80c0"/>')));
    expect(file.eps).toContain("1.0000 0.5020 0.7529 setrgbcolor");
    const drawing = buildDrawing(at(icon('<rect x="10" y="10" width="80" height="80" fill="#000"/>'))).drawing!;
    const ops = pathOps(drawing.shapes[0]).split("\n");
    expect(ops[0]).toBe("28.80 259.20 m"); // y is flipped: 288 - 10 x 2.88
    expect(ops[1]).toBe("259.20 259.20 l");
    expect(ops[2]).toBe("259.20 28.80 l");
  });

  it("carries fill-rule, stroke width, cap and join into PostScript", () => {
    const file = svgToEps(at(icon('<path d="M0 0 L10 0 L10 10 Z" fill="none" stroke="rgb(0 0 255)" stroke-width="4" stroke-linecap="round" stroke-linejoin="bevel" fill-rule="evenodd"/>')));
    expect(file.eps).toContain("0.0000 0.0000 1.0000 setrgbcolor");
    expect(file.eps).toContain("11.52 setlinewidth"); // 4 units × 2.88
    expect(file.eps).toContain("1 setlinecap");
    expect(file.eps).toContain("2 setlinejoin");
  });

  it("applies group transforms and element transforms to the emitted points", () => {
    const source = icon('<g transform="translate(10 10)"><rect transform="scale(2)" x="0" y="0" width="10" height="10" fill="#000"/></g>');
    const file = svgToEps(at(source));
    const ops = pathOps(buildDrawing(at(source)).drawing!.shapes[0]).split("\n");
    // translate(10,10) ∘ scale(2) puts the top-left at user (10,10) -> 10×2.88 pt, y flipped.
    expect(ops[0]).toBe("28.80 259.20 m");
    expect(ops[1]).toBe("86.40 259.20 l");
    expect(file.eps).toContain("28.80 259.20 m");
  });

  it("resolves <use> and reports an unresolved one instead of drawing nothing", () => {
    const ok = svgToEps(at(icon('<defs><rect id="r" x="0" y="0" width="10" height="10" fill="#000"/></defs><use href="#r" x="5" y="5"/>')));
    expect(ok.ok).toBe(true);
    expect(ok.features).toEqual([]);
    const broken = svgToEps(at(icon('<use href="#missing"/>')));
    expect(broken.ok).toBe(false);
    expect(broken.error).toContain("nothing to convert");
  });

  it("turns arcs and quadratics into real curves, never straight lines", () => {
    const arc = buildDrawing(at(icon('<path d="M0 0 A 10 10 0 0 1 20 0" fill="none" stroke="#000"/>'))).drawing!;
    expect(pathOps(arc.shapes[0])).toContain(" c");
    const quad = buildDrawing(at(icon('<path d="M0 0 Q 10 10 20 0" fill="none" stroke="#000"/>'))).drawing!;
    expect(pathOps(quad.shapes[0])).toContain(" c");
  });

  it("uses the kappa construction for circles so the shape stays round", () => {
    const drawing = buildDrawing(at(icon('<circle cx="50" cy="50" r="10" fill="#000"/>'))).drawing!;
    const ops = pathOps(drawing.shapes[0]).split("\n");
    expect(ops).toHaveLength(5); // move + four quadrants
    expect(ops[0]).toBe("172.80 144.00 m");
  });

  it("refuses to invent geometry for features EPS cannot express", () => {
    const file = svgToEps(at(icon('<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs><text x="0" y="10">hi</text><rect x="0" y="0" width="10" height="10" fill="url(#g)"/>')));
    expect(file.ok).toBe(false); // nothing paintable was convertible
    const mixed = svgToEps(at(icon('<text x="0" y="10">hi</text><rect x="0" y="0" width="10" height="10" fill="#000"/>')));
    expect(mixed.ok).toBe(true);
    expect(mixed.features).toContain("text");
  });

  it("says honestly when the source has no artboard", () => {
    const file = svgToEps(at('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="#000"/></svg>'));
    expect(file.ok).toBe(false);
    expect(file.error).toContain("viewBox");
  });

  it("writes the physical size from points, not from pixels", () => {
    const file = svgToEps({ svg: icon('<rect x="0" y="0" width="100" height="100" fill="#000"/>'), widthPt: 932.64, heightPt: 932.64 });
    expect(file.eps).toContain("932.64 932.64 scale");
    expect(file.eps).toContain("%%PageBoundingBox: 0 0 933 933");
  });
});

describe("verifyEps", () => {
  const good = () => svgToEps(at(icon('<rect x="10" y="10" width="80" height="80" fill="#000" stroke="#f00" stroke-width="2"/>')));

  it("accepts what we generated, and its ink box agrees with the SVG's own bounds", async () => {
    const svg = icon('<rect x="10" y="10" width="80" height="80" fill="#000" stroke="#f00" stroke-width="2"/>');
    const file = svgToEps(at(svg));
    const result = await verifyEps({ eps: file.eps, expectedPt: { width: 288, height: 288 } });
    expect(result.checks.header).toBe(true);
    expect(result.checks.boundingBox).toBe(true);
    expect(result.checks.complete).toBe(true);
    expect(result.checks.selfContained).toBe(true);
    expect(result.checks.renderable).toBe("unavailable");
    expect(result.ok).toBe(true);
    // The same measurement the preview and the artboard use, in points: 88 units × 2.88.
    const visible = documentBounds(svg).bounds?.visible ?? { x: 0, y: 0, w: 0, h: 0 };
    // DSC values are whole points, so the agreement is within the rounding.
    expect(Math.abs(result.ink!.w - visible.w * 2.88)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.ink!.x - visible.x * 2.88)).toBeLessThanOrEqual(1);
  });

  it("keeps the ink box inside the page for artwork that touches the edge", async () => {
    const file = svgToEps(at(icon('<rect x="0" y="0" width="100" height="100" fill="#000"/>')));
    const result = await verifyEps({ eps: file.eps, expectedPt: { width: 288, height: 288 } });
    expect(result.ink!.x).toBeGreaterThanOrEqual(0);
    expect(result.ink!.w).toBeLessThanOrEqual(288);
    expect(epsSummary(file, result)).toContain("renderer");
  });

  it("rejects a file that is not EPSF at all", async () => {
    const result = await verifyEps({ eps: '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>', expectedPt: { width: 10, height: 10 } });
    expect(result.ok).toBe(false);
    expect(result.checks.header).toBe(false);
    expect(result.checks.problems.join(" ")).toContain("EPSF header");
  });

  it("rejects a PDF or a PostScript file that was merely renamed to .eps", async () => {
    const pdf = await verifyEps({ eps: "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n", expectedPt: { width: 10, height: 10 } });
    expect(pdf.ok).toBe(false);
    const ps = await verifyEps({ eps: "%!PS-Adobe-2.0\n%%BoundingBox: 0 0 10 10\nshowpage\n%%EOF\n", expectedPt: { width: 10, height: 10 } });
    expect(ps.ok).toBe(false); // Adobe-2.0 is not EPSF — no EPS header
  });

  it("flags a bounding box that runs off its own page", async () => {
    const broken = good().eps.replace(/^%%HiResBoundingBox:.*$/m, "%%HiResBoundingBox: 10 10 400 400");
    const result = await verifyEps({ eps: broken, expectedPt: { width: 288, height: 288 } });
    expect(result.ok).toBe(false);
    expect(result.checks.problems.join(" ")).toContain("outside the page");
  });

  it("flags a preview or binary section, which real EPS consumers reject", async () => {
    const withPreview = good().eps.replace("%%EndProlog", "%%BeginPreview: 10 10 1 10\n%%EndPreview\n%%EndProlog");
    const result = await verifyEps({ eps: withPreview, expectedPt: { width: 288, height: 288 } });
    expect(result.checks.selfContained).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("reports a renderer verdict when one is available, and fails on its refusal", async () => {
    const file = good();
    const yes = await verifyEps({ eps: file.eps, expectedPt: { width: 288, height: 288 }, render: async () => true });
    expect(yes.checks.renderable).toBe("yes");
    expect(yes.ok).toBe(true);
    const no = await verifyEps({ eps: file.eps, expectedPt: { width: 288, height: 288 }, render: async () => false });
    expect(no.checks.renderable).toBe("no");
    expect(no.ok).toBe(false);
  });

  it("describes the file in one line for the record", async () => {
    const file = svgToEps(at(icon('<rect x="0" y="0" width="10" height="10" fill="#000"/>')));
    const result = await verifyEps({ eps: file.eps, expectedPt: { width: 288, height: 288 } });
    expect(epsSummary(file, result)).toContain("EPSF-3.0");
    expect(epsSummary(file, result)).toContain("no renderer available");
  });
});

describe("helpers", () => {
  it("formats colours without losing them to rounding", () => {
    expect(psColour([1, 0, 0])).toBe("1.0000 0.0000 0.0000");
    expect(colourOf("#ff0000")).toEqual([1, 0, 0]);
    expect(colourOf("#abc")).toEqual([170 / 255, 187 / 255, 204 / 255]);
    expect(colourOf("none")).toBeNull();
    expect(colourOf("url(#g)")).toBeNull();
    expect(colourOf("rgb(0 128 255)")).toEqual([0, 128 / 255, 1]);
  });

  it("does not claim a feature list when there is nothing unsupported", async () => {
    const file = svgToEps(at(icon('<rect x="0" y="0" width="10" height="10" fill="#000"/>')));
    expect(file.features).toEqual([]);
  });
});
