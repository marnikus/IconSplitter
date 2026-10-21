// Real PostScript Level 3 execution + pixel verification via GPL Ghostscript 10.06 WASM
// (@okathira/ghostpdl-wasm — devDependency only; zero bytes enter dist/index.html).
import { describe, expect, it } from "vitest";
import initGhostscript from "@okathira/ghostpdl-wasm";
import { enforceExportSvg } from "../src/lib/upload/clean";
import { verifyEps, writeEps } from "../src/lib/upload/eps";
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

describe("writeEps — verified by real Ghostscript 10.06 PostScript Level 3 interpreter", () => {
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
    expect(/\b(colorimage|image)\b/.test(epsOut.eps)).toBe(false);

    // Also embed XMP metadata and confirm real Ghostscript executes both pdfmark + shfill cleanly
    const meta = { title: "Shadow Icon", description: "Vector icon with smooth radial shadow", tags: ["icon", "shadow", "vector", "clean", "eps"] };
    const withXmp = embedXmpMetadataInEps(epsOut.eps, meta);
    expect(verifyEpsMetadata(withXmp, meta)).toBe(true);

    const bmp = await renderEpsWithGhostscript(withXmp, 72);
    expect([bmp.width, bmp.height]).toEqual([384, 384]);

    // Locate the shadow ellipse in the cleaned SVG and sample center vs mid-radius vs outside in rendered pixels
    const doc = new DOMParser().parseFromString(cleaned.svg, "image/svg+xml");
    const ell = doc.querySelector("ellipse")!;
    const cxPt = Math.round(Number(ell.getAttribute("cx")) * 0.75);
    const cyPt = Math.round(Number(ell.getAttribute("cy")) * 0.75);
    const rxPt = Number(ell.getAttribute("rx")) * 0.75;
    const center = bmp.pixel(cxPt, cyPt);
    const mid = bmp.pixel(Math.round(cxPt + rxPt * 0.5), cyPt);
    const out = bmp.pixel(Math.min(382, Math.round(cxPt + rxPt * 1.15)), cyPt);
    // Center: #000 at 0.2 alpha over #fff -> ~204; mid darker than white and lighter than center; outside pure white 255
    expect(center[0]).toBeGreaterThanOrEqual(200);
    expect(center[0]).toBeLessThanOrEqual(212);
    expect(mid[0]).toBeGreaterThan(center[0]);
    expect(mid[0]).toBeLessThan(255);
    expect(out).toEqual([255, 255, 255]);
  });

  it("renders multi-stop linear, focal radial, href-inherited and stroked gradients accurately in Ghostscript", async () => {
    const svg = enforceExportSvg(`<svg ${NS} viewBox="0 0 200 200">
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
      <rect x="20" y="20" width="160" height="40" fill="url(#linked)"/>
      <circle cx="100" cy="115" r="35" fill="url(#focal)"/>
      <line x1="20" y1="175" x2="180" y2="175" stroke="url(#linked)" stroke-width="12" stroke-linecap="butt"/>
    </svg>`).svg;
    const out = writeEps(svg, "#ffffff");
    if (!out.ok) throw new Error(out.reason);
    expect(verifyEps(out.eps).ok).toBe(true);
    const bmp = await renderEpsWithGhostscript(out.eps, 96);
    expect([bmp.width, bmp.height]).toEqual([200, 200]);

    // At 96 DPI, 1 pt * (96/72) = 1/0.75 -> pixel coordinates equal SVG viewBox coordinates 1:1!
    expect(bmp.pixel(22, 40)[0]).toBeGreaterThan(240);   // near x=20: pure red
    expect(bmp.pixel(100, 40)[1]).toBeGreaterThan(240);  // midpoint x=100: pure green
    expect(bmp.pixel(178, 40)[2]).toBeGreaterThan(240);  // near x=180: pure blue
    // Stroked line at y=175 has the exact same red -> green -> blue gradient!
    expect(bmp.pixel(25, 175)[0]).toBeGreaterThan(235);
    expect(bmp.pixel(100, 175)[1]).toBeGreaterThan(235);
    expect(bmp.pixel(175, 175)[2]).toBeGreaterThan(235);
    // Focal radial gradient peaks yellow near fx=0.25 -> x = 100 - 35 + 0.5*35 = 82.5
    const nearFocus = bmp.pixel(83, 115);
    expect(nearFocus[0]).toBeGreaterThan(230);
    expect(nearFocus[1]).toBeGreaterThan(230);
  });
});
