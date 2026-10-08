// RULE 8 — the SVG metadata embed runs for real: <title>/<desc>/<metadata>
// (Dublin Core RDF) land as the first root children, idempotently, XML-escaped,
// and read back exactly. The artwork is untouched.
import { describe, expect, it } from "vitest";
import { embedMetadataInSvg, readEmbeddedMetadata } from "../src/lib/upload/embed";
import { verifyExportSvg } from "../src/lib/upload/clean";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upload/meta";

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const TAGS = [...MANDATORY_TAGS, "speed", "growth", "chart", "arrow", "up", "business", "finance",
  "analytics", "data", "trend", "increase", "graph", "statistics", "report", "dashboard", "money",
  "coin", "dollar", "euro", "yen", "currency", "cash", "payment", "wallet", "bank", "investment",
  "profit", "success", "target", "goal", "idea", "creative", "design"];

const META: IconMetadata = {
  title: "Minimal line icon of growth. Speed and growth pictogram",
  description: "Clean line icon showing growth and rising business trends",
  tags: TAGS,
};

const SOURCE = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="#000"/></svg>`;

describe("embedMetadataInSvg", () => {
  it("inserts title, desc and metadata as the first root children, in order", () => {
    const doc = new DOMParser().parseFromString(embedMetadataInSvg(SOURCE, META), "image/svg+xml");
    const root = doc.documentElement;
    expect(root.children[0].nodeName.toLowerCase()).toBe("title");
    expect(root.children[1].nodeName.toLowerCase()).toBe("desc");
    expect(root.children[2].nodeName.toLowerCase()).toBe("metadata");
    expect(root.children[0].textContent).toBe(META.title);
    expect(root.children[1].textContent).toBe(META.description);
  });

  it("declares metadata namespaces once on the SVG root, with no fixed root dimensions", () => {
    const clean = `<svg ${NS} version="1.1" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20"/></svg>`;
    const svg = embedMetadataInSvg(clean, META);
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    expect(root.getAttribute("xmlns:dc")).toBe("http://purl.org/dc/elements/1.1/");
    expect(root.getAttribute("xmlns:rdf")).toBe("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
    expect(root.hasAttribute("width")).toBe(false);
    expect(root.hasAttribute("height")).toBe(false);
    for (const el of Array.from(doc.querySelectorAll("*"))) {
      if (el === root) continue;
      expect(el.hasAttribute("xmlns:dc")).toBe(false);
      expect(el.hasAttribute("xmlns:rdf")).toBe(false);
    }
    expect(verifyExportSvg(svg)).toEqual([]);
  });

  it("carries all 40 tags in the dc:subject rdf:Bag", () => {
    const doc = new DOMParser().parseFromString(embedMetadataInSvg(SOURCE, META), "image/svg+xml");
    const lis = Array.from(doc.getElementsByTagName("*")).filter((el) => el.nodeName.endsWith(":li"));
    expect(lis).toHaveLength(40);
    expect(lis[0].textContent).toBe("icon");
  });

  it("leaves the artwork untouched", () => {
    const doc = new DOMParser().parseFromString(embedMetadataInSvg(SOURCE, META), "image/svg+xml");
    const rect = doc.querySelector("rect");
    expect(rect?.getAttribute("x")).toBe("2");
    expect(rect?.getAttribute("fill")).toBe("#000");
  });

  it("is idempotent: re-embedding replaces, never duplicates", () => {
    const once = embedMetadataInSvg(SOURCE, META);
    const twice = embedMetadataInSvg(once, META);
    expect(twice).toBe(once);
    const doc = new DOMParser().parseFromString(twice, "image/svg+xml");
    expect(doc.querySelectorAll("title")).toHaveLength(1);
    expect(doc.querySelectorAll("metadata")).toHaveLength(1);
  });

  it("embeds a canonical title without a terminal period", () => {
    const embedded = embedMetadataInSvg(SOURCE, { ...META, title: "Minimal line icon of growth. Speed growth pictogram.  " });
    expect(readEmbeddedMetadata(embedded)?.title).toBe("Minimal line icon of growth. Speed growth pictogram");
    expect(embedded).not.toContain("pictogram.");
  });

  it("replaces a pre-existing root-level title/desc/metadata", () => {
    const withOld = `<svg ${NS} viewBox="0 0 24 24"><title>old</title><rect x="1" y="1" width="4" height="4"/></svg>`;
    const doc = new DOMParser().parseFromString(embedMetadataInSvg(withOld, META), "image/svg+xml");
    const titles = Array.from(doc.querySelectorAll("title"));
    expect(titles).toHaveLength(1);
    expect(titles[0].textContent).toBe(META.title);
  });

  it("XML-escapes special characters and round-trips them", () => {
    const tricky: IconMetadata = {
      title: "Fish & Chips <Icon> \"quoted\". Speed growth pictogram",
      description: "A <b>bold</b> & \"quoted\" description here ok",
      tags: TAGS,
    };
    const read = readEmbeddedMetadata(embedMetadataInSvg(SOURCE, tricky));
    expect(read).toEqual(tricky);
  });

  it("throws on a non-SVG document", () => {
    expect(() => embedMetadataInSvg("<html/>", META)).toThrow();
  });
});

describe("readEmbeddedMetadata", () => {
  it("reads back exactly what was embedded", () => {
    expect(readEmbeddedMetadata(embedMetadataInSvg(SOURCE, META))).toEqual(META);
  });

  it("returns null when a field is missing", () => {
    expect(readEmbeddedMetadata(SOURCE)).toBeNull();
    const noTags = `<svg ${NS}><title>t</title><desc>d</desc><metadata/></svg>`;
    expect(readEmbeddedMetadata(noTags)).toBeNull();
  });
});
