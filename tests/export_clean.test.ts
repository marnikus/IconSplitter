// export_clean.test.ts — "Clean the saved files" (2026-11-19). A shipped sheet
// carried the generator's own paperwork: `data-*` hooks (asset ids, cell
// indexes, a config hash, approve flags), a provenance `<metadata>` JSON block
// and float noise like `stroke-width="1.9992750000000001"`. The switch runs the
// app's own clean policy (lib/upload/clean) over the export copy, so the saved
// SVG and the EPS built from it carry the picture and the Title/description/tags
// — nothing else. Geometry, viewBox and the artboard's px survive.
import { afterEach, describe, expect, it } from "vitest";
import { cleanSheetSvg } from "../src/lib/svgBuilder/cleansheet";
import { embedMetadataInSvg, readEmbeddedMetadata } from "../src/lib/upload/embed";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { DEFAULT_FORMAT_OPTIONS } from "../src/lib/exportformats";
import { packageOf, sheetSvg, textOf } from "./helpers/sheetpackage";

afterEach(() => setTextOutliner(null));

const HOOKS = [
  "data-config-fingerprint", "data-approved-only", "data-approved=", "data-asset-id",
  "data-cell-index", "data-view-box", "data-banner", "data-export", "data-artboard",
];
const DRAWABLE = /<(path|circle|rect|line|polyline|polygon|ellipse)\b/g;
const LONG_DECIMAL = /="[^"]*-?\d+\.\d{4,}/;

const drawables = (svg: string) => (svg.match(DRAWABLE) ?? []).length;
const viewBox = (svg: string) => /\bviewBox="([^"]+)"/.exec(svg)?.[1] ?? null;

