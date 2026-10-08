// optimize.ts — the SVGO wrapper for the export SVG copy (design §3.1):
// every path passes through the mandatory clean boundary; preset-default then
// compacts the already-clean copy when enabled. The record captures version,
// config, before/after size and hash. The approved source is never touched.

import { optimize, VERSION, type Config } from "svgo/browser";
import { sha256HexText } from "./hash";
import { cleanExportSvg } from "./svgclean";

export interface OptimizeRecord {
  enabled: boolean;
  version: string;
  /** The recorded config (JSON) — exactly what was passed to SVGO. */
  config: string;
  beforeBytes: number;
  afterBytes: number;
  beforeHash: string;
  afterHash: string;
}

export interface OptimizeResult {
  svg: string;
  record: OptimizeRecord;
}

/** SVGO's recorded compaction config; cleanExportSvg owns output safety. */
const OPTIMIZE_CONFIG: Config = {
  floatPrecision: 3,
  plugins: [{
    name: "preset-default",
    params: {
      overrides: {
        convertShapeToPath: false,
        removeUnknownsAndDefaults: { defaultAttrs: false },
        removeUselessStrokeAndFill: false,
      },
    },
  }],
};

/** Cleans every export and compacts it only when enabled. */
export async function optimizeSvg(svgText: string, enabled: boolean): Promise<OptimizeResult> {
  const before = await svgStats(svgText);
  const cleanInput = cleanExportSvg(svgText);
  const compacted = enabled ? optimize(cleanInput, OPTIMIZE_CONFIG).data : cleanInput;
  const svg = enabled ? cleanExportSvg(compacted) : cleanInput;
  const after = await svgStats(svg);
  return { svg, record: optimizeRecord(enabled, before, after) };
}

interface SvgStats { bytes: number; hash: string }

async function svgStats(svg: string): Promise<SvgStats> {
  return { bytes: new TextEncoder().encode(svg).length, hash: await sha256HexText(svg) };
}

function optimizeRecord(enabled: boolean, before: SvgStats, after: SvgStats): OptimizeRecord {
  return {
    enabled, version: VERSION, config: configJson(),
    beforeBytes: before.bytes, afterBytes: after.bytes,
    beforeHash: before.hash, afterHash: after.hash,
  };
}

function configJson(): string {
  return JSON.stringify(OPTIMIZE_CONFIG);
}
