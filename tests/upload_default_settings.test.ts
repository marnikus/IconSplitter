// upload_default_settings.test.ts — "default" for every visual export setting
// (user request 2026-10-19; plan: docs/archive/2026-10-19-upload-default-settings).
// Default = that aspect is left as the source has it; all five default (and no
// stroke expansion) = the approved SVG ships byte for byte. RULE 8: the real
// settings parser and the real prepare pipeline run.
import { describe, expect, it } from "vitest";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { AS_IS_SETTINGS, isAsIs } from "../src/lib/upload/asis";
import {
  BACKGROUND_SOURCE, DEFAULT_UPLOAD_SETTINGS, effectiveSettings, normalizeSettings,
  parseOverrides, settingsFingerprint, STROKE_MAX, type SettingsOverrides,
} from "../src/lib/upload/settings";

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const SOURCE = `<svg ${NS} viewBox="0 0 24 24"><!-- editor note --><path d="M4 4h16v16H4z" fill="none" stroke="#123456" stroke-width="1.5"/></svg>`;

const asIs = (over: SettingsOverrides = {}) => effectiveSettings({ ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS }, over);

function ok(source: string, over: SettingsOverrides = {}) {
  const r = prepareExportSvg(source, asIs(over));
  if (!r.ok) throw new Error(`${r.code}: ${r.detail}`);
  const root = new DOMParser().parseFromString(r.svg, "image/svg+xml").documentElement;
  return { r, root };
}

describe("the settings know 'default'", () => {
  it("AS_IS_SETTINGS is the five visual defaults; isAsIs needs all of them and no stroke expansion", () => {
    expect(AS_IS_SETTINGS).toEqual({ paddingPct: null, background: BACKGROUND_SOURCE, strokePx: 0, strokeColor: "artwork", artboard: { mode: "source", size: 512, width: 512, height: 512 } });
    expect(isAsIs(asIs())).toBe(true);
    expect(isAsIs(asIs({ strokePx: 2 }))).toBe(false);
    expect(isAsIs(asIs({ paddingPct: 0 }))).toBe(false);
    expect(isAsIs(asIs({ expandStrokes: true }))).toBe(false);
    expect(isAsIs(DEFAULT_UPLOAD_SETTINGS)).toBe(false);
  });

  it("defaults and overrides round-trip null padding, the 'default' background and the source artboard", () => {
    const stored = JSON.parse(JSON.stringify(asIs()));
    const back = normalizeSettings(stored);
    expect(back.paddingPct).toBeNull();
    expect(back.background).toBe("default");
    expect(back.artboard.mode).toBe("source");
    const over = parseOverrides(JSON.parse(JSON.stringify({ paddingPct: null, background: "default", artboard: { mode: "source" } })));
    expect(over).toMatchObject({ paddingPct: null, background: "default", artboard: { mode: "source" } });
  });

  it("the stroke width is the bar's (0–50); one icon may pin its own", () => {
    expect(STROKE_MAX).toBe(50);
    expect(normalizeSettings({ strokePx: 45 }).strokePx).toBe(45);
    expect(parseOverrides({ strokePx: 3, paddingPct: 4 })).toEqual({ strokePx: 3, paddingPct: 4 });
  });

  it("existing fingerprints are unchanged; each new default is distinct", () => {
    expect(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS)).toBe("36232c04");
    const base = settingsFingerprint(DEFAULT_UPLOAD_SETTINGS);
    const fps = [
      settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, paddingPct: null }),
      settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, paddingPct: 0 }),
      settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, background: BACKGROUND_SOURCE }),
      settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, artboard: AS_IS_SETTINGS.artboard }),
    ];
    expect(new Set([base, ...fps]).size).toBe(5);
  });
});

