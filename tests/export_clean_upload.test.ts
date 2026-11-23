// export_clean_upload.test.ts — item 1 of the 2026-11-20 request: "add same
// cleaner in svg to upload as well". The builder's sheet package gained the
// clean copy (policy + tidy passes + rounding) on 2026-11-19; the upload chain
// only ever ran the stock policy in `prepare.ts`, so its saved SVG still carried
// dead `color`, bare `<g>` wrappers, whitespace, provenance `<metadata>` and
// float noise. This pins that the SAME pass (`lib/upload/svgclean`) now runs
// there — and that it cannot break the icon contract or the embedded metadata.
import { describe, expect, it } from "vitest";
import { runExport } from "../src/upload/runexport";
import { readBytesAt } from "../src/lib/fs";
import { cleanSvgText } from "../src/lib/upload/svgclean";
import { verifyExportSvg } from "../src/lib/upload/clean";
import { readEmbeddedMetadata } from "../src/lib/upload/embed";
import { DEFAULT_UPLOAD_SETTINGS, settingsFingerprint } from "../src/lib/upload/settings";
import { stockExportArgs, STOCK_TEST_META } from "./helpers/stockexport";

const wrap = (inner: string, root = 'viewBox="0 0 100 100"'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${inner}</svg>`;
const DC = 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"';
const TAGGED = `<metadata ${DC}><rdf:RDF><dc:subject><rdf:Bag><rdf:li>kept</rdf:li></rdf:Bag></dc:subject></rdf:RDF></metadata>`;

describe("cleanSvgText — the shared clean copy", () => {
  it("drops what the stock policy leaves: dead color, bare groups, provenance, float noise", () => {
    const dirty = wrap(`<g color="#ff0000"><g><path d="M1 1L2 2" stroke="#111111" stroke-width="1.9992750000000001"/></g></g>`
      + "\n  " + `<metadata>{"v":1,"tool":"x"}</metadata>`);
    const { svg, report, refused } = cleanSvgText(dirty);
    expect(refused).toBeNull();
    expect(svg).not.toMatch(/<g[\s>]/);            // both wrappers unwrapped
    expect(svg).not.toContain("color=");           // dead beside an explicit stroke
    expect(svg).not.toContain('{"v":1');           // our machine record
    expect(svg).toContain('stroke-width="2"');     // rounded to ≤ 1 decimal (trailing .0 stripped)
    expect(report.rounded).toBe(1);
  });

  it("keeps Title, description and the tags block", () => {
    const { svg } = cleanSvgText(wrap(`<title>t</title><desc>d</desc>${TAGGED}<rect width="1" height="1"/>`));
    expect(svg).toContain("<title>t</title>");
    expect(svg).toContain("<desc>d</desc>");
    expect(svg).toContain("<dc:subject>");
    expect(svg).toContain("<rdf:li>kept</rdf:li>");
  });

  it("keeps `color` while anything still reads it as currentColor", () => {
    const { svg } = cleanSvgText(wrap(`<g color="#ff0000"><path d="M0 0L1 1" stroke="currentColor"/></g>`));
    expect(svg).toContain('color="#ff0000"');
  });

  it("never hands px width/height back to the icon contract", () => {
    const sized = wrap(`<rect width="1" height="1"/>`, 'viewBox="0 0 100 100" width="24" height="24"');
    expect(cleanSvgText(sized, { keepSize: false }).svg).not.toMatch(/<svg[^>]*\swidth=/);
    expect(cleanSvgText(sized, { keepSize: true }).svg).toContain('width="24"');
  });

  it("is idempotent, and refuses what it cannot clean", () => {
    const once = cleanSvgText(wrap(`<g><path d="M0 0L1.23456789 1" stroke-width="2.987654321"/></g>`)).svg;
    expect(cleanSvgText(once).svg).toBe(once);
    expect(cleanSvgText("not an svg").refused).toMatch(/does not parse/);
    expect(cleanSvgText(wrap('<image href="a.png"/>')).refused).toMatch(/raster/);
  });
});

const SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` + "\n  "
  + `<g color="#ff0000">\n    <g><rect x="10" y="10" width="80" height="80" fill="none" stroke="#111111"/></g>\n  </g>`
  + "\n  " + `<metadata>{"v":1}</metadata>\n</svg>`;

/** The committed export SVG for the same source, built with the box on or off. */
async function committed(on: boolean): Promise<string> {
  const { args, root } = stockExportArgs(SOURCE);
  const settings = { ...args.settings, includeEps: false, includeJpeg: false, cleanExport: on };
  const result = await runExport({ ...args, settings, defaults: settings });
  expect(result.status, JSON.stringify(result.error)).toBe("processed");
  return new TextDecoder().decode(await readBytesAt(root, "export/temporary.svg") as Uint8Array);
}

describe("the upload export flow", () => {
  it("ships the clean copy when the settings box is on", async () => {
    const svg = await committed(true);
    expect(svg).not.toMatch(/<g[\s>]/);
    expect(svg).not.toContain("color=");
    expect(svg).not.toContain('{"v":1}');
    expect(verifyExportSvg(svg)).toEqual([]);
  });

  it("leaves the output alone when the box is off, and still passes the contract", async () => {
    const svg = await committed(false);
    // The stock policy already drops `data-*`/comments; what the clean copy adds
    // — and what the box therefore controls — is the dead `color` and the
    // attribute-less wrappers a generator leaves behind.
    expect(svg).toContain('color="#ff0000"');
    expect(svg).toMatch(/<g[\s>]/);
    expect(verifyExportSvg(svg)).toEqual([]);
  });

  it("embeds the Title, description and tags the same way either way", async () => {
    expect(readEmbeddedMetadata(await committed(true))).toEqual(STOCK_TEST_META);
    expect(readEmbeddedMetadata(await committed(false))).toEqual(STOCK_TEST_META);
  });

  it("moves the settings fingerprint only when the box is off", () => {
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, cleanExport: true }))
      .toBe(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS));
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, cleanExport: false }))
      .not.toBe(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS));
  });
});
