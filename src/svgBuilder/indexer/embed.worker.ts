// embed.worker.ts — the icon indexer's model worker. Loads CLIP (image) and
// MiniLM (text) once from huggingface.co through the vendored transformers.js,
// keeps the model files in IndexedDB (so they download ONCE, even from file://),
// and turns one rendered icon + its text into two normalised vectors. Inference
// runs here so the UI never freezes. No icon data ever leaves this worker.
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env, pipeline, type ProgressInfo } from "../../vendor/transformers/transformers.min.js";
import { modelCache } from "./modelcache";
import type { WorkerReply, WorkerRequest } from "./protocol";

type ImageModel = { processor: (i: RawImage) => Promise<Record<string, unknown>>; model: (i: Record<string, unknown>) => Promise<{ image_embeds: { data: Float32Array } }> };
type TextModel = (t: string, o: { pooling: "mean"; normalize: boolean }) => Promise<{ data: Float32Array }>;

let loading: Promise<{ image: ImageModel; text: TextModel }> | null = null;
const post = (m: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

function configure(): void {
  env.allowLocalModels = false;
  env.useBrowserCache = false;
  env.useCustomCache = true;
  env.customCache = modelCache();
  env.backends.onnx.wasm.numThreads = 1;
}

function load(imageId: string, textId: string) {
  configure();
  const progress_callback = (p: ProgressInfo) => post({ type: "progress", file: p.file ?? p.name ?? "", status: p.status, loaded: p.loaded ?? 0, total: p.total ?? 0 });
  return (async () => {
    const [processor, model, text] = await Promise.all([
      AutoProcessor.from_pretrained(imageId, { progress_callback }),
      CLIPVisionModelWithProjection.from_pretrained(imageId, { dtype: "q8", progress_callback }),
      pipeline("feature-extraction", textId, { dtype: "q8", progress_callback }),
    ]);
    return { image: { processor, model } as ImageModel, text: text as unknown as TextModel };
  })();
}

function normalise(v: Float32Array): Float32Array {
  const n = Math.hypot(...v);
  return n === 0 ? v : v.map((x) => x / n);
}

async function embed(req: Extract<WorkerRequest, { type: "embed" }>): Promise<void> {
  const models = await (loading ??= load(req.imageModel, req.textModel));
  const image = req.rgba === null ? null : await (async () => {
    const raw = new RawImage(new Uint8ClampedArray(req.rgba as ArrayBuffer), req.width, req.height, 4);
    const out = await models.image.model(await models.image.processor(raw));
    return normalise(Float32Array.from(out.image_embeds.data));
  })();
  const text = req.text === null ? null : normalise(Float32Array.from((await models.text(req.text, { pooling: "mean", normalize: true })).data));
  const transfer = [image?.buffer, text?.buffer].filter((b): b is ArrayBuffer => b instanceof ArrayBuffer);
  post({ type: "result", id: req.id, image, text }, transfer);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type === "load") {
    (loading ??= load(req.imageModel, req.textModel)).then(() => post({ type: "ready" }), (e: unknown) => post({ type: "error", id: null, message: messageOf(e) }));
    return;
  }
  embed(req).catch((e: unknown) => post({ type: "error", id: req.id, message: messageOf(e) }));
};

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
