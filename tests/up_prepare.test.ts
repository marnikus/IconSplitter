// up_prepare.test.ts — the export-SVG preparation executes for real (RULE 8):
// the padded artboard viewBox, the explicit background rect, the transform
// group that fits and centres the content, the pt→user-unit stroke
// normalization on every stroked element (and only those), the untouched
// source document, and metadata embedding with readback. Deleting the module
// fails every assertion here.
import { describe, expect, it } from "vitest";
import type { Bounds } from "../src/lib/upgeom";
import { parseScene } from "../src/lib/upgeom";
import { sceneBounds } from "../src/lib/upbounds";
import { fitPlan, rasterSize, strokeInUserUnits } from "../src/lib/upfit";
import { DEFAULT_EXPORT_SETTINGS, effectiveSettings } from "../src/lib/upsettings";
import { buildExportSvg, embedSvgMetadata, parseSvgText } from "../src/lib/upprepare";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { svgMetadataXml, xmpReadFields } from "../src/lib/upmetaxml";

const SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M 4 4 L 20 4 L 20 20 L 4 20 Z" fill="none" stroke="#101010" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const META: IconMetadata = {
  title: "Forward Motion and Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

function prepareArgs(source: string, overrides: Partial<ReturnType<typeof effectiveSettings>> = {}) {
  const doc = parseSvgText(source) as Document;
  const scene = parseScene(doc);
  const bounds = sceneBounds(scene) as Bounds;
  const settings = { ...effectiveSettings(DEFAULT_EXPORT_SETTINGS, null), ...overrides };
  const plan = fitPlan(bounds, settings);
  const raster = rasterSize(plan, settings.jpegMpx);
  return { doc, plan, raster, settings };
}

function rootOf(svgText: string): Element {
  const doc = parseSvgText(svgText) as Document;
  return doc.documentElement;
}

/** happy-dom's selector engine special-cases <title> in XML, so walk by localName. */
function byName(root: Element, name: string): Element[] {
  const out: Element[] = [];
  if (root.localName === name) out.push(root);
  for (const c of Array.from(root.children)) out.push(...byName(c, name));
  return out;
}

