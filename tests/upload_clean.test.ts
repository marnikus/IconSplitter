// RULE 8 — the "clean export SVG" policy runs for real (2026-10-08): the file
// that ships is SVG 1.1 with a viewBox, no raster elements anywhere, no ids or
// naming of any kind, and no editor bloat — and when a document does not
// satisfy that, `enforceExportSvg` REBUILDS it and says so instead of shipping
// a violating file.
import { describe, expect, it } from "vitest";
import { enforceExportSvg, verifyExportSvg } from "../src/lib/upload/clean";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { optimizeSvg } from "../src/lib/upload/optimize";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";

const NS = `xmlns="http://www.w3.org/2000/svg"`;

/** The realistic end of the pipeline: prepare → optimize, as the export runs it. */
async function exported(source: string): Promise<string> {
  const prepared = prepareExportSvg(source, { ...DEFAULT_UPLOAD_SETTINGS, strokePx: 2.2 });
  if (!prepared.ok) throw new Error(`prepare failed: ${prepared.code} ${prepared.detail}`);
  const optimized = await optimizeSvg(prepared.svg, true);
  // the pipeline's own order, clean pass included — SVGO drops `version`
  const clean = enforceExportSvg(optimized.svg);
  if (clean.violations.length > 0) throw new Error(`not clean: ${clean.violations.join("; ")}`);
  return clean.svg;
}

const CLEAN_SOURCE = `<svg ${NS} viewBox="0 0 24 24" width="24" height="24"><path d="M4 4h16v16H4z" fill="none" stroke="#000"/></svg>`;

describe("verifyExportSvg — the shipped file's rules", () => {
  it("accepts what the pipeline really produces", async () => {
    expect(verifyExportSvg(await exported(CLEAN_SOURCE))).toEqual([]);
  });

  it("names every violation: version, viewBox, raster, style, comments", () => {
    expect(verifyExportSvg(`<svg ${NS} viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>`))
      .toContainEqual(expect.stringContaining("version 1.1"));
    expect(verifyExportSvg(`<svg ${NS} version="1.1"><path d="M0 0h1v1z"/></svg>`))
      .toContainEqual(expect.stringContaining("viewBox"));
    expect(verifyExportSvg(`<svg ${NS} version="1.1" viewBox="0 0 1 1"><image href="a.png" width="1" height="1"/></svg>`))
      .toContainEqual(expect.stringContaining("raster"));
    expect(verifyExportSvg(`<svg ${NS} version="1.1" viewBox="0 0 1 1"><style>.a{fill:#000}</style><path class="a" d="M0 0h1v1z"/></svg>`))
      .toContainEqual(expect.stringContaining("<style>"));
    expect(verifyExportSvg(`<svg ${NS} version="1.1" viewBox="0 0 1 1"><!-- made by a tool --><path d="M0 0h1v1z"/></svg>`))
      .toContainEqual(expect.stringContaining("comment"));
  });

  it("names naming: ids, classes, data-* and aria-*", () => {
    const withNames = `<svg ${NS} version="1.1" viewBox="0 0 1 1" data-name="Layer 1" aria-hidden="true">`
      + `<g id="Artboard" class="layer"><path id="p1" data-name="line" d="M0 0h1v1z"/></g></svg>`;
    const violations = verifyExportSvg(withNames);
    expect(violations).toContainEqual(expect.stringContaining(`id "Artboard"`));
    expect(violations).toContainEqual(expect.stringContaining(`id "p1"`));
    expect(violations).toContainEqual(expect.stringContaining("class"));
    expect(violations).toContainEqual(expect.stringContaining("data-name"));
    expect(violations).toContainEqual(expect.stringContaining("aria-hidden"));
  });

  it("names editor bloat: foreign namespaces, a raster inside <defs>, nested titles", () => {
    const bloat = `<svg ${NS} xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/" version="1.1" viewBox="0 0 1 1">`
      + `<defs><image href="data:image/png;base64,AAAA" width="1" height="1"/></defs>`
      + `<g><title>My layer</title><path d="M0 0h1v1z"/></g>`
      + `<i:pgf/></svg>`;
    const violations = verifyExportSvg(bloat);
    expect(violations).toContainEqual(expect.stringContaining("raster"));
    expect(violations).toContainEqual(expect.stringContaining("i:pgf"));
    // The declaration itself is judged by use: once <i:pgf/> is gone it is unused — and named with its URI.
    expect(verifyExportSvg(bloat.replace("<i:pgf/>", ""))).toContainEqual(expect.stringContaining("AdobeIllustrator"));
    expect(violations).toContainEqual(expect.stringContaining("<title>"));
  });
});

