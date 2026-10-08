// RULE 8 — the SVGO wrapper runs for real (svgo@4.1.0): preset-default with
// removeMetadata/removeTitle/removeDesc/removeViewBox disabled, so the
// artwork's geometry (bounds), strokes, viewBox and its own metadata survive;
// the record captures version, config, sizes and hashes.
import { describe, expect, it } from "vitest";
import { VERSION } from "svgo";
import { optimizeSvg } from "../src/lib/upload/optimize";
import { visibleBounds } from "../src/lib/upload/geom";

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const SOURCE = `<svg ${NS} viewBox="0 0 24 24" width="24" height="24">
  <title>Artwork title</title>
  <desc>Artwork description</desc>
  <metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata>
  <!-- a comment svgo may drop -->
  <rect x="2.1234567" y="2" width="20" height="20" fill="#000000" stroke="#ff0000" stroke-width="2"/>
  <circle cx="12" cy="12" r="4.5678901" fill="none" stroke="#00ff00" stroke-width="1.5"/>
</svg>`;

function boundsOf(svg: string) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return visibleBounds(doc.documentElement);
}

describe("optimizeSvg — disabled passes through with an honest record", () => {
  it("returns the input unchanged and records enabled: false", async () => {
    const { svg, record } = await optimizeSvg(SOURCE, false);
    expect(svg).toBe(SOURCE);
    expect(record.enabled).toBe(false);
    expect(record.version).toBe(VERSION);
    expect(record.beforeBytes).toBe(record.afterBytes);
    expect(record.beforeHash).toBe(record.afterHash);
    expect(JSON.parse(record.config)).toMatchObject({ floatPrecision: 3 });
  });
});

describe("optimizeSvg — enabled preserves content", () => {
  it("keeps the viewBox, the visible geometry and the strokes", async () => {
    const { svg, record } = await optimizeSvg(SOURCE, true);
    expect(record.enabled).toBe(true);
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 24 24");
    const before = boundsOf(SOURCE);
    const after = boundsOf(svg);
    expect(before).not.toBeNull();
    expect(after?.bounds.minX).toBeCloseTo(before?.bounds.minX ?? 0, 3);
    expect(after?.bounds.minY).toBeCloseTo(before?.bounds.minY ?? 0, 3);
    expect(after?.bounds.width).toBeCloseTo(before?.bounds.width ?? 0, 3);
    expect(after?.bounds.height).toBeCloseTo(before?.bounds.height ?? 0, 3);
    expect(svg).toContain("stroke-width");
    expect(svg).toContain("stroke");
  });

  it("keeps the artwork's own title, desc and metadata (removals disabled)", async () => {
    const { svg } = await optimizeSvg(SOURCE, true);
    expect(svg).toContain("<title>Artwork title</title>");
    expect(svg).toContain("<desc>Artwork description</desc>");
    expect(svg).toContain("<metadata>");
  });

  it("records version, config, sizes and content hashes", async () => {
    const { record } = await optimizeSvg(SOURCE, true);
    expect(record.version).toBe(VERSION);
    expect(record.config).toContain("preset-default");
    expect(record.config).toContain("removeViewBox");
    expect(record.beforeBytes).toBeGreaterThan(0);
    expect(record.afterBytes).toBeGreaterThan(0);
    expect(record.afterBytes).toBeLessThan(record.beforeBytes); // comments/whitespace gone
    expect(record.beforeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.afterHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.afterHash).not.toBe(record.beforeHash);
  });
});
