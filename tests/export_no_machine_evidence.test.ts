import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import type { BuilderIconAsset, SheetConfig, SheetMetadata } from "../src/lib/svgBuilder/types";
import { DEFAULT_FORMAT_OPTIONS, type ExportFormatOptions } from "../src/lib/exportformats";
import { copySheetSvg, downloadSheetSvg } from "../src/svgBuilder/exporter";
import { rescaleSvg } from "../src/lib/upload/rescale";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { cleanSvgText } from "../src/lib/upload/svgclean";
import { readXmpMetadataFromEps } from "../src/lib/upload/epsmetadata";
import { readXmpMetadata } from "../src/lib/upload/jpeg";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upload/meta";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { serializePairMeta } from "../src/lib/pairmeta";
import { runExport } from "../src/upload/runexport";
import { FakeDir, type FakeFile } from "./helpers/fakefs";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { minimalJpeg } from "./helpers/minijpeg";
import { pairFile } from "./helpers/pairfile";
import { buildSheetPackage } from "../src/svgBuilder/sheetpackage";
import { builtinConverter } from "../src/lib/upload/epsconv/builtin";
import { svgVersion } from "./helpers/svgpair";

const FORBIDDEN_ATTRIBUTION = [
  /IconSplitter/i,
  /Generated with/i,
  /SVG builder/i,
  /Editable stroke-only icon sheet/i,
  /— icon sheet/,
  /approvedOnly/,
  /configHash/,
  /xmptk/i,
  /%%Creator\b/i,
  /%%CreationDate\b/i,
  /data-[a-z-]+=/i,
  /<!--/,
];

const GEOM_ATTRS = new Set([
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "d", "points", "viewBox",
  "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
  "font-size",
]);

function assertNoAttribution(text: string): void {
  for (const re of FORBIDDEN_ATTRIBUTION) {
    expect(text).not.toMatch(re);
  }
}

function assertDirectOneDecimalSvg(svg: string): void {
  assertNoAttribution(svg);
  expect(svg).not.toMatch(/\btransform\s*=/);
  expect(svg).not.toMatch(/\bscale\s*\(/);
  expect(svg).not.toMatch(/\bmatrix\s*\(/);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  for (const el of [doc.documentElement, ...Array.from(doc.documentElement.querySelectorAll("*"))]) {
    for (const a of Array.from(el.attributes)) {
      if (!GEOM_ATTRS.has(a.name)) continue;
      const multiDec = a.value.match(/\d+\.\d{2,}/g);
      expect(multiDec, `${el.tagName}[${a.name}]="${a.value}" has >1 decimal`).toBeNull();
      const trailingZero = a.value.match(/\b\d+\.0(?!\d)/g);
      expect(trailingZero, `${el.tagName}[${a.name}]="${a.value}" has trailing .0`).toBeNull();
    }
  }
}

const COMPACT_ARC_ICON = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M3.25 12h4.333l2.125-4.75 3.667 9.5 2.125-4.75H20.75"/>',
  '<path d="M6.9 6.9a5.1 5.1 0 015.1-5.1 5.1 5.1 0 015.1 5.1"/>',
  '<circle cx="12" cy="12" r="9.25"/>',
  "</svg>",
].join("");

const TRANSFORMED_SOURCE_ICON = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#111" stroke-width="2">',
  '<g transform="translate(2 2) scale(0.875)">',
  '<rect x="3" y="5" width="26" height="20" rx="3.25"/>',
  '<line x1="3" y1="11" x2="29" y2="11"/>',
  "</g>",
  "</svg>",
].join("");

const ASSETS: BuilderIconAsset[] = [
  {
    id: "a1", base: "compass", suffix: "", label: "Compass", category: "Navigation",
    tags: ["navigation", "compass"], svgPath: "icons/compass.svg", svgName: "compass.svg",
    version: 1, fingerprint: "fp-a1", metaPath: "icons/compass.svg.json", approved: true,
  },
  {
    id: "a2", base: "calendar", suffix: "", label: "Calendar", category: "Navigation",
    tags: ["navigation", "calendar"], svgPath: "icons/calendar.svg", svgName: "calendar.svg",
    version: 1, fingerprint: "fp-a2", metaPath: "icons/calendar.svg.json", approved: true,
  },
];

