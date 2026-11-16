import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readBytesAt } from "../src/lib/fs";
import { runExport } from "../src/upload/runexport";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { verifyExportSvg } from "../src/lib/upload/clean";
import { verifyEpsDocument } from "../src/lib/upload/eps";
import { verifyJpeg } from "../src/lib/upload/jpeg";
import { readJpegIptc } from "../src/lib/upload/jpegiptc";
import { readEpsIptc } from "../src/lib/upload/epsiptc";
import { settingsFingerprint } from "../src/lib/upload/settings";
import { shippedBounds } from "../src/lib/upload/place";
import { stockExportArgs, STOCK_TEST_META } from "./helpers/stockexport";
import { minimalJpeg } from "./helpers/minijpeg";

const BASE = "tests/assets/SVG to JPEG or EPS export tests/";
const USER_SVG = readFileSync(`${BASE}icon-handshake-heart_7_03_v2.svg`, "utf8");
const USER_EPS = readFileSync(`${BASE}icon-handshake-heart_7_01_v2.eps`, "utf8");
const padding = { left: 3, right: 17, top: 7, bottom: 11 };
const rootOf = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;

describe("independent padding in the real supplied SVG -> SVG/JPEG/vector EPS pipeline", () => {
  it.each([false, true])("commits the preview geometry and four margins with optimization=%s", async (optimizeSvg) => {
    const { args, root } = stockExportArgs(USER_SVG);
    args.settings = { ...args.settings, paddingPct: padding, optimizeSvg,
      artboard: { mode: "custom", width: 5500, height: 3100, size: 512 } };
    args.defaults = args.settings;
    const rendered: string[] = [];
    args.deps = { raster: {
      render: async (svg, target) => { rendered.push(svg); return target as unknown as HTMLCanvasElement; },
      encode: async (canvas) => minimalJpeg(canvas.width, canvas.height),
    } };
    const preview = prepareExportSvg(USER_SVG, args.settings);
    expect(preview.ok).toBe(true); if (!preview.ok) return;
    const result = await runExport(args);
    expect(result.status, result.error?.detail).toBe("processed");
    expect(rendered).toHaveLength(1);
    expect(rendered[0].replace(/(<svg\b[^>]*?) width="\d+" height="\d+"/, "$1")).toBe(preview.svg);
    const svg = new TextDecoder().decode(await readBytesAt(root, "export/temporary.svg") as Uint8Array);
    const eps = new TextDecoder().decode(await readBytesAt(root, "export/temporary.eps") as Uint8Array);
    const jpg = await readBytesAt(root, "export/temporary.jpg") as Uint8Array;
    expect(verifyExportSvg(svg)).toEqual([]);
    expect(rootOf(svg).getAttribute("viewBox")).toBe("0 0 5500 3100");
    const b = shippedBounds(rootOf(svg))!;
    expect(b.minX).toBeGreaterThanOrEqual(5500 * .03 - .02);
    expect(b.minY).toBeGreaterThanOrEqual(5500 * .07 - .02);
    expect(b.minX + b.width).toBeLessThanOrEqual(5500 * .83 + .02);
    expect(b.minY + b.height).toBeLessThanOrEqual(3100 - 5500 * .11 + .02);
    expect(b.minX + b.width / 2).toBeCloseTo((5500 + 5500 * (.03 - .17)) / 2, 1);
    expect(b.minY + b.height / 2).toBeCloseTo((3100 + 5500 * (.07 - .11)) / 2, 1);
    expect(verifyEpsDocument(eps).ok).toBe(true);
    expect(eps).toContain("%%HiResBoundingBox: 0 0 4125 2325");
    expect(eps).not.toMatch(/\b(?:image|colorimage|imagemask)\b/);
    expect(verifyJpeg(jpg, { width: 5500, height: 3100, metadata: STOCK_TEST_META }).ok).toBe(true);
    expect(readJpegIptc(jpg)).toEqual(STOCK_TEST_META); expect(readEpsIptc(eps)).toEqual(STOCK_TEST_META);
    expect(result.record?.validation).toMatchObject({ svg: true, jpeg: true, eps: true });
    expect(new TextDecoder().decode(await readBytesAt(root, "temporary.svg") as Uint8Array)).toBe(USER_SVG);
    expect(readFileSync(`${BASE}icon-handshake-heart_7_03_v2.svg`, "utf8")).toBe(USER_SVG);
    expect(readFileSync(`${BASE}icon-handshake-heart_7_01_v2.eps`, "utf8")).toBe(USER_EPS);
  });
  it("invalidates the selective export when only one side changes", async () => {
    const { args, renders } = stockExportArgs(USER_SVG);
    args.settings = { ...args.settings, paddingPct: padding };
    args.defaults = args.settings;
    const first = await runExport(args);
    expect(first.status).toBe("processed");
    const reused = await runExport({ ...args, record: first.record });
    expect(reused.status).toBe("processed"); expect(reused.stages).toEqual([]); expect(renders.count).toBe(1);
    const settings = { ...args.settings, paddingPct: { ...padding, right: 19 } };
    expect(settingsFingerprint(settings)).not.toBe(settingsFingerprint(args.settings));
    const changed = await runExport({ ...args, settings, defaults: settings, record: first.record });
    expect(changed.status, changed.error?.detail).toBe("processed"); expect(renders.count).toBe(2);
  });
});
