// optimize.ts — the SVGO wrapper for the export SVG copy (design §3.1):
// preset-default with the removals that would eat content DISABLED
// (removeMetadata/removeTitle/removeDesc/removeViewBox: false — the artwork's
// own metadata, title, desc and viewBox survive), floatPrecision 3, and colour
// NAMES never invented (2026-11-19): the default shortened `#ffa500` to
// `orange`, which the EPS writer cannot read. Hex in, hex out. The
// record captures version, config, before/after size and hash. Only the
// export copy is optimized; the approved source is never touched.

import { optimize, VERSION, type Config } from "svgo";
import { sha256HexText } from "./hash";

export interface OptimizeRecord {
  enabled: boolean;
  version: string;
  /** The recorded config (JSON) — exactly what was passed to SVGO. */
  config: string;
  beforeBytes: number;
  afterBytes: number;
  beforeHash: string;
  afterHash: string;
  /** True when the optimizer's output needed the clean pass to be rebuilt. */
  cleanRebuilt?: boolean;
}

export interface OptimizeResult {
  svg: string;
  record: OptimizeRecord;
}

/** The recorded SVGO config: preset-default, content-preserving overrides. */
export const OPTIMIZE_CONFIG: Config = {
  floatPrecision: 3,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeMetadata: false,
          removeTitle: false,
          removeDesc: false,
          removeViewBox: false,
          convertColors: { shortname: false, names2hex: true },
        },
      },
    },
  ],
};

function fastCleanPlugins(svgText: string): NonNullable<Config["plugins"]> {
  const plugins: NonNullable<Config["plugins"]> = [];
  if (svgText.includes("<!")) plugins.push("removeDoctype", "removeComments");
  if (svgText.includes("<?")) plugins.push("removeXMLProcInst");
  if (svgText.includes("xmlns:")) plugins.push("removeEditorsNSData", "removeUnusedNS");
  if (/<defs\b/i.test(svgText)) plugins.push("removeUselessDefs");
  plugins.push(
    "cleanupAttrs",
    { name: "convertColors", params: { shortname: false, names2hex: true } },
    "removeEmptyAttrs",
  );
  return plugins;
}

function sheetConfigOf(cleanExport: boolean, svgText: string): Config {
  const hasStyleTag = /<style\b/i.test(svgText);
  if (cleanExport && !hasStyleTag) return { floatPrecision: 1, plugins: fastCleanPlugins(svgText) };
  const precision = cleanExport ? 1 : 3;
  return {
    floatPrecision: precision,
    plugins: [{
      name: "preset-default",
      params: {
        overrides: {
          removeMetadata: false, removeDesc: false, mergePaths: false, removeHiddenElems: false,
          ...(hasStyleTag ? {} : { inlineStyles: false, mergeStyles: false, minifyStyles: false }),
          ...(cleanExport
            ? { convertPathData: false, convertTransform: false }
            : { convertPathData: { makeArcs: false as never, floatPrecision: precision } }),
          convertColors: { shortname: false, names2hex: true },
        },
      },
    }],
  };
}

const NON_LITERAL_PAINT_RE = /\b(?:fill|stroke|color|stop-color|flood-color|lighting-color)=["'](?!(?:#[0-9a-fA-F]{6}|none|currentColor|url\(#[^"')]+\))["'])/i;

/** True when a clean-export sheet already satisfies every plugin in `sheetConfigOf(true, svgText)`. */
function isAlreadySvgoCleanSheet(svgText: string): boolean {
  if (svgText.includes("<!") || svgText.includes("<?") || svgText.includes("xmlns:")) return false;
  if (svgText.includes('=""') || svgText.includes("=''") || svgText.includes("style=")) return false;
  if (/[\r\n\t]| {2}|<style\b|<defs\b/i.test(svgText)) return false;
  return !NON_LITERAL_PAINT_RE.test(svgText);
}

/**
 * Sheet-tuned SVGO pass for multi-icon artboard sheets: keeps preset-default
 * structural/paint cleanup and hex-only colors while skipping quadratic
 * cross-path `mergePaths` and passes duplicated by `cleanSheetSvg`.
 */
export async function optimizeSheetSvg(svgText: string, enabled: boolean, cleanExport = true): Promise<OptimizeResult> {
  const cfg = sheetConfigOf(cleanExport, svgText);
  const cfgStr = JSON.stringify(cfg);
  const beforeBytes = byteLength(svgText);
  const beforeHash = await sha256HexText(svgText);
  if (!enabled || (cleanExport && isAlreadySvgoCleanSheet(svgText))) {
    return {
      svg: svgText,
      record: { enabled, version: VERSION, config: cfgStr, beforeBytes, afterBytes: beforeBytes, beforeHash, afterHash: beforeHash },
    };
  }
  const out = optimize(svgText, cfg);
  const afterBytes = byteLength(out.data);
  return {
    svg: out.data,
    record: { enabled: true, version: VERSION, config: cfgStr, beforeBytes, afterBytes, beforeHash, afterHash: await sha256HexText(out.data) },
  };
}

/** Optimizes the export copy (or passes it through when disabled). */
export async function optimizeSvg(svgText: string, enabled: boolean): Promise<OptimizeResult> {
  const beforeBytes = byteLength(svgText);
  const beforeHash = await sha256HexText(svgText);
  if (!enabled) {
    return {
      svg: svgText,
      record: {
        enabled: false, version: VERSION, config: configJson(),
        beforeBytes, afterBytes: beforeBytes, beforeHash, afterHash: beforeHash,
      },
    };
  }
  const out = optimize(svgText, OPTIMIZE_CONFIG);
  const afterBytes = byteLength(out.data);
  return {
    svg: out.data,
    record: {
      enabled: true, version: VERSION, config: configJson(),
      beforeBytes, afterBytes, beforeHash, afterHash: await sha256HexText(out.data),
    },
  };
}

/**
 * The record after the clean pass: when the clean pass had to rebuild the
 * optimizer's output, the recorded size and hash are the FILE's own — a record
 * that described SVGO's discarded intermediate would be a lie (RULE 15).
 */
export async function recordAfterClean(record: OptimizeRecord, svgText: string, rebuilt: boolean): Promise<OptimizeRecord> {
  if (!rebuilt) return record;
  return {
    ...record, cleanRebuilt: true,
    afterBytes: byteLength(svgText), afterHash: await sha256HexText(svgText),
  };
}

/** UTF-8 byte length as the browser writes it (never a character count). */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function configJson(): string {
  return JSON.stringify(OPTIMIZE_CONFIG);
}
