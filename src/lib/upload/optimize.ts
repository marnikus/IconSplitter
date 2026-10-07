// optimize.ts — the SVGO wrapper for the export SVG copy (design §3.1):
// preset-default with the removals that would eat content DISABLED
// (removeMetadata/removeTitle/removeDesc/removeViewBox: false — the artwork's
// own metadata, title, desc and viewBox survive), floatPrecision 3. The
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
        },
      },
    },
  ],
};

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
