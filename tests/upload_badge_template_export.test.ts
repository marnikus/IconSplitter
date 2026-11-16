import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readBytesAt } from "../src/lib/fs";
import { runExport } from "../src/upload/runexport";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { verifyExportSvg } from "../src/lib/upload/clean";
import { verifyEpsDocument } from "../src/lib/upload/eps";
import { verifyJpeg } from "../src/lib/upload/jpeg";
import { stockExportArgs, STOCK_TEST_META } from "./helpers/stockexport";
import { minimalJpeg } from "./helpers/minijpeg";

const BASE = "tests/assets/SVG to JPEG or EPS export tests/";
const USER_SVG = readFileSync(`${BASE}icon-handshake-heart_7_03_v2.svg`, 'utf8');
const USER_EPS = readFileSync(`${BASE}icon-handshake-heart_7_01_v2.eps`, 'utf8');
const TEMPLATE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><defs><linearGradient id="paint"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect x="0" y="0" width="80" height="40" fill="url(#paint)"/></svg>';

describe('replacement badge in the actual supplied SVG export pipeline', () => {
  it.each([false, true])('commits clean SVG/JPEG/native vector EPS with optimization=%s and the exact preview artwork', async (optimizeSvg) => {
    const { args, root } = stockExportArgs(USER_SVG);
    args.settings = { ...args.settings, badgeEnabled: true, badgeTemplateSvg: TEMPLATE, optimizeSvg };
    args.defaults = { ...args.settings, badgeEnabled: false };
    args.overrides = { badgeEnabled: true };
    const rendered: string[] = [];
    args.deps = { raster: {
      render: async (svg, target) => { rendered.push(svg); return target as unknown as HTMLCanvasElement; },
      encode: async (canvas) => minimalJpeg(canvas.width, canvas.height),
    } };
    const preview = prepareExportSvg(USER_SVG, args.settings);
    if (!preview.ok) throw new Error(preview.detail);
    const result = await runExport(args);
    expect(result.status, result.error?.detail).toBe('processed');
    expect(rendered).toHaveLength(1);
    expect(rendered[0].replace(/(<svg\b[^>]*?) width="\d+" height="\d+"/, '$1')).toBe(preview.svg);
    const svg = new TextDecoder().decode(await readBytesAt(root, 'export/temporary.svg') as Uint8Array);
    const eps = new TextDecoder().decode(await readBytesAt(root, 'export/temporary.eps') as Uint8Array);
    const jpg = await readBytesAt(root, 'export/temporary.jpg') as Uint8Array;
    expect(svg).toContain('linearGradient');
    expect(verifyExportSvg(svg)).toEqual([]);
    expect(eps).toContain('shfill');
    expect(verifyEpsDocument(eps).ok).toBe(true);
    expect(verifyJpeg(jpg, { width: 100, height: 100, metadata: STOCK_TEST_META }).ok).toBe(true);
    expect(result.record?.validation).toMatchObject({ svg: true, jpeg: true, eps: true });
    expect(new TextDecoder().decode(await readBytesAt(root, 'temporary.svg') as Uint8Array)).toBe(USER_SVG);
    expect(readFileSync(`${BASE}icon-handshake-heart_7_03_v2.svg`, 'utf8')).toBe(USER_SVG);
    expect(readFileSync(`${BASE}icon-handshake-heart_7_01_v2.eps`, 'utf8')).toBe(USER_EPS);
  });
});
