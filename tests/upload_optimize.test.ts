// RULE 8 — the SVGO wrapper runs for real (svgo@4.1.0): the mandatory clean
// boundary strips source naming/editor noise, then preset-default compacts the
// export while preserving geometry, strokes and viewBox; records remain honest.
import { describe, expect, it } from "vitest";
import { VERSION } from "svgo";
import { optimizeSvg } from "../src/lib/upload/optimize";
import { visibleBounds } from "../src/lib/upload/geom";

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const SOURCE = `<svg ${NS} id="source-svg" version="1.0" viewBox="0 0 24 24" width="24" height="24">
  <title>Editor title</title>
  <desc>Editor description</desc>
  <metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata>
  <!-- a comment svgo may drop -->
  <rect id="filled-shape" x="2.1234567" y="2" width="20" height="20" fill="#000000" stroke="#ff0000" stroke-width="2"/>
  <circle id="line-shape" cx="12" cy="12" r="4.5678901" fill="none" stroke="#00ff00" stroke-width="1.5"/>
</svg>`;

function boundsOf(svg: string) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return visibleBounds(doc.documentElement);
}

describe("optimizeSvg — disabled still applies the mandatory clean contract", () => {
  it("normalizes version, viewBox and naming while recording compaction as disabled", async () => {
    const { svg, record } = await optimizeSvg(SOURCE, false);
    expect(svg).not.toBe(SOURCE);
    expect(record.enabled).toBe(false);
    expect(record.version).toBe(VERSION);
    expect(record.beforeBytes).toBeGreaterThan(record.afterBytes);
    expect(record.afterHash).not.toBe(record.beforeHash);
    const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    expect(root.getAttribute("version")).toBe("1.1");
    expect(root.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(root.querySelectorAll("[id]")).toHaveLength(0);
    expect(root.querySelector("title, desc, metadata")).toBeNull();
    expect(JSON.parse(record.config)).toMatchObject({ floatPrecision: 3 });
  });
});

describe("optimizeSvg — enabled preserves content", () => {
  it("keeps the viewBox, the visible geometry and the strokes", async () => {
    const { svg, record } = await optimizeSvg(SOURCE, true);
    expect(record.enabled).toBe(true);
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.documentElement.getAttribute("version")).toBe("1.1");
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(doc.querySelectorAll("[id]")).toHaveLength(0);
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

  it("removes source title, description and metadata before selected metadata is embedded", async () => {
    const { svg } = await optimizeSvg(SOURCE, true);
    expect(svg).not.toContain("Editor title");
    expect(svg).not.toContain("Editor description");
    expect(svg).not.toContain("<metadata");
  });

  it("preserves a fill-only board rect and its explicit no-stroke attribute", async () => {
    const background = `<svg ${NS} viewBox="0 0 512 512"><rect x="0" y="0" width="512" height="512" fill="#ff0000" stroke="none"/></svg>`;
    const { svg } = await optimizeSvg(background, true);
    const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    const rect = root.firstElementChild;
    expect(rect?.localName).toBe("rect");
    expect(rect?.getAttribute("fill")).toBe("red");
    expect(rect?.getAttribute("stroke")).toBe("none");
  });

  it("records version, config, sizes and content hashes", async () => {
    const { record } = await optimizeSvg(SOURCE, true);
    expect(record.version).toBe(VERSION);
    expect(record.config).toContain("preset-default");
    expect(record.config).not.toContain("removeViewBox");
    expect(record.beforeBytes).toBeGreaterThan(0);
    expect(record.afterBytes).toBeGreaterThan(0);
    expect(record.afterBytes).toBeLessThan(record.beforeBytes); // comments/whitespace gone
    expect(record.beforeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.afterHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.afterHash).not.toBe(record.beforeHash);
  });
});
