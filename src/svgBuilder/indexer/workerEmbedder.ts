/// <reference types="vite/client" />
// workerEmbedder.ts — the browser Embedder: one inline Web Worker running the
// vendored transformers.js models. Requests are answered one at a time, in order.
import EmbedWorker from "./embed.worker?worker&inline";
import { IMAGE_MODEL, TEXT_MODEL } from "../../lib/iconIndex/record";
import type { WorkerReply, WorkerRequest } from "./protocol";
import type { EmbedInput, EmbedOutput, Embedder, ModelProgress } from "./runtime";

interface Pending { resolve: (o: EmbedOutput) => void; reject: (e: Error) => void }

export function createWorkerEmbedder(): Embedder {
  const worker = new EmbedWorker();
  const pending = new Map<string, Pending>();
  let onProgress: (p: ModelProgress) => void = () => undefined;
  let ready: { resolve: () => void; reject: (e: Error) => void } | null = null;
  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const m = event.data;
    if (m.type === "progress") onProgress({ file: m.file, loaded: m.loaded, total: m.total });
    else if (m.type === "ready") ready?.resolve();
    else if (m.type === "result") { pending.get(m.id)?.resolve({ image: m.image, text: m.text }); pending.delete(m.id); }
    else if (m.id === null) ready?.reject(new Error(m.message));
    else { pending.get(m.id)?.reject(new Error(m.message)); pending.delete(m.id); }
  };
  const send = (req: WorkerRequest, transfer: Transferable[] = []) => worker.postMessage(req, transfer);
  return {
    load: (cb) => new Promise<void>((resolve, reject) => {
      onProgress = cb; ready = { resolve, reject };
      send({ type: "load", imageModel: IMAGE_MODEL, textModel: TEXT_MODEL });
    }),
    embed: (input: EmbedInput) => new Promise<EmbedOutput>((resolve, reject) => {
      pending.set(input.id, { resolve, reject });
      const rgba = input.pixels === null ? null : input.pixels.rgba.slice().buffer;
      send({ type: "embed", id: input.id, imageModel: IMAGE_MODEL, textModel: TEXT_MODEL, rgba,
        width: input.pixels?.width ?? 0, height: input.pixels?.height ?? 0, text: input.text }, rgba === null ? [] : [rgba]);
    }),
    dispose: () => { worker.terminate(); for (const p of pending.values()) p.reject(new Error("indexing stopped")); pending.clear(); },
  };
}