describe("cleanSheetSvg", () => {
  it("drops the generator's hooks, its provenance block and the float noise", () => {
    const composed = sheetSvg();
    const { svg } = cleanSheetSvg(composed);
    for (const hook of HOOKS) expect(svg, hook).not.toContain(hook);
    expect(svg).not.toMatch(/<metadata>\s*\{/);
    expect(svg).not.toMatch(LONG_DECIMAL);
  });

  it("declares the namespace once — repeated child xmlns declarations go", () => {
    const stitched = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><g xmlns="http://www.w3.org/2000/svg"><path xmlns="http://www.w3.org/2000/svg" d="M0 0h1"/></g></svg>';
    expect((stitched.match(/xmlns=/g) ?? []).length).toBeGreaterThan(1);
    const svg = cleanSheetSvg(stitched).svg;
    expect((svg.match(/xmlns=/g) ?? []).length).toBe(1);
    expect((sheetSvg().match(/xmlns=/g) ?? []).length).toBe(1);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("keeps the picture, the artboard's px and its Title without generator <desc>", () => {
    const composed = sheetSvg({ titleTracking: 7 });
    const { svg } = cleanSheetSvg(composed);
    expect(viewBox(svg)).toBe(viewBox(composed));
    expect(drawables(svg)).toBe(drawables(composed));
    expect(svg).toMatch(/\bwidth="1080"/);
    expect(svg).toMatch(/\bheight="660"/);
    expect(svg).toMatch(/<title>[^<]+<\/title>/);
    expect(svg).not.toMatch(/Generated with/i);
    // the pen and the tracking are content, not paperwork
    expect(svg).toMatch(/stroke-width="[\d.]+"/);
    // The tracking is content, not paperwork — written in px at the run's own
    // size since 2026-11-19, at RULE 26's one decimal.
    expect(svg).toMatch(/letter-spacing="[\d.]+"/);
    expect(svg).not.toMatch(/letter-spacing="[^"]*em"/);
  });

  it("drops a metadata blob that is not the tag list, keeps the one that is", () => {
    const withJunk = sheetSvg().replace("</svg>", '<metadata><x:xmpmeta xmlns:x="adobe:ns:meta/">farm</x:xmpmeta></metadata></svg>');
    const { svg } = cleanSheetSvg(withJunk);
    expect(svg).not.toContain("xmpmeta");
    expect(svg).not.toMatch(/<metadata>\s*\{/);
  });

  it("keeps the Dublin Core block: Title, description and the tag list read back", () => {
    const meta = { title: "Food icons", description: "Kitchen set", tags: ["food", "kitchen"], name: "food" };
    const composed = embedMetadataInSvg(sheetSvg(), meta);
    const { svg } = cleanSheetSvg(composed);
    expect(readEmbeddedMetadata(svg)).toMatchObject({ title: "Food icons", description: "Kitchen set", tags: ["food", "kitchen"] });
    for (const hook of HOOKS) expect(svg, hook).not.toContain(hook);
  });

  it("reports what it removed, and refuses a raster it cannot clean", () => {
    const { report, refused } = cleanSheetSvg(sheetSvg());
    expect(refused).toBeNull();
    expect(report.attributes).toBeGreaterThan(0);
    const raster = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="data:image/png;base64,AA"/></svg>`;
    expect(cleanSheetSvg(raster).refused).toMatch(/raster/);
  });
});

describe("the tidy pass: what a stitched sheet still shows", () => {
  const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">${body}</svg>`;

  it("drops the dead `color` an editor leaves beside an explicit stroke", () => {
    const svg = cleanSheetSvg(wrap('<g color="#ff0000"><path d="M0 0h1" stroke="#ff0000"/></g>')).svg;
    expect(svg).not.toContain('color="');
    expect(svg).toContain('stroke="#ff0000"');
    // but a real `currentColor` dependency keeps it, or the ink would change
    const live = cleanSheetSvg(wrap('<g color="#ff0000"><path d="M0 0h1" stroke="currentColor"/></g>')).svg;
    expect(live).toContain('color="#ff0000"');
  });

  it("does not repeat inherited paint, and drops values that are simply the default", () => {
    const svg = cleanSheetSvg(wrap('<g fill="none" stroke="#111111"><path d="M0 0h1" fill="none" stroke="#111111" stroke-linecap="butt"/>'
      + '<path d="M0 0h2" fill="none" stroke="#111111" stroke-linecap="round"/></g>')).svg;
    expect(svg).toContain('<path d="M0 0h1"/>');
    expect(svg).toContain('<path d="M0 0h2" stroke-linecap="round"/>');
    expect(svg).toContain('<g fill="none" stroke="#111111">'); // the group keeps its own paint
  });

  it("leaves a reference subtree alone — what `<defs>` inherits is the `<use>`'s call", () => {
    const svg = cleanSheetSvg(wrap('<g fill="none"><defs><path d="M0 0h1" fill="none"/></defs><use href="#p"/></g>')).svg;
    expect(svg).toContain('<path d="M0 0h1" fill="none"/>');
  });

  it("unwraps the bare `<g>` wrappers a cell-by-cell stitch leaves behind", () => {
    const composed = sheetSvg();
    const svg = cleanSheetSvg(composed).svg;
    expect(svg).not.toMatch(/<g>/);
    expect(svg).not.toMatch(/<g><g>/);
    expect(drawables(svg)).toBe(drawables(composed));
    expect(svg).toMatch(/<g fill="none"[^>]*stroke-width="1\.4"/);
    expect(svg).not.toMatch(/\btransform=/);
    expect(svg).toMatch(/<text[^>]*>ICON<\/text>/);
  });

  it("drops empty containers, empty embeds and indentation — bytes that draw nothing", () => {
    const svg = cleanSheetSvg(wrap('<g/>\n  <defs></defs>\n  <title>  </title><rect x="0" y="0" width="1" height="1"/>\n')).svg;
    expect(svg).not.toContain("<g/>");
    expect(svg).not.toContain("<defs");
    expect(svg).not.toContain("<title");
    expect(svg).not.toContain("\n");
    expect(svg).toContain('<rect x="0" y="0" width="1" height="1"/>');
  });

  it("writes the SVG 2 href and drops the xlink declaration it no longer needs", () => {
    const legacy = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'
      + '<defs><rect id="r" width="1" height="1"/></defs><use xlink:href="#r"/></svg>';
    const svg = cleanSheetSvg(legacy).svg;
    expect(svg).toContain('href="#a"');
    expect(svg).not.toContain("xlink");
  });

  it("rounds geometry and stroke values to at most 1 decimal place while keeping arcs and rounded rects", () => {
    const d = "M18.7 13.5V8.25a5.1 5.1 0 0 1 5.1-5.1h7.25a1.6 1.6 0 0 1 0 3.2h-7.3q-1.85 0-1.85 1.85v5.3";
    const svg = cleanSheetSvg(wrap(`<path d="${d}" stroke-width="1.9992750000000001"/><rect width="5.05" height="5" x="18.75" y="28.2" rx="1.4"/>`)).svg;
    expect(svg).toContain('d="M18.7 13.5V8.3a5.1 5.1 0 0 1 5.1 -5.1h7.3a1.6 1.6 0 0 1 0 3.2h-7.4q-1.8 0 -1.8 1.8v5.3"');
    expect(svg).toContain('rx="1.4"');
    expect(svg).toContain('width="5.1"');
    expect(svg).toContain('x="18.8"');
    expect(svg).toContain('stroke-width="2"');
  });

  it("is idempotent: cleaning a cleaned file changes nothing", () => {
    const once = cleanSheetSvg(sheetSvg()).svg;
    expect(cleanSheetSvg(once).svg).toBe(once);
  });
});

describe("the clean switch on a saved package", () => {
  it("is on by default: the saved SVG answers with no hook at all", async () => {
    expect(DEFAULT_FORMAT_OPTIONS.cleanExport).toBe(true);
    const pkg = await packageOf(sheetSvg(), {});
    const svg = textOf(pkg, ".svg") as string;
    for (const hook of HOOKS) expect(svg, hook).not.toContain(hook);
    expect(svg).not.toContain('{"v":1,');
    expect(viewBox(svg)).toBe(viewBox(sheetSvg()));
    // …and the tidy pass ran after the ink pass, so the editor's `color` quirk is gone too
    expect(svg).not.toMatch(/\scolor="/);
    expect(svg).not.toMatch(/<g>/);
  });

  it("off: skips the tidy pass while still stripping internal data-* preview hooks (RULE 26)", async () => {
    const pkg = await packageOf(sheetSvg(), { cleanExport: false });
    const raw = textOf(pkg, ".svg") as string;
    expect(raw).not.toContain("data-config-fingerprint");
    expect(raw).toMatch(/\scolor="/);
  });

  it("the EPS ships from the cleaned copy, and the artboard's tx still hold", async () => {
    setTextOutliner(() => ({ d: "M0 0 L10 0", width: 10 }));
    const pkg = await packageOf(sheetSvg({ strokeWidth: 1, ink: "#ff0000", titleTracking: 7 }), {
      includeEps: true, expandText: true,
    });
    expect(pkg.problems).toEqual([]);
    // #ff0000 reaches the EPS as real RGB through the prolog's short operator
    // (`rg` is `setrgbcolor`), so the ink the artboard sets is the ink it prints.
    expect(textOf(pkg, ".eps")).toContain("1 0 0 rg");
    const svg = textOf(pkg, ".svg") as string;
    for (const hook of HOOKS) expect(svg, hook).not.toContain(hook);
  });
});