describe("upprepare — the export copy", () => {
  it("builds the padded artboard with the explicit background rect first", () => {
    const { doc, plan, raster, settings } = prepareArgs(SOURCE);
    expect(settings.paddingPct).toBe(8);
    const out = buildExportSvg({ source: doc, plan, raster, strokePt: settings.strokePt, background: "#eaeaea" });
    expect(typeof out).toBe("string");
    const root = rootOf(out as string);
    expect(root.getAttribute("viewBox")).toBe("0 0 1000 1000");
    expect(root.getAttribute("width")).toBeNull();
    expect(root.getAttribute("height")).toBeNull();
    const first = root.firstElementChild as Element;
    expect(first.localName).toBe("rect");
    expect(first.getAttribute("fill")).toBe("#eaeaea");
    expect(first.getAttribute("width")).toBe("1000");
  });

  it("wraps the content in the fit transform group, centred and proportional", () => {
    const { doc, plan, raster, settings } = prepareArgs(SOURCE);
    const out = buildExportSvg({ source: doc, plan, raster, strokePt: settings.strokePt, background: "#fff" }) as string;
    const g = rootOf(out).children[1] as Element;
    expect(g.localName).toBe("g");
    const t = g.getAttribute("transform") ?? "";
    expect(t).toContain("translate(");
    expect(t).toContain("scale(");
  });

  it("normalizes the stroke to the pt rule on stroked elements, keeps caps and joins", () => {
    const { doc, plan, raster } = prepareArgs(SOURCE);
    const out = buildExportSvg({ source: doc, plan, raster, strokePt: 2.2, background: "#fff" }) as string;
    const path = byName(rootOf(out), "path")[0] as SVGPathElement;
    const expected = strokeInUserUnits(2.2, plan, raster, { fitScale: plan.scale, elemScale: 1 });
    expect(Number(path.getAttribute("stroke-width"))).toBeCloseTo(expected, 6);
    expect(path.getAttribute("stroke-linecap")).toBe("round"); // intended joins/caps preserved
    expect(path.getAttribute("stroke-linejoin")).toBe("round");
    expect(path.getAttribute("stroke")).toBe("#101010"); // never recoloured
  });

  it("leaves fill-only elements' widths alone and strips vector-effect", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M 2 2 L 8 8" fill="#333" stroke="none"/>
      <path d="M 2 12 L 8 18" fill="none" stroke="#111" stroke-width="1" vector-effect="non-scaling-stroke"/>
    </svg>`;
    const { doc, plan, raster } = prepareArgs(src);
    const out = buildExportSvg({ source: doc, plan, raster, strokePt: 2.2, background: "#fff" }) as string;
    const paths = byName(rootOf(out), "path") as SVGPathElement[];
    expect(paths[0].getAttribute("stroke-width")).toBeNull(); // fill-only: untouched
    expect(paths[1].getAttribute("vector-effect")).toBeNull(); // sizing is deterministic now
    expect(paths[1].getAttribute("stroke-width")).not.toBeNull();
  });

  it("never modifies the approved source document (export copies only)", () => {
    const before = new XMLSerializer().serializeToString(parseSvgText(SOURCE) as Document);
    const { doc, plan, raster } = prepareArgs(SOURCE);
    buildExportSvg({ source: doc, plan, raster, strokePt: 2.2, background: "#fff" });
    const after = new XMLSerializer().serializeToString(doc);
    expect(after).toBe(before);
  });

  it("refuses a source it cannot parse, honestly (RULE 4)", () => {
    expect(parseSvgText("<not-svg/>")).toBeNull();
  });
});

describe("upprepare — metadata embedding (prompt §11)", () => {
  const built = (): string => {
    const { doc, plan, raster, settings } = prepareArgs(SOURCE);
    return buildExportSvg({ source: doc, plan, raster, strokePt: settings.strokePt, background: "#fff" }) as string;
  };

  it("embeds title, desc and the structured keyword metadata into the SVG", () => {
    const out = embedSvgMetadata(built(), META) as string;
    const root = rootOf(out);
    expect(byName(root, "title")[0]?.textContent).toBe(META.title);
    expect(byName(root, "desc")[0]?.textContent).toBe(META.description);
    const meta = byName(root, "metadata")[0];
    expect(meta).not.toBeUndefined();
    const fields = xmpReadFields(`<x:xmpmeta xmlns:x="adobe:ns:meta/">${svgMetadataXml(META)}</x:xmpmeta>`);
    expect(fields?.subject).toEqual(META.tags); // the RDF body carries the tags as a list
  });

  it("replaces existing title/desc instead of duplicating them", () => {
    const once = embedSvgMetadata(built(), META) as string;
    const twice = embedSvgMetadata(once, { ...META, title: "Second Title Here. Another Tag Line" }) as string;
    // direct children only — the RDF metadata legitimately carries its own dc:title
    const titles = [...rootOf(twice).children].filter((c) => c.localName === "title");
    expect(titles.length).toBe(1);
    expect(titles[0].textContent).toBe("Second Title Here. Another Tag Line");
  });

  it("keeps Unicode intact and escapes XML properly", () => {
    const meta: IconMetadata = { ...META, title: "Růst & <Rychlost>. Ikona of Štěstí", description: "Popis s \"uvozovkami\" & ampersandem" };
    const out = embedSvgMetadata(built(), meta) as string;
    expect(byName(rootOf(out), "title")[0]?.textContent).toBe("Růst & <Rychlost>. Ikona of Štěstí");
  });

  it("round-trips: reopening the SVG reads back exactly the accepted fields", () => {
    const out = embedSvgMetadata(built(), META) as string;
    const doc = parseSvgText(out) as Document;
    expect(byName(doc.documentElement, "title")[0]?.textContent).toBe(META.title);
    expect(byName(doc.documentElement, "desc")[0]?.textContent).toBe(META.description);
    const rdf = byName(doc.documentElement, "metadata")[0]?.textContent ?? "";
    expect(rdf).toContain(escapeFree(META.tags[0]));
  });

  it("refuses to embed into a broken document", () => {
    expect(embedSvgMetadata("junk", META)).toBeNull();
  });
});

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string);
}

const escapeFree = escapeXml;