describe("prepareExportSvg with defaults", () => {
  it("all default: the export IS the approved source, byte for byte", () => {
    const { r } = ok(SOURCE);
    expect(r.svg).toBe(SOURCE);
    expect(r.asIs).toBe(true);
    expect([r.fit.artW, r.fit.artH]).toEqual([24, 24]);
  });

  it("only the stroke changed: the source viewBox and margins stay, no artboard rect, the width is written", () => {
    const { r, root } = ok(SOURCE, { strokePx: 3 });
    expect(r.asIs).toBe(false);
    expect(root.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(root.querySelector("rect")).toBeNull();
    const widths = [root, ...Array.from(root.querySelectorAll("*"))].map((el) => el.getAttribute("stroke-width")).filter(Boolean);
    expect(widths).toContain("3");
    expect(root.querySelector("path")!.getAttribute("d")).toMatch(/^M\s*4[ ,]4/);
  });

  it("background colour with default padding and artboard: the source frame, painted", () => {
    const { root } = ok(SOURCE, { background: "#ff0000" });
    expect(root.getAttribute("viewBox")).toBe("0 0 24 24");
    const rect = root.firstElementChild!;
    expect(rect.tagName.toLowerCase()).toBe("rect");
    expect([rect.getAttribute("width"), rect.getAttribute("height"), rect.getAttribute("fill")]).toEqual(["24", "24", "#ff0000"]);
  });

  it("a pinned 2:1 artboard with default padding: the source frame scaled in, centred (letterboxed)", () => {
    const { root } = ok(SOURCE, { artboard: { mode: "custom", size: 512, width: 200, height: 100 } });
    expect(root.getAttribute("viewBox")).toBe("0 0 200 100");
    // 24×24 frame → scale 100/24; the 16×16 square inside → 66.667 wide, centred at x = 100
    expect(root.querySelector("path")!.getAttribute("d")).toMatch(/^M\s*66\.667[ ,]16\.667/);
  });

  it("the source artboard with padding N: the artwork re-fitted with N % inside the source's own size", () => {
    const { root } = ok(SOURCE, { paddingPct: 10, strokePx: 0 });
    expect(root.getAttribute("viewBox")).toBe("0 0 24 24");
    const d = root.querySelector("path")!.getAttribute("d")!;
    // the 16×16 + 1.5 stroke artwork now spans 24 − 2 × 2.4 = 19.2 units
    expect(d).not.toMatch(/^M\s*4[ ,]4/);
  });
});

describe("runExport as is — the package's SVG is the approved file", () => {
  it("commits the source bytes as <name>.svg (no SVGO, no clean rewrite) and renders the JPEG from it", async () => {
    const { runExport } = await import("../src/upload/runexport");
    const { BinDir, BinFile } = await import("./helpers/binfakefs");
    const { minimalJpeg } = await import("./helpers/minijpeg");
    const { pairFile } = await import("./helpers/pairfile");
    const { svgVersion } = await import("./helpers/svgpair");
    const { serializePairMeta } = await import("../src/lib/pairmeta");
    const root = new BinDir("root");
    const dir = new BinDir("icons");
    root.children.set("icons", dir);
    dir.children.set("fog_AI.png", new BinFile("fog_AI.png", "ai", 3100));
    dir.children.set("fog_AI.svg", new BinFile("fog_AI.svg", SOURCE, 3400));
    dir.children.set("fog_AI.svg.json", new BinFile("fog_AI.svg.json", serializePairMeta(pairFile("icons", "fog_AI.png", { versions: [svgVersion("icons/fog_AI.svg", { version: 1, review: "approved" })] })), 3300));
    const settings = asIs();
    const result = await runExport({
      root, settings, defaults: settings, overrides: {}, metadata: null, metadataInfo: null, record: null,
      row: { id: "p", base: "fog", suffix: "", dirPath: "icons", version: 1, svgPath: "icons/fog_AI.svg", svgName: "fog_AI.svg", fingerprint: "x", aiPath: "icons/fog_AI.png", metaPath: "icons/fog_AI.svg.json", approvedValid: 1 },
      deps: { raster: { render: async (_s: string, t: { width: number; height: number }) => t as unknown as HTMLCanvasElement, encode: async (c: HTMLCanvasElement) => minimalJpeg(c.width, c.height) } },
    });
    expect(result.error).toBeNull();
    expect(result.status).toBe("processed");
    const exported = ((root.children.get("icons") as typeof dir).children.get("export") as typeof dir).children.get("fog.svg") as InstanceType<typeof BinFile>;
    expect(exported.text).toBe(SOURCE);
  });
});
