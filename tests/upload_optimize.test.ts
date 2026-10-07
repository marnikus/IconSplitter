// RULE 8 — the SVGO wrapper runs for real (svgo@4.1.0): preset-default (editor
// bloat removed by default) + data-* stripping + SVG version 1.1. The
// artwork's geometry, strokes, viewBox, title and desc survive; editor
// metadata, comments, namespaces, layer names and unused IDs do not. Raster
// content (<image>) is rejected, never shipped.
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

function rootOf(svg: string): Element {
  return new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
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
    expect(rootOf(svg).getAttribute("viewBox")).toBe("0 0 24 24");
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

  it("keeps the artwork's own title and desc (accessibility, not bloat)", async () => {
    const { svg } = await optimizeSvg(SOURCE, true);
    expect(svg).toContain("<title>Artwork title</title>");
    expect(svg).toContain("<desc>Artwork description</desc>");
  });

  it("records version, config, sizes and content hashes", async () => {
    const { record } = await optimizeSvg(SOURCE, true);
    expect(record.version).toBe(VERSION);
    expect(record.config).toContain("preset-default");
    expect(record.beforeBytes).toBeGreaterThan(0);
    expect(record.afterBytes).toBeGreaterThan(0);
    expect(record.afterBytes).toBeLessThan(record.beforeBytes); // comments/whitespace gone
    expect(record.beforeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.afterHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.afterHash).not.toBe(record.beforeHash);
  });
});

describe("optimizeSvg — version 1.1", () => {
  it("writes version 1.1 onto the root", async () => {
    const { svg } = await optimizeSvg(SOURCE, true);
    expect(rootOf(svg).getAttribute("version")).toBe("1.1");
    expect(rootOf(svg).getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
  });

  it("downgrades a version 2.0 document to 1.1", async () => {
    const src = `<svg ${NS} version="2.0" viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#000"/></svg>`;
    const { svg } = await optimizeSvg(src, true);
    expect(rootOf(svg).getAttribute("version")).toBe("1.1");
  });
});

describe("optimizeSvg — no editor bloat", () => {
  it("removes editor metadata, comments and editor namespaces", async () => {
    const src = `<svg ${NS} xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/" viewBox="0 0 24 24"><metadata>Illustrator bloat</metadata><!-- Created with Sketch --><desc>Created with Sketch.</desc><rect x="1" y="1" width="10" height="10" fill="#000"/></svg>`;
    const { svg } = await optimizeSvg(src, true);
    expect(svg).not.toContain("<metadata>");
    expect(svg).not.toContain("Illustrator bloat");
    expect(svg).not.toContain("<!--");
    expect(svg).not.toContain("xmlns:i");
    expect(svg).not.toContain("Created with Sketch");
  });

  it("removes layer names (data-*) and unused IDs, minifying the IDs that stay", async () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><defs><linearGradient id="MyPrettyGradient"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><g id="Layer_1" data-name="My Layer"><rect id="myRect" data-foo="bar" x="1" y="1" width="10" height="10" fill="url(#MyPrettyGradient)"/></g></svg>`;
    const { svg } = await optimizeSvg(src, true);
    expect(svg).not.toContain("Layer_1");
    expect(svg).not.toContain("myRect");
    expect(svg).not.toContain("MyPrettyGradient");
    expect(svg).not.toContain("data-name");
    expect(svg).not.toContain("data-foo");
    expect(svg).not.toContain("My Layer");
    // the gradient still works, under a minified id
    expect(svg).toMatch(/url\(#a\)/);
    expect(svg).toContain('id="a"');
  });
});

describe("optimizeSvg — no raster elements", () => {
  it("rejects an <image> element instead of shipping it", async () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><image href="data:image/png;base64,xxx" x="1" y="1" width="10" height="10"/><rect x="1" y="1" width="4" height="4" fill="#000"/></svg>`;
    await expect(optimizeSvg(src, true)).rejects.toThrow(/image/i);
  });
});