const SVG_TEXTS: Record<string, string> = {
  a1: COMPACT_ARC_ICON,
  a2: TRANSFORMED_SOURCE_ICON,
};

function makeSheetConfig(dx = 14.37, dy = -6.84): SheetConfig {
  return {
    ...DEFAULT_CONFIG,
    grid: { ...DEFAULT_CONFIG.grid, columns: 2, rows: 1 },
    icons: { ...DEFAULT_CONFIG.icons, strokeWidth: 1.8 },
    banner: {
      ...DEFAULT_CONFIG.banner,
      title: "Travel Icons",
      hero: true,
      heroIconId: "a1",
      heroStroke: 1.6,
      titleDx: dx,
      titleDy: dy,
    },
  };
}

function sheetMetadata(): SheetMetadata {
  return {
    title: "Travel Icon Collection for Maps",
    description: "Clean vector line icons for travel and map interfaces",
    tags: [
      ...MANDATORY_TAGS,
      "travel", "compass", "calendar", "navigation", "map", "direction", "route",
      "explore", "journey", "adventure", "gps", "waypoint", "pointer", "atlas",
      "orientation", "outdoor", "hiking", "marine", "needle", "cardinal", "schedule",
      "date", "trip", "itinerary", "booking", "minimal", "clean", "interface", "ui", "set",
    ],
    state: "accepted",
    validation: { ok: true, errors: [], warnings: [] },
    fingerprint: "meta-sheet-1",
  };
}

function sheetFmt(overrides: Partial<ExportFormatOptions> = {}): ExportFormatOptions {
  return {
    ...DEFAULT_FORMAT_OPTIONS,
    includeSvg: true,
    includeJpeg: true,
    includeEps: true,
    expandText: true,
    ...overrides,
  };
}

const UPLOAD_META: IconMetadata = {
  title: "Compass Navigation Line Icon for Maps",
  description: "Clean minimal compass line icon showing cardinal direction for travel maps",
  tags: [
    ...MANDATORY_TAGS,
    "compass", "navigation", "map", "direction", "travel", "north", "guide", "location",
    "route", "bearing", "explore", "journey", "adventure", "gps", "waypoint", "pointer",
    "cartography", "atlas", "orientation", "outdoor", "hiking", "marine", "needle",
    "cardinal", "east", "west", "south", "symbol", "ui", "interface", "minimal", "clean", "sign",
  ],
};

