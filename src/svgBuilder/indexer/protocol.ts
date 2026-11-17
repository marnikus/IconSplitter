// protocol.ts — messages between the indexer and its model worker.

export type WorkerRequest =
  | { type: "load"; imageModel: string; textModel: string }
  | { type: "embed"; id: string; imageModel: string; textModel: string;
      /** RGBA pixels of the in-memory PNG render, or null to reuse an existing image vector. */
      rgba: ArrayBuffer | null; width: number; height: number; text: string | null };

export type WorkerReply =
  | { type: "progress"; file: string; status: string; loaded: number; total: number }
  | { type: "ready" }
  | { type: "result"; id: string; image: Float32Array | null; text: Float32Array | null }
  | { type: "error"; id: string | null; message: string };
