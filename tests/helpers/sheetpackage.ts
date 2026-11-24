// sheetpackage.ts — one composed artboard sheet plus the injected
// browser parts, so format tests assert on what really ships (2026-11-19).
import { DEFAULT_CONFIG, parseSheetConfig } from "../../src/lib/svgBuilder/config";
import { computeLayout } from "../../src/lib/svgBuilder/layout";
import { composeSheet } from "../../src/lib/svgBuilder/compose";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../../src/lib/upload/settings";
import type { SheetMetadata } from "../../src/lib/svgBuilder/types";
import { builtinConverter } from "../../src/lib/upload/epsconv/builtin";
import { buildSheetPackage, type SheetPackage } from "../../src/svgBuilder/sheetpackage";
import type { BuilderIconAsset } from "../../src/lib/svgBuilder/types";

export const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

export const ICON_ASSET: BuilderIconAsset = {
  id: "a", base: "star", suffix: "", label: "Star", category: "UI", tags: ["ui"],
  svgPath: "ui/star_AI.svg", svgName: "star_AI.svg", version: 1, fingerprint: "10:1",
  metaPath: "ui/star_AI.svg.json", approved: true,
};

export interface SheetPatch {
  strokeWidth?: number;
  /** The icon ink (the artboard's stroke colour). */
  ink?: string;
  titleTracking?: number;
  subtitleTracking?: number;
}

/** The composed sheet SVG exactly as the artboard draws it. */
export function sheetSvg(patch: SheetPatch = {}): string {
  const config = parseSheetConfig({
    ...DEFAULT_CONFIG,
    icons: {
      ...DEFAULT_CONFIG.icons,
      ...(patch.strokeWidth === undefined ? {} : { strokeWidth: patch.strokeWidth }),
      ...(patch.ink === undefined ? {} : { color: patch.ink }),
    },
    banner: {
      ...DEFAULT_CONFIG.banner,
      ...(patch.titleTracking === undefined ? {} : { titleTracking: patch.titleTracking }),
      ...(patch.subtitleTracking === undefined ? {} : { subtitleTracking: patch.subtitleTracking }),
    },
  });
  return composeSheet({ config, layout: computeLayout(config), assets: [ICON_ASSET], placedIds: ["a"], svgTexts: { a: ICON } }).svg;
}

const NO_BROWSER = {
  pngBlob: async () => new Blob([new Uint8Array([1])]),
  rasterize: async () => ({ ok: true as const, jpeg: new Uint8Array([1]) }),
  eps: (input: { svg: string; background: string; xmp?: string }) =>
    builtinConverter.convert(input, { bridgeUrl: "", fetch: async () => new Response("") }),
};

/** One sheet package over the composed sheet; browser renderers are fakes. */
export function packageOf(svg: string, settings: Partial<UploadSettings> = {}, metadata: SheetMetadata | null = null): Promise<SheetPackage> {
  return buildSheetPackage({
    svg, metadata, folder: "_artboard_sheets/x/a", stem: "sheet", pairId: "a1",
    now: "2026-11-19T00:00:00.000Z", prompt: "", model: "",
    settings: { ...DEFAULT_UPLOAD_SETTINGS, optimizeSvg: false, ...settings },
  }, NO_BROWSER);
}

export const textOf = (pkg: SheetPackage, ext: string): string | null => {
  const file = pkg.files.find((entry) => entry.name.endsWith(ext));
  return file === undefined ? null : new TextDecoder().decode(file.bytes);
};
