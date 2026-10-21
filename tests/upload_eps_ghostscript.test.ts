// Real PostScript Level 3 execution + Native Illustrator 10 vector stream audit
// via GPL Ghostscript 10.06 WASM (@okathira/ghostpdl-wasm — devDependency only;
// zero bytes enter dist/index.html).
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import initGhostscript from "@okathira/ghostpdl-wasm";
import { enforceExportSvg } from "../src/lib/upload/clean";
import { verifyEps, writeEps } from "../src/lib/upload/eps";
import { findRasterOperators } from "../src/lib/upload/epscheck";
import { embedXmpMetadataInEps, verifyEpsMetadata } from "../src/lib/upload/epsmetadata";
import { optimizeSvg } from "../src/lib/upload/optimize";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { DEFAULT_UPLOAD_SETTINGS, flattenColor } from "../src/lib/upload/settings";

const NS = 'xmlns="http://www.w3.org/2000/svg"';

interface RenderedBmp {
  width: number;
  height: number;
  pixel: (x: number, yTop: number) => [number, number, number];
}

/** Rasterize an EPS document through real Ghostscript 10.06 at `dpi` and expose exact top-down RGB pixels. */
async function renderEpsWithGhostscript(eps: string, dpi = 72): Promise<RenderedBmp> {
  const logs: string[] = [];
  const gs = await initGhostscript({ print: (m: string) => logs.push(m), printErr: (m: string) => logs.push(m) });
  gs.FS.writeFile("/in.eps", new TextEncoder().encode(eps));
  const code = gs.callMain([
    "-dNOPAUSE", "-dBATCH", "-dSAFER", "-dEPSCrop",
    "-sDEVICE=bmp16m", `-r${dpi}`, "-sOutputFile=/out.bmp", "/in.eps",
  ]);
  expect(code, logs.join("\n")).toBe(0);
  const buf = Buffer.from(gs.FS.readFile("/out.bmp"));
  const dataOff = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawH = buf.readInt32LE(22);
  const height = Math.abs(rawH);
  const stride = Math.ceil((width * 3) / 4) * 4;
  return {
    width,
    height,
    pixel: (x: number, yTop: number) => {
      const row = rawH > 0 ? height - 1 - yTop : yTop;
      const off = dataOff + row * stride + x * 3;
      return [buf[off + 2], buf[off + 1], buf[off]];
    },
  };
}

function decodeAiStream(eps: string): string {
  const m = /%AI9_DataStream\n([\s\S]*?)~>\n%AI9_PrivateDataEnd/.exec(eps);
  expect(m).not.toBeNull();
  const raw = m![1].split("\n").map((l) => l.replace(/^%/, "")).join("");
  const out: number[] = [];
  let tuple = 0;
  let count = 0;
  for (const ch of raw) {
    if (ch === "z" && count === 0) { out.push(0, 0, 0, 0); continue; }
    const v = ch.charCodeAt(0) - 33;
    if (v < 0 || v > 84) continue;
    tuple = tuple * 85 + v;
    count++;
    if (count === 5) {
      out.push((tuple >>> 24) & 0xff, (tuple >>> 16) & 0xff, (tuple >>> 8) & 0xff, tuple & 0xff);
      tuple = 0;
      count = 0;
    }
  }
  if (count > 1) {
    for (let i = count; i < 5; i++) tuple = tuple * 85 + 84;
    const bytes = [(tuple >>> 24) & 0xff, (tuple >>> 16) & 0xff, (tuple >>> 8) & 0xff, tuple & 0xff];
    for (let i = 0; i < count - 1; i++) out.push(bytes[i]);
  }
  return inflateSync(Uint8Array.from(out)).toString("latin1");
}

