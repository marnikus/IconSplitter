// @vitest-environment happy-dom
// export_clean_dom.test.ts — the clean-export rules a shipped file must satisfy
// (2026-11-19). A forensic review of a builder package named four things no
// human-made file carries: pipeline `data-*` attributes, a JSON `<metadata>`
// blob, per-child `xmlns` re-declarations and floating-point noise like
// `1.9992750000000001`. The clean pass must remove all of it, keep ONLY
// title / description / tags in the metadata, and leave the picture identical.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { cleanExportSvg } from "../src/lib/upload/svgclean";

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 53.1 53.1"><path d="M4 4h16v16H4z" fill="none"/></svg>';
const asset = { id: "pair_7db67cc0", label: "Apron", fingerprint: "f" } as never;
const config = {
  ...DEFAULT_CONFIG,
  icons: { ...DEFAULT_CONFIG.icons, strokeWidth: 1.206 },
  banner: { ...DEFAULT_CONFIG.banner, position: "top" as const, title: "Food and kitchen", subtitle: "Editable stroke width" },
};
const sheet = () => composeSheet({ config, layout: computeLayout(config), assets: [asset], placedIds: ["pair_7db67cc0"],
  svgTexts: { "pair_7db67cc0": ICON } }).svg;

const TRACES = ["data-", "aria-", "class=", "role=", "configFingerprint", "pair_7db67cc0", "approvedOnly", "IconSplitter"];

describe("cleanExportSvg — the pipeline traces a stock reviewer names", () => {
  it("leaves no data-*/aria-*/class/role, no asset id, no config hash", () => {
    const before = sheet();
    const out = cleanExportSvg(before);
    for (const trace of TRACES) expect(out.svg).not.toContain(trace);
    // and the input really had them, so the assertion is not vacuous
    expect(before).toContain("data-asset-id");
  });

  it("declares the SVG namespace ONCE, on the root (no DOM-stitch repeats)", () => {
    const out = cleanExportSvg(sheet()).svg;
    expect(out.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g)?.length).toBe(1);
    expect(out.startsWith("<svg ")).toBe(true);
  });

  it("keeps only title, description and tags in the metadata, in Dublin Core", () => {
    const out = cleanExportSvg(sheet(), { title: "Food and kitchen icons", description: "Line icons of kitchen tools", tags: ["kitchen", "cook"] }).svg;
    expect(out).toContain("<metadata");
    expect(out).toContain("dc:title");
    expect(out).toContain("dc:description");
    expect(out).toContain("dc:subject");
    expect(out).toContain("<rdf:li>kitchen</rdf:li>");
    expect(out).not.toContain("configFingerprint");
    expect(out).not.toContain("sources");
    // Nothing else rides along: no vocabulary of ours, no machine record.
    // A USER's own `dc:creator`/`dc:rights` are kept when they supplied them
    // (RULE 26 forbids the tool's attribution, not the author's).
    expect(out).not.toContain("configFingerprint");
  });

  it("writes every number with at most three decimals, geometry kept", () => {
    const before = sheet();
    const out = cleanExportSvg(before).svg;
    const long = [...out.matchAll(/"(-?\d+\.\d{4,})"/g)].map((m) => m[1]);
    expect(long).toEqual([]);
    // the picture is the same picture: same box, same shape count, same kinds
    expect(/viewBox="([^"]+)"/.exec(out)?.[1]).toBe(/viewBox="([^"]+)"/.exec(before)?.[1]);
    for (const tag of ["path", "rect", "circle", "text"]) {
      expect(out.match(new RegExp(`<${tag}\\b`, "g"))?.length ?? 0).toBe(before.match(new RegExp(`<${tag}\\b`, "g"))?.length ?? 0);
    }
  });

  it("gives the root SVG 1.1 and no fixed pixel size", () => {
    const out = cleanExportSvg(sheet()).svg;
    const root = /^<svg[^>]*>/.exec(out)?.[0] ?? "";
    expect(root).toContain('version="1.1"');
    expect(root).toContain("viewBox=");
    expect(root).not.toContain('width="1080"');
    expect(root).not.toContain('height="660"');
  });

  it("is idempotent: cleaning a clean file changes nothing", () => {
    const once = cleanExportSvg(sheet(), { title: "T", description: "D", tags: ["a"] }).svg;
    const twice = cleanExportSvg(once, { title: "T", description: "D", tags: ["a"] }).svg;
    expect(twice).toBe(once);
  });

  it("reports what it removed, so export.json can say it", () => {
    const result = cleanExportSvg(sheet());
    if (!result.ok) throw new Error(result.reason);
    expect(result.removed.length).toBeGreaterThan(0);
    expect(result.removed.join(" ")).toMatch(/data-/);
  });

  it("refuses (never guesses) when the document is not an SVG", () => {
    const result = cleanExportSvg("not < svg");
    if (result.ok) throw new Error("a non-SVG document must be refused");
    expect(result.reason).toContain("not");
  });
});
