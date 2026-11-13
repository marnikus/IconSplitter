// Minimal declarations for the vendored transformers.js browser build — only what the
// SVG builder's indexing worker uses.
export interface ProgressInfo { status: string; file?: string; name?: string; progress?: number; loaded?: number; total?: number }
export interface Tensor { data: Float32Array; dims: number[] }
export interface ModelCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
}
export const env: {
  allowLocalModels: boolean;
  allowRemoteModels: boolean;
  useBrowserCache: boolean;
  useCustomCache: boolean;
  customCache: ModelCache | null;
  backends: { onnx: { wasm: { numThreads?: number; proxy?: boolean } } };
};
export class RawImage {
  constructor(data: Uint8ClampedArray | Uint8Array, width: number, height: number, channels: 1 | 2 | 3 | 4);
}
export interface PretrainedOptions { dtype?: string; progress_callback?: (p: ProgressInfo) => void }
export const AutoProcessor: { from_pretrained(id: string, o?: PretrainedOptions): Promise<(image: RawImage) => Promise<Record<string, unknown>>> };
export const CLIPVisionModelWithProjection: {
  from_pretrained(id: string, o?: PretrainedOptions): Promise<(inputs: Record<string, unknown>) => Promise<{ image_embeds: Tensor }>>;
};
export function pipeline(task: "feature-extraction", model: string, o?: PretrainedOptions):
  Promise<(text: string | string[], o?: { pooling?: "mean" | "cls"; normalize?: boolean }) => Promise<Tensor>>;
