// upsvgo.ts — the optimizer stage of the export pipeline (prompt §5/§9).
// Owns: the REAL SVGO v4 `svgo/browser` configuration (metadata- and
// stroke-preserving), the verification gate (a parsable SVG with the same
// viewBox and embedded metadata, or RULE 9 keeps the unoptimized copy), and
// the pixel render-compare between the unoptimized and optimized copy. No
// stage ever falls back to "the optimizer said so".

import { VERSION as SVGO_VERSION, optimize, type Config } from "svgo/browser";
import { parseSvgText, readSvgMetadata } from "./upprepare";

/** Recorded in export.json so the optimizer configuration is explainable. */
export const SVGO_CONFIG_NAME =
  "svgo:4 preset-default{removeDesc:false,removeMetadata:false,removeUselessStrokeAndFill:false}";

const SVGO_CONFIG: Config = {
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeDesc: false, // keep <desc>
          removeMetadata: false, // keep the embedded dc RDF keyword metadata
          removeUselessStrokeAndFill: false, // never drop stroke attributes
        },
      },
    },
  ],
};

export interface OptimizeOutcome {
  /** Always a usable SVG string — the original when optimization was refused. */
  svg: string;
  optimized: boolean;
  reason: string | null;
  beforeBytes: number;
  afterBytes: number;
  version: string;
}

export function optimizeExportSvg(svg: string): OptimizeOutcome {
  const beforeBytes = new TextEncoder().encode(svg).length;
  const refused = (reason: string, afterBytes = beforeBytes): OptimizeOutcome => ({
    svg, optimized: false, reason, beforeBytes, afterBytes, version: SVGO_VERSION,
  });
  try {
    const result = optimize(svg, SVGO_CONFIG);
    const issues = verifyOptimizedSvg(svg, result.data);
    if (issues.length > 0) return refused(`verification failed: ${issues.join("; ")}`);
    const afterBytes = new TextEncoder().encode(result.data).length;
    if (afterBytes >= beforeBytes) return refused("no size reduction");
    return { svg: result.data, optimized: true, reason: null, beforeBytes, afterBytes, version: SVGO_VERSION };
  } catch (err) {
    return refused(`optimizer failed: ${String(err)}`);
  }
}

/** Structural gate: the optimized copy must still be the same explained icon. */
export function verifyOptimizedSvg(before: string, after: string): string[] {
  const beforeDoc = parseSvgText(before);
  const afterDoc = parseSvgText(after);
  if (beforeDoc === null) return ["input is not a parsable SVG"];
  if (afterDoc === null) return ["optimized output is not a parsable SVG"];
  const issues: string[] = [];
  const b = beforeDoc.documentElement;
  const a = afterDoc.documentElement;
  if (a.getAttribute("viewBox") !== b.getAttribute("viewBox")) issues.push("viewBox changed");
  const beforeMeta = readSvgMetadata(before);
  const afterMeta = readSvgMetadata(after);
  if (beforeMeta === null || afterMeta === null) {
    issues.push("embedded metadata became unreadable");
  } else {
    if (beforeMeta.title !== afterMeta.title) issues.push("title lost");
    if (beforeMeta.description !== afterMeta.description) issues.push("description lost");
    if (beforeMeta.tags.join("\u0000") !== afterMeta.tags.join("\u0000")) issues.push("keyword metadata lost");
  }
  return issues;
}

/** Renders pixels for the compare; `which` says which side is asked for. */
export interface PixelDeps {
  renderPixels(svg: string, which: "a" | "b"): Promise<Uint8Array | null>;
}

export interface CompareArgs {
  width: number;
  height: number;
  background: string;
  /** Per-pixel max channel difference that still counts as "the same". */
  tolerance: number;
  /** Share of pixels (percent) allowed to exceed the tolerance. */
  budget: number;
  deps: PixelDeps;
}

/**
 * Compares the two SVGs by rendering both to RGBA and counting pixels whose
 * channel difference exceeds `tolerance`; more than `budget` percent fails.
 * A render that fails on either side is a mismatch, never a silent pass.
 */
export async function rendersMatch(a: string, b: string, args: CompareArgs): Promise<boolean> {
  const [pa, pb] = await Promise.all([args.deps.renderPixels(a, "a"), args.deps.renderPixels(b, "b")]);
  const pixels = args.width * args.height;
  if (pa === null || pb === null || pa.length < pixels * 4 || pb.length < pixels * 4) return false;
  let differing = 0;
  for (let i = 0; i < pixels; i++) {
    if (pixelDiff(pa, pb, i) > args.tolerance) differing++;
  }
  return (differing * 100) / pixels <= args.budget;
}

function pixelDiff(pa: Uint8Array, pb: Uint8Array, i: number): number {
  let max = 0;
  for (let c = 0; c < 4; c++) {
    const d = Math.abs(pa[i * 4 + c] - pb[i * 4 + c]);
    if (d > max) max = d;
  }
  return max;
}

/** The browser-side renderer for the compare gate (used by the upload service). */
export function browserPixelDeps(size: { width: number; height: number }, background: string): PixelDeps {
  return {
    renderPixels: (svg: string) =>
      new Promise<Uint8Array | null>((resolve) => {
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        const image = new Image();
        image.onload = () => {
          try {
            const ctx = compareCtx(size, background);
            if (ctx === null) return resolve(null);
            ctx.drawImage(image, 0, 0, size.width, size.height);
            resolve(new Uint8Array(ctx.getImageData(0, 0, size.width, size.height).data));
          } finally {
            URL.revokeObjectURL(url);
          }
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        image.src = url;
      }),
  };
}

function compareCtx(size: { width: number; height: number }, background: string): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size.width, size.height);
  return ctx;
}
