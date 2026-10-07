// up_svgo_eps.test.ts — optimization and genuine EPS execute for real
// (RULE 8): the REAL SVGO runs on the export copy (metadata, viewBox and
// strokes survive, size recorded), the verification gate catches a broken
// "optimized" output, the render-compare tolerance model behaves, and the EPS
// writer emits genuine EPSF-3.0 PostScript (header, BoundingBox, path
// operators, exact pt line widths) or names what it cannot draw. Deleting
// either module fails every assertion here.
import { describe, expect, it } from "vitest";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { embedSvgMetadata } from "../src/lib/upprepare";
import {
  SVGO_CONFIG_NAME, optimizeExportSvg, rendersMatch, verifyOptimizedSvg, type PixelDeps,
} from "../src/lib/upsvgo";

const META: IconMetadata = {
  title: "Forward Motion and Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

/** A verbose prepared-and-embedded export SVG, as the pipeline would build it. */
const BUILT = embedSvgMetadata(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">` +
  `  <!-- a comment SVGO should remove -->` +
  `  <rect x="0" y="0" width="1000" height="1000" fill="#ffffff"/>` +
  `  <g transform="translate(80 80) scale(8.4)"><path d="M 2 2 L 20 2 L 20 20 L 2 20 Z" fill="none" stroke="#101010" stroke-width="0.0898627" stroke-linecap="round" stroke-linejoin="round"/></g>` +
  `</svg>`,
  META,
) as string;

describe("upsvgo — the real optimizer on the export copy", () => {
  it("optimizes and records before/after sizes and the SVGO version", () => {
    const out = optimizeExportSvg(BUILT);
    expect(out.optimized).toBe(true);
    expect(out.reason).toBeNull();
    expect(out.version).toMatch(/\d+\.\d+/);
    expect(out.afterBytes).toBeLessThan(out.beforeBytes);
    expect(out.svg).not.toContain("<!--");
  });

  it("preserves the viewBox, the title, the desc and the keyword metadata", () => {
    const out = optimizeExportSvg(BUILT);
    expect(out.svg).toContain(`viewBox="0 0 1000 1000"`);
    expect(out.svg).toContain(`<title>${META.title}</title>`);
    expect(out.svg).toContain(`<desc>${META.description}</desc>`);
    expect(out.svg).toContain("rdf:RDF");
    expect(out.svg).toContain(META.tags[7]); // a keyword survives as RDF li text
  });

  it("never converts strokes to filled outlines and keeps stroke geometry", () => {
    const out = optimizeExportSvg(BUILT);
    expect(out.svg).toContain("stroke");
    expect(out.svg).toMatch(/<path[^>]*d=/);
    expect(out.svg).not.toMatch(/fill="#101010"/); // the stroke colour stays a stroke
  });

  it("keeps the unoptimized copy when the input or optimizer fails (RULE 9)", () => {
    const bad = optimizeExportSvg("not an svg at all");
    expect(bad.optimized).toBe(false);
    expect(bad.svg).toBe("not an svg at all");
    expect(bad.reason).not.toBeNull();
  });
});

describe("upsvgo — the verification gate (prompt §12)", () => {
  it("accepts a good optimization", () => {
    const out = optimizeExportSvg(BUILT);
    expect(verifyOptimizedSvg(BUILT, out.svg)).toEqual([]);
  });

  it("rejects an output that lost the viewBox, the metadata or the root", () => {
    expect(verifyOptimizedSvg(BUILT, `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>`).length).toBeGreaterThan(0);
    expect(verifyOptimizedSvg(BUILT, "junk").length).toBeGreaterThan(0);
    const noTitle = optimizeExportSvg(BUILT).svg.replace(/<title>.*?<\/title>/, "");
    expect(verifyOptimizedSvg(BUILT, noTitle).length).toBeGreaterThan(0);
  });

  it("names its configuration for the export record", () => {
    expect(SVGO_CONFIG_NAME).toContain("preset-default");
    expect(SVGO_CONFIG_NAME).toContain("removeDesc:false");
  });
});

describe("upsvgo — the render-compare gate (prompt §12)", () => {
  const solid: PixelDeps = { renderPixels: async () => new Uint8Array(64 * 64 * 4).fill(128) };
  const args = { width: 64, height: 64, background: "#ffffff", tolerance: 32, budget: 0.5 };

  it("matches identical renders", async () => {
    expect(await rendersMatch("<svg-a/>", "<svg-b/>", { ...args, deps: solid })).toBe(true);
  });

  it("tolerates a few antialiasing-different pixels within the budget", async () => {
    const pixels = new Uint8Array(64 * 64 * 4).fill(128);
    for (let i = 0; i < 20; i++) pixels[i] = 200; // 20 of 4096 px differ strongly
    const diff: PixelDeps = { renderPixels: async (_s, which) => (which === "b" ? pixels : new Uint8Array(64 * 64 * 4).fill(128)) };
    expect(await rendersMatch("<svg-a/>", "<svg-b/>", { ...args, deps: diff })).toBe(true);
  });

  it("refuses renders that differ beyond the budget", async () => {
    const pixels = new Uint8Array(64 * 64 * 4).fill(128);
    for (let i = 0; i < 4000; i++) pixels[i] = 250; // most pixels differ
    const diff: PixelDeps = { renderPixels: async (_s, which) => (which === "b" ? pixels : new Uint8Array(64 * 64 * 4).fill(128)) };
    expect(await rendersMatch("<svg-a/>", "<svg-b/>", { ...args, deps: diff })).toBe(false);
  });

  it("refuses a render that failed on either side (honest, RULE 4)", async () => {
    const failing: PixelDeps = { renderPixels: async () => null };
    expect(await rendersMatch("<svg-a/>", "<svg-b/>", { ...args, deps: failing })).toBe(false);
  });
});

import { buildEps, pointsPerUnit, epsPreflight, type EpsArgs } from "../src/lib/upeps";
import { parseScene } from "../src/lib/upgeom";
import { parseSvgText } from "../src/lib/upprepare";

const PREPARED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">` +
  `<rect x="0" y="0" width="1000" height="1000" fill="#f0f0f0"/>` +
  `<g transform="translate(80 80) scale(8.4)"><path d="M 2 2 L 20 2 L 20 20 L 2 20 Z" fill="none" stroke="#101010" stroke-width="0.0898627" stroke-linecap="round" stroke-linejoin="round"/></g>` +
  `</svg>`;

const RASTER = { width: 3886, height: 3886 };

function epsArgs(svg: string, strokePt = 2.2): EpsArgs {
  return { svg, raster: RASTER, strokePt, title: META.title };
}

describe("upeps — the genuine EPSF-3.0 writer", () => {
  it("emits the EPSF header with a BoundingBox at the JPEG's 96-DPI physical size", () => {
    const out = buildEps(epsArgs(PREPARED));
    expect(typeof out).toBe("string");
    const eps = out as string;
    expect(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(eps).toContain("%%BoundingBox: 0 0 2915 2915");
    expect(eps).toContain("%%HiResBoundingBox: 0 0 2914.5 2914.5");
    expect(eps.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(eps).toContain("showpage");
  });

  it("puts the page at the JPEG's 96-DPI size so setlinewidth is exactly the pt value", () => {
    expect(pointsPerUnit(RASTER, 1000)).toBeCloseTo(3886 * 0.75 / 1000, 9);
    const out = buildEps(epsArgs(PREPARED)) as string;
    expect(out).toContain("2.2 setlinewidth"); // strokePt, not an unexplained px
  });

  it("draws with real PostScript path operators and the configured colours", () => {
    const out = buildEps(epsArgs(PREPARED)) as string;
    expect(out).toContain("newpath");
    expect(out).toContain("moveto");
    expect(out).toContain("lineto");
    expect(out).toContain("closepath");
    expect(out).toContain("0.941 0.941 0.941 setrgbcolor"); // #f0f0f0 background
    expect(out).toContain("0.063 0.063 0.063 setrgbcolor"); // #101010 strokes
    expect(out).toContain("1 setlinecap");  // round cap
    expect(out).toContain("1 setlinejoin"); // round join
  });

  it("converts quadratics to cubics and honours even-odd fills and dashes", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">` +
      `<path d="M 100 100 Q 500 900 900 100 Z" fill="#333333" fill-rule="evenodd"/>` +
      `<path d="M 100 500 L 900 500" fill="none" stroke="#111" stroke-width="0.7548463" stroke-dasharray="10 6"/>` +
      `</svg>`;
    const out = buildEps(epsArgs(svg, 2.2)) as string;
    expect(out).toContain("curveto");
    expect(out).toContain("eofill");
    expect(out).toMatch(/\[29.145 17.487\] 0 setdash/); // dash scaled with the transform
  });

  it("stacks gsave/fill/grestore before stroke for filled AND stroked shapes", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="M 100 100 L 900 100 L 900 900 L 100 900 Z" fill="#666" stroke="#111" stroke-width="0.7548463"/></svg>`;
    const out = buildEps(epsArgs(svg)) as string;
    expect(out).toContain("gsave");
    expect(out).toContain("grestore");
  });
});

describe("upeps — preflight honesty (prompt §13)", () => {
  it("names every feature it cannot draw", () => {
    const doc = parseSvgText(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <defs><linearGradient id="g"/></defs>
      <text x="1" y="2">hi</text>
      <path d="M0 0L5 5" fill="url(#g)"/>
    </svg>`) as Document;
    const scene = parseScene(doc);
    const issues = epsPreflight(scene);
    expect(issues).toContain("text");
    expect(issues).toContain("gradient");
  });

  it("a clean scene preflights clean", () => {
    const scene = parseScene(parseSvgText(PREPARED) as Document);
    expect(epsPreflight(scene)).toEqual([]);
  });

  it("buildEps refuses unsupported input instead of drawing it wrong", () => {
    const bad = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="1" y="2">nope</text></svg>`;
    const out = buildEps(epsArgs(bad));
    expect(typeof out).not.toBe("string");
    expect((out as { error: string }).error).toContain("text");
  });

  it("refuses a document it cannot parse", () => {
    expect(buildEps(epsArgs("junk"))).toMatchObject({ error: expect.any(String) });
  });
});
