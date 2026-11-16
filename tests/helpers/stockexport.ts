// Supplementary real pipeline fixture, NOT either of the user's missing SVGs.
import { BinDir, BinFile } from "./binfakefs";
import { minimalJpeg } from "./minijpeg";
import type { IconMetadata } from "../../src/lib/upload/meta";
import { DEFAULT_UPLOAD_SETTINGS } from "../../src/lib/upload/settings";
import type { ExportRunArgs } from "../../src/upload/runexport";
export const STOCK_TEST_META: IconMetadata = {
  title: "Temporary community & café test icon",
  description: "Temporary stock metadata description with 日本語 and <safe text>",
  tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web", "café", "日本語", "temporary"],
};
export const STOCK_TEST_SVGS = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="none" stroke="black" stroke-width="3"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 80L50 20L90 80" fill="none" stroke="black" stroke-width="4" stroke-linecap="round"/></svg>',
];
export function stockExportArgs(svg: string, name = "temporary"): { args: ExportRunArgs; root: BinDir; renders: { count: number } } {
  const root = new BinDir("test");
  root.children.set(`${name}.svg`, new BinFile(`${name}.svg`, svg));
  const renders = { count: 0 };
  const settings = { ...DEFAULT_UPLOAD_SETTINGS, includeEps: true, optimizeSvg: false, artboard: { mode: "custom" as const, size: 100, width: 100, height: 100 } };
  const args: ExportRunArgs = {
    root, row: { id: name, base: name, suffix: "", dirPath: "", svgPath: `${name}.svg`, svgName: `${name}.svg`, version: 1, fingerprint: "test", aiPath: "", metaPath: "", approvedValid: 1 },
    settings, defaults: settings, overrides: {}, metadata: STOCK_TEST_META,
    metadataInfo: { provider: "gemini", model: "temporary-test", prompt: "temporary", requestId: null, usage: { input: null, output: null, total: null }, validation: { ok: true, errors: [], warnings: [] } }, record: null,
    deps: { raster: {
      render: async (_svg, target) => { renders.count++; return target as unknown as HTMLCanvasElement; },
      encode: async (canvas) => minimalJpeg(canvas.width, canvas.height),
    } },
  };
  return { args, root, renders };
}
