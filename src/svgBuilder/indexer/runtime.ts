// runtime.ts — the indexer's two browser seams: rendering an approved SVG to
// RGBA pixels (an in-memory PNG render, never written to disk) and the model
// worker. Tests replace the runtime with fakes; the worker module is imported
// lazily, only when indexing actually starts.
import { svgDataUrl } from "../../lib/svgvalidate";
import { withIntrinsicSize } from "../../lib/upload/raster";
import { RENDER_BACKGROUND, RENDER_SIZE } from "../../lib/iconIndex/record";

export interface RenderedIcon { rgba: Uint8ClampedArray; width: number; height: number }
export interface EmbedInput { id: string; pixels: RenderedIcon | null; text: string | null }
export interface EmbedOutput { image: Float32Array | null; text: Float32Array | null }
export interface ModelProgress { file: string; loaded: number; total: number }

export interface Embedder {
  /** Downloads (first time) or loads (cached) both models. */
  load(onProgress: (p: ModelProgress) => void): Promise<void>;
  embed(input: EmbedInput): Promise<EmbedOutput>;
  dispose(): void;
}

export interface IndexRuntime {
  createEmbedder(): Promise<Embedder>;
  render(svgText: string): Promise<RenderedIcon>;
}

const DEFAULT_RUNTIME: IndexRuntime = {
  createEmbedder: async () => (await import("./workerEmbedder")).createWorkerEmbedder(),
  render: renderIcon,
};

let current: IndexRuntime = DEFAULT_RUNTIME;

export function indexRuntime(): IndexRuntime {
  return current;
}

/** Test seam: swap the renderer and the embedder; `null` restores the browser runtime. */
export function setIndexRuntime(runtime: IndexRuntime | null): void {
  current = runtime ?? DEFAULT_RUNTIME;
}

/** The approved SVG drawn at 224 × 224 on white — exactly what the image model sees. */
export async function renderIcon(svgText: string): Promise<RenderedIcon> {
  const size = RENDER_SIZE;
  const image = new Image();
  image.src = svgDataUrl(withIntrinsicSize(svgText, size, size));
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no canvas context for the icon render");
  ctx.fillStyle = RENDER_BACKGROUND;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, 0, 0, size, size);
  return { rgba: ctx.getImageData(0, 0, size, size).data, width: size, height: size };
}
