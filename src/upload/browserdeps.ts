// browserdeps.ts — the upload tab's browser adapters for the runner (design
// §6/§7): source reads, export-folder IO, hashing, the raster/preview/pixel
// canvas layer, and the Gemini send with the configured timeout. The canvas
// layer is injectable so UI tests drive the REAL pipeline with deterministic
// fakes (RULE 8) — exactly how the Generate tab injects its composite.

import type { DirHandleLike } from "../lib/fs";
import { browserDecode, browserRasterize, subtleSha256 } from "../lib/upraster";
import { browserPixelDeps } from "../lib/upsvgo";
import { sendGeminiRequest, type GeminiRequest } from "../lib/geminireq";
import type { GeminiConfig } from "../lib/gemconfig";
import { openExportDir, scanExportDir } from "./exportio";
import type { RunnerDeps } from "./runner";

/** The canvas-dependent trio the runner needs (injectable for tests). */
export interface CanvasDeps {
  rasterize: RunnerDeps["raster"]["rasterize"];
  renderPixels: RunnerDeps["pixels"]["renderPixels"];
  /** Base64 PNG of the icon preview sent to the metadata provider. */
  previewPng(svg: string): Promise<string | null>;
}

export interface DepsArgs {
  root: DirHandleLike;
  gemini: GeminiConfig;
  apiKey: string;
  onState?: RunnerDeps["onState"];
  cancelled?: RunnerDeps["cancelled"];
  canvas?: CanvasDeps;
}

/** Builds the runner's dependency bundle from the picked root. */
export function makeRunnerDeps(a: DepsArgs): RunnerDeps {
  const canvas = a.canvas ?? browserCanvasDeps();
  return {
    readSource: (relPath) => readSourceFile(a.root, relPath),
    scanExport: (dirPath) => scanExportDir(a.root, dirPath),
    openExport: (dirPath) => openExportDir(a.root, dirPath),
    hashText: async (text) => subtleSha256(new TextEncoder().encode(text)),
    raster: { rasterize: canvas.rasterize, decode: browserDecode, sha256: subtleSha256 },
    pixels: { renderPixels: canvas.renderPixels },
    renderPreviewPng: canvas.previewPng,
    sendMetadata: (request) => sendGeminiRequest({
      request, fetch: (url, init) => window.fetch(url, init), timeoutMs: a.gemini.timeoutS * 1000,
    }),
    now: () => new Date().toISOString(),
    onState: a.onState,
    cancelled: a.cancelled,
  };
}

/** Reads one file below the root by its scan-relative path. */
async function readSourceFile(root: DirHandleLike, relPath: string): Promise<string | null> {
  try {
    let dir = root;
    const parts = relPath.split("/");
    const name = parts.pop() as string;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    const file = await (await dir.getFileHandle(name)).getFile();
    return await file.text();
  } catch {
    return null;
  }
}

/** The real browser canvas layer: JPEG encode, pixel compare, PNG preview. */
export function browserCanvasDeps(): CanvasDeps {
  return {
    // One rest-destructured parameter: the signature itself is RunnerDeps'.
    rasterize: (...[svg, width, height, background, quality]) =>
      browserRasterize({ svg, width, height, background, quality }),
    renderPixels: (svg, which) =>
      browserPixelDeps({ width: 256, height: 256 }, "#ffffff").renderPixels(svg, which),
    previewPng: (svg) => renderPreviewPng(svg, 512),
  };
}

const PREVIEW_BACKGROUND = "#ffffff";

/** Renders the SVG small and returns its PNG data URL payload (base64 only). */
async function renderPreviewPng(svg: string, size: number): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (ctx === null) return resolve(null);
        ctx.fillStyle = PREVIEW_BACKGROUND;
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, 0, 0, size, size);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

export type { GeminiRequest };