describe("enforceExportSvg — check, then rebuild instead of shipping a violation", () => {
  it("rebuilds a document that carries naming and no version, and then verifies", () => {
    const dirty = `<svg ${NS} viewBox="0 0 1 1" data-name="Layer 1">`
      + `<!-- gen --><g id="Artboard" class="layer"><path id="p1" d="M0 0h1v1z"/></g></svg>`;
    const report = enforceExportSvg(dirty);
    expect(report.rebuilt).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.svg).toContain(`version="1.1"`);
    expect(report.svg).not.toContain("p1");
    expect(report.svg).not.toContain("class");
    expect(report.svg).not.toContain("gen");
    const doc = new DOMParser().parseFromString(report.svg, "image/svg+xml");
    expect(doc.querySelector("g")?.getAttribute("id")).toBeNull();
    expect(doc.querySelector("path")?.getAttribute("d")).toBe("M0 0h1v1z");
  });

  it("is a no-op on an already-clean file, and keeps a referenced id as a short name", () => {
    const clean = `<svg ${NS} version="1.1" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>`;
    const same = enforceExportSvg(clean);
    expect(same.rebuilt).toBe(false);
    expect(same.violations).toEqual([]);
    expect(same.svg).toBe(clean);

    const gradient = `<svg ${NS} viewBox="0 0 1 1"><defs><linearGradient id="Grad"><stop offset="0" stop-color="#fff"/></linearGradient></defs>`
      + `<path fill="url(#Grad)" d="M0 0h1v1z"/></svg>`;
    const report = enforceExportSvg(gradient);
    expect(report.violations).toEqual([]);
    expect(report.svg).not.toContain(`id="Grad"`);
    expect(report.svg).not.toContain("url(#Grad)");
    const doc = new DOMParser().parseFromString(report.svg, "image/svg+xml");
    const id = doc.querySelector("linearGradient")?.getAttribute("id");
    expect(id).toBe("a");
    expect(doc.querySelector("path")?.getAttribute("fill")).toBe("url(#a)");
  });

  it("returns the violation when even a rebuild cannot fix it (an embedded raster)", () => {
    const raster = `<svg ${NS} viewBox="0 0 1 1"><image href="data:image/png;base64,AAAA" width="1" height="1"/></svg>`;
    const report = enforceExportSvg(raster);
    expect(report.rebuilt).toBe(true);
    expect(report.violations).toContainEqual(expect.stringContaining("raster"));
  });
});

describe("prepareExportSvg — the export copy the user inspects", () => {
  it("declares SVG 1.1 and a numeric viewBox on the root", () => {
    const result = prepareExportSvg(CLEAN_SOURCE, DEFAULT_UPLOAD_SETTINGS);
    if (!result.ok) throw new Error(result.detail);
    const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
    expect(root.getAttribute("version")).toBe("1.1");
    expect(root.getAttribute("viewBox")).toBe("0 0 20.2 20.2");
  });

  it("paints the background with fill ONLY — an inherited stroke never reaches it", () => {
    // the field bug: the background rect inherited the artwork's stroke and
    // painted a border around the artboard
    const stroked = `<svg ${NS} viewBox="0 0 24 24" stroke="#000" stroke-width="2" fill="none">`
      + `<path d="M4 4h16v16H4z"/></svg>`;
    const result = prepareExportSvg(stroked, { ...DEFAULT_UPLOAD_SETTINGS, background: "#ffffff" });
    if (!result.ok) throw new Error(result.detail);
    const bg = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement.querySelector("rect");
    expect(bg?.getAttribute("fill")).toBe("#ffffff");
    expect(bg?.getAttribute("stroke")).toBe("none");
  });

  it("refuses an embedded raster anywhere, including inside <defs>", () => {
    const withDefs = `<svg ${NS} viewBox="0 0 24 24"><defs><image href="data:image/png;base64,AAAA" width="4" height="4"/></defs>`
      + `<rect x="2" y="2" width="20" height="20" fill="#000"/></svg>`;
    const result = prepareExportSvg(withDefs, DEFAULT_UPLOAD_SETTINGS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unsupported");
    expect(result.detail).toContain("raster");
  });

  it("folds a plain paint-only stylesheet in, so no class survives; a risky one is refused", () => {
    const styled = `<svg ${NS} viewBox="0 0 24 24"><style>.cls-1{fill:#000000}</style>`
      + `<rect class="cls-1" x="2" y="2" width="20" height="20"/></svg>`;
    const result = prepareExportSvg(styled, DEFAULT_UPLOAD_SETTINGS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("<style");
    expect(result.svg).not.toContain("class");
    expect(result.svg).toContain(`fill="#000000"`);

    const risky = `<svg ${NS} viewBox="0 0 24 24"><style>.a{clip-path:url(#x)}</style>`
      + `<rect class="a" x="2" y="2" width="20" height="20"/></svg>`;
    const refused = prepareExportSvg(risky, DEFAULT_UPLOAD_SETTINGS);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.code).toBe("unsupported");
      expect(refused.detail).toContain("style");
    }
  });

  it("keeps no naming from the source — no ids, classes, data-* or nested titles", () => {
    const named = `<svg ${NS} viewBox="0 0 24 24" data-name="Layer 1">`
      + `<g id="Artboard" class="layer" sketch:type="MSArtboardGroup"><path id="p1" data-name="line" d="M4 4h16v16H4z"/></g>`
      + `<title>My Rectangle</title><desc>a rectangle</desc></svg>`;
    const result = prepareExportSvg(named, DEFAULT_UPLOAD_SETTINGS);
    if (!result.ok) throw new Error(result.detail);
    for (const forbidden of ["data-name", "class=", "id=", "<title", "<desc", "sketch:"]) {
      expect(result.svg).not.toContain(forbidden);
    }
    expect(result.svg).toContain("<path");
  });
});