describe("RULE 26 — zero machine/tool evidence & direct 1-decimal geometry", () => {
  it("composes sheets directly in real artboard px with direct stroke-width and zero generator provenance", () => {
    const config = makeSheetConfig();
    const layout = computeLayout(config);
    const doc = composeSheet({
      config,
      layout,
      assets: ASSETS,
      placedIds: ["a1", "a2"],
      svgTexts: SVG_TEXTS,
    });

    expect(doc.svg).not.toMatch(/Generated with/i);
    expect(doc.svg).not.toMatch(/— icon sheet/);
    expect(doc.svg).not.toMatch(/approvedOnly/);
    expect(doc.svg).not.toMatch(/\bscale\s*\(/);
    expect(doc.svg).toContain('stroke-width="1.8"');
    expect(doc.svg).toContain('stroke-width="1.6"');
  });

  it("cleans Editable SVG download and Copy SVG markup to direct 1-decimal geometry with zero data-* or transforms", async () => {
    const config = makeSheetConfig(12.44, 8.19);
    const layout = computeLayout(config);
    const doc = composeSheet({
      config,
      layout,
      assets: ASSETS,
      placedIds: ["a1", "a2"],
      svgTexts: SVG_TEXTS,
      metadata: sheetMetadata(),
    });

    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async (t: string) => { copied = t; }) },
    });
    await copySheetSvg(doc);
    assertDirectOneDecimalSvg(copied);
    expect(copied).not.toContain("currentColor");
    expect(copied).toContain("Travel Icon Collection for Maps");

    let downloadedBlob: Blob | null = null;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((b: Blob) => { downloadedBlob = b; return "blob:test"; });
    URL.revokeObjectURL = vi.fn();
    try {
      downloadSheetSvg(doc, "Travel Icon Collection for Maps");
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
    expect(downloadedBlob).not.toBeNull();
    const downloadedText = await downloadedBlob!.text();
    assertDirectOneDecimalSvg(downloadedText);
    expect(downloadedText).toBe(copied);
  });

  it("builds SVG Builder stock packages (SVG, JPEG, EPS) with zero tool attribution and direct 1-decimal geometry", async () => {
    const config = makeSheetConfig(10.25, -4.75);
    const layout = computeLayout(config);
    const doc = composeSheet({
      config,
      layout,
      assets: ASSETS,
      placedIds: ["a1", "a2"],
      svgTexts: SVG_TEXTS,
      metadata: sheetMetadata(),
    });

    setTextOutliner(() => ({ d: "M0 0h40v-10H0Z", width: 40 }));
    try {
      for (const cleanExport of [true, false]) {
        let renderedSvgForPng = "";
        const pkg = await buildSheetPackage({
          svg: doc.svg,
          metadata: sheetMetadata(),
          folder: "_artboard_sheets/x/travel",
          stem: "travel",
          pairId: "s1",
          now: "2026-11-19T00:00:00.000Z",
          prompt: "",
          model: "",
          settings: { ...DEFAULT_UPLOAD_SETTINGS, ...sheetFmt({ cleanExport }) },
        }, {
          pngBlob: async (s) => { renderedSvgForPng = s; return new Blob([new Uint8Array([1])]); },
          eps: (input) => builtinConverter.convert(input, { bridgeUrl: "", fetch: async () => new Response("") }),
        });
        expect(pkg.problems).toEqual([]);
        const svgFile = pkg.files.find((f) => f.name.endsWith(".svg"))!;
        const pngFile = pkg.files.find((f) => f.name.endsWith(".png"))!;
        const epsFile = pkg.files.find((f) => f.name.endsWith(".eps"))!;
        expect(pngFile.bytes.length).toBeGreaterThan(0);
        assertNoAttribution(renderedSvgForPng);
        const svgText = new TextDecoder().decode(svgFile.bytes);
        const epsText = new TextDecoder().decode(epsFile.bytes);
        assertNoAttribution(svgText);
        if (cleanExport) {
          assertDirectOneDecimalSvg(svgText);
        }

        assertNoAttribution(epsText);
        expect(readXmpMetadataFromEps(epsText)?.title).toBe("Travel Icon Collection for Maps");
      }
    } finally {
      setTextOutliner(null);
    }
  });

  it("exports SVG to upload packages (SVG, JPEG, EPS) with direct 1-decimal geometry and zero tool attribution", async () => {
    const dir = "batch_01/compass_AI/split_01";
    const root = new BinDir("root");
    let node: FakeDir = root;
    for (const part of dir.split("/")) {
      const next = new BinDir(part);
      node.children.set(part, next);
      node = next;
    }
    node.children.set("compass_AI.png", new BinFile("compass_AI.png", "ai", 1000));
    node.children.set("compass_AI.svg", new BinFile("compass_AI.svg", COMPACT_ARC_ICON, 2000));
    const meta = pairFile(dir, "compass_AI.png", {
      versions: [svgVersion(`${dir}/compass_AI.svg`, { version: 1, review: "approved" })],
    });
    node.children.set("compass_AI.svg.json", new BinFile("compass_AI.svg.json", serializePairMeta(meta), 1500));

    const settings = {
      ...DEFAULT_UPLOAD_SETTINGS,
      includeEps: true,
      scaleToMegapixels: true,
      targetMegapixels: 4,
      strokeMode: "uniform" as const,
      strokeWidthPx: 2.4,
    };

    const res = await runExport({
      root,
      row: {
        id: "pair_compass",
        base: "compass",
        suffix: "",
        dirPath: dir,
        version: 1,
        svgPath: `${dir}/compass_AI.svg`,
        svgName: "compass_AI.svg",
        fingerprint: `${COMPACT_ARC_ICON.length}:2000`,
        aiPath: `${dir}/compass_AI.png`,
        metaPath: `${dir}/compass_AI.svg.json`,
        approvedValid: 1,
      },
      settings,
      defaults: { ...DEFAULT_UPLOAD_SETTINGS },
      overrides: {},
      metadata: UPLOAD_META,
      metadataInfo: null,
      record: null,
      deps: {
        raster: {
          render: async (_svg, target) => target as unknown as HTMLCanvasElement,
          encode: async (c) => minimalJpeg(c.width, c.height),
        },
      },
    });

    expect(res.status).toBe("processed");
    const exp = node.children.get("export") as FakeDir;
    const svg = (exp.children.get("compass.svg") as FakeFile).text;
    const eps = (exp.children.get("compass.eps") as FakeFile).text;
    const jpg = (exp.children.get("compass.jpg") as BinFile).bytes;

    assertDirectOneDecimalSvg(svg);
    expect(svg).toMatch(/stroke-width="\d+(?:\.\d)?"/);

    assertNoAttribution(eps);
    expect(readXmpMetadataFromEps(eps)?.title).toBe(UPLOAD_META.title);

    const jpgLatin1 = new TextDecoder("latin1").decode(jpg);
    assertNoAttribution(jpgLatin1);
    expect(readXmpMetadata(jpg)?.title).toBe(UPLOAD_META.title);
  });

  it("rescales viewBox and coordinates directly to 1 decimal max without dividing stroke-width by scale", () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path d="M10.25 20.75l30.333 15.667" fill="none" stroke="#111" stroke-width="2"/></svg>';
    const fixedStroke = rescaleSvg(src, { rescaleMegapixels: 0.5, rescaleStrokes: false });
    expect(fixedStroke.ok).toBe(true);
    if (!fixedStroke.ok) return;
    const cleaned = cleanSvgText(fixedStroke.svg, { keepSize: true }).svg;
    assertDirectOneDecimalSvg(cleaned);
    expect(cleaned).toContain('viewBox="0 0 707.1 707.1"');
    expect(cleaned).toContain('stroke-width="2"');
    expect(cleaned).not.toContain("0.2828");
  });

  it("preserves compact SVGO arc flags and accumulates zero drift across long relative chains", () => {
    const chain = `M10 10${"l0.34 0".repeat(20)}a5.1 5.1 0 015.1-5.1`;
    const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="${chain}" fill="none" stroke="#000" stroke-width="1.5"/></svg>`;
    const cleaned = cleanSvgText(src, { keepSize: false }).svg;
    assertDirectOneDecimalSvg(cleaned);
    const d = new DOMParser().parseFromString(cleaned, "image/svg+xml").querySelector("path")!.getAttribute("d")!;
    const relSteps = d.slice(d.indexOf("l") + 1, d.indexOf("a")).trim().split(/[l\s,]+/).filter(Boolean).map(Number);
    let sumDx = 0;
    for (let i = 0; i < relSteps.length; i += 2) sumDx += relSteps[i];
    expect(sumDx).toBeCloseTo(6.8, 6);
    expect(d).toMatch(/a5\.1 5\.1 0 0 1 5\.1 -5\.1/);
  });

  it("bakes circle, ellipse, line, polyline, polygon, use, userSpaceOnUse gradients and dasharrays directly to 1 decimal", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="g1" gradientUnits="userSpaceOnUse" x1="1.25" y1="2.75" x2="50.55" y2="60.45"><stop offset="0" stop-color="#111"/><stop offset="1" stop-color="#999"/></linearGradient>
        <clipPath id="cp1"><circle cx="10.25" cy="10.75" r="8.35"/></clipPath>
        <rect id="sym" width="4.25" height="3.75"/>
      </defs>
      <g transform="translate(5.25 6.75) scale(1.5)" fill="none" stroke="url(#g1)" stroke-width="1.25" stroke-dasharray="2.25 1.75" style="stroke-width:1.25px">
        <circle cx="10.25" cy="12.75" r="4.35" clip-path="url(#cp1)"/>
        <ellipse cx="20.25" cy="22.75" rx="5.35" ry="3.15"/>
        <line x1="1.25" y1="2.25" x2="11.75" y2="12.75"/>
        <polyline points="1.25,2.25 5.75,6.25 9.35,3.15"/>
        <polygon points="12.25,14.25 18.75,14.25 15.55,19.85"/>
        <use href="#sym" x="3.25" y="4.75" width="4.25" height="3.75"/>
      </g>
    </svg>`;
    const cleaned = cleanSvgText(src, { keepSize: true }).svg;
    assertDirectOneDecimalSvg(cleaned);
    expect(cleaned).toContain("stroke-dasharray=");
  });
});