describe("writeEps — verified by real Ghostscript 10.06 PostScript Level 3 + Native AI 10 audit", () => {
  it("renders the prepared + SVGO-optimized Upload shadow template cleanly with exact vector gradient falloff", async () => {
    const icon = `<svg ${NS} viewBox="0 0 100 100"><rect x="20" y="15" width="60" height="55" rx="8" fill="#1e293b"/></svg>`;
    const settings = {
      ...DEFAULT_UPLOAD_SETTINGS,
      shadowEnabled: true, shadowWidthPct: 90, shadowGapPct: 6,
      artboard: { mode: "preset" as const, size: 512 as const, width: 512, height: 512 },
    };
    const prep = prepareExportSvg(icon, settings);
    if (!prep.ok) throw new Error(prep.detail);
    const opt = await optimizeSvg(prep.svg, true);
    const cleaned = enforceExportSvg(opt.svg);
    expect(cleaned.violations).toEqual([]);

    const epsOut = writeEps(cleaned.svg, flattenColor(settings.background), { title: "shadowed.eps" });
    if (!epsOut.ok) throw new Error(epsOut.reason);
    expect(verifyEps(epsOut.eps).ok).toBe(true);
    expect(epsOut.eps).toContain("/ShadingType 3");
    expect(epsOut.eps).toContain("shfill");
    expect(findRasterOperators(epsOut.eps)).toEqual([]);

    const ai = decodeAiStream(epsOut.eps);
    expect(findRasterOperators(ai)).toEqual([]);
    expect(ai).toContain("%AI5_BeginGradient: (Gradient 1)\n(Gradient 1) 1 3 Bd");

    const meta = { title: "Shadow Icon", description: "Vector image icon with smooth radial shadow", tags: ["icon", "shadow", "vector", "image", "eps"] };
    const withXmp = embedXmpMetadataInEps(epsOut.eps, meta);
    expect(verifyEpsMetadata(withXmp, meta)).toBe(true);
    expect(findRasterOperators(withXmp)).toEqual([]);

    const bmp = await renderEpsWithGhostscript(withXmp, 72);
    expect([bmp.width, bmp.height]).toEqual([384, 384]);

    const doc = new DOMParser().parseFromString(cleaned.svg, "image/svg+xml");
    const ell = doc.querySelector("ellipse")!;
    const cxPt = Math.round(Number(ell.getAttribute("cx")) * 0.75);
    const cyPt = Math.round(Number(ell.getAttribute("cy")) * 0.75);
    const rxPt = Number(ell.getAttribute("rx")) * 0.75;
    const center = bmp.pixel(cxPt, cyPt);
    const mid = bmp.pixel(Math.round(cxPt + rxPt * 0.5), cyPt);
    const out = bmp.pixel(Math.min(382, Math.round(cxPt + rxPt * 1.15)), cyPt);
    expect(center[0]).toBeGreaterThanOrEqual(200);
    expect(center[0]).toBeLessThanOrEqual(212);
    expect(mid[0]).toBeGreaterThan(center[0]);
    expect(mid[0]).toBeLessThan(255);
    expect(out).toEqual([255, 255, 255]);
  });

  it("renders multi-stop linear, focal radial, href-inherited, stroked, and evenodd compound gradients accurately", async () => {
    const svg = enforceExportSvg(`<svg ${NS} viewBox="0 0 200 240">
      <defs>
        <linearGradient id="stops">
          <stop offset="0%" stop-color="#ff0000"/>
          <stop offset="50%" stop-color="#00ff00"/>
          <stop offset="100%" stop-color="#0000ff"/>
        </linearGradient>
        <linearGradient id="linked" href="#stops" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="180" y2="0"/>
        <radialGradient id="focal" cx="0.5" cy="0.5" r="0.5" fx="0.25" fy="0.5">
          <stop offset="0" stop-color="#ffff00"/>
          <stop offset="1" stop-color="#000080"/>
        </radialGradient>
      </defs>
      <rect width="200" height="240" fill="#ffffff"/>
      <rect x="20" y="20" width="160" height="40" fill="url(#linked)"/>
      <circle cx="100" cy="115" r="35" fill="url(#focal)"/>
      <line x1="20" y1="175" x2="180" y2="175" stroke="url(#linked)" stroke-width="12" stroke-linecap="butt"/>
      <path fill-rule="evenodd" fill="url(#linked)" d="M20 196H180V232H20ZM70 204H130V224H70Z"/>
    </svg>`).svg;
    const out = writeEps(svg, "#ffffff");
    if (!out.ok) throw new Error(out.reason);
    expect(verifyEps(out.eps).ok).toBe(true);
    expect(out.eps).not.toContain("strokepath");

    const bmp = await renderEpsWithGhostscript(out.eps, 96);
    expect([bmp.width, bmp.height]).toEqual([200, 240]);

    expect(bmp.pixel(22, 40)[0]).toBeGreaterThan(240);
    expect(bmp.pixel(100, 40)[1]).toBeGreaterThan(240);
    expect(bmp.pixel(178, 40)[2]).toBeGreaterThan(240);

    // Expanded cubic-Bezier gradient stroke at y=175: red -> green -> blue with 0 strokepath
    expect(bmp.pixel(25, 175)[0]).toBeGreaterThan(235);
    expect(bmp.pixel(100, 175)[1]).toBeGreaterThan(235);
    expect(bmp.pixel(175, 175)[2]).toBeGreaterThan(235);

    // Even-odd compound path at y=214: outer bar red/blue, inner hole pure white
    expect(bmp.pixel(25, 214)[0]).toBeGreaterThan(235);
    expect(bmp.pixel(100, 214)).toEqual([255, 255, 255]);
    expect(bmp.pixel(175, 214)[2]).toBeGreaterThan(235);

    const nearFocus = bmp.pixel(83, 115);
    expect(nearFocus[0]).toBeGreaterThan(230);
    expect(nearFocus[1]).toBeGreaterThan(230);
  });
});
