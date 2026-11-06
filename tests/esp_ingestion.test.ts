// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { uploadEspContribution } from "../tools/bridge/esp/ingestion.mjs";

const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const MiB = 1024 * 1024;

describe("Getty ESP multipart ingestion protocol", () => {
  it("uploads EPS and JPEG as one contribution, with signed 10 MiB chunks and independent completion", async () => {
    const eps = Buffer.alloc(10 * MiB + 3, 17);
    const jpg = Buffer.from("jpeg");
    const calls: Array<{ kind: string; path?: string; body?: any; bytes?: Buffer; headers?: any }> = [];
    const sendApi = async (method: string, path: string, body?: any) => {
      calls.push({ kind: method, path, body });
      if (path === "/esp/ingestion/v1/contributions") return { contribution_id: 123 };
      if (path.includes("authorize_chunk")) return { upload_url: "https://bucket.example/part?signature=private", headers: { "x-amz-signed": "yes" } };
      return {};
    };
    const sendChunk = async (url: string, bytes: Buffer, headers: any) => {
      calls.push({ kind: "chunk", path: url, bytes, headers });
      return `etag-${calls.filter((c) => c.kind === "chunk").length}`;
    };
    const id = await uploadEspContribution({ batchId: "batch-1", bucket: "oregon", vector: { name: "icon.eps", bytes: eps }, raster: { name: "icon.jpg", bytes: jpg }, sendApi, sendChunk });
    expect(id).toBe(123);
    expect(calls[0].body).toEqual({ submission_batch_id: "batch-1", upload_bucket: "oregon", file_name: "icon.eps", mime_type: "application/postscript", raster_file_name: "icon.jpg", raster_mime_type: "image/jpeg" });
    const auth = calls.filter((c) => c.path?.includes("authorize_chunk"));
    expect(auth).toHaveLength(3);
    const query = auth.map((c) => new URL(c.path!, "https://api.example").searchParams);
    expect(query.map((p) => [p.get("part_number"), p.get("raster_file"), p.get("encrypted_payload")])).toEqual([
      ["1", "false", hash(eps.subarray(0, 10 * MiB))], ["2", "false", hash(eps.subarray(10 * MiB))], ["1", "true", hash(jpg)],
    ]);
    expect(calls.filter((c) => c.kind === "chunk").map((c) => c.bytes?.length)).toEqual([10 * MiB, 3, 4]);
    expect(calls.filter((c) => c.kind === "PUT").map((c) => c.body)).toEqual([
      { id: 123, etags: [{ part_number: "1", etag: "etag-1" }, { part_number: "2", etag: "etag-2" }], raster_file: false },
      { id: 123, etags: [{ part_number: "1", etag: "etag-3" }], raster_file: true },
    ]);
  });

  it("stops without completion when storage rejects a part, and rejects non-HTTPS signed URLs", async () => {
    const completions: unknown[] = [];
    const base = { batchId: "1", bucket: "oregon", raster: { name: "a.jpg", bytes: Buffer.from("x") } };
    const sendApi = async (method: string, _path: string, body?: any) => {
      if (method === "POST") return { contribution_id: "x" };
      if (method === "PUT") { completions.push(body); return {}; }
      return { upload_url: "http://bucket.example/part", headers: {} };
    };
    await expect(uploadEspContribution({ ...base, sendApi, sendChunk: async () => "x" })).rejects.toThrow(/HTTPS/);
    expect(completions).toEqual([]);
    await expect(uploadEspContribution({ ...base, sendApi: async (m: string, p: string, b: any) => p.includes("authorize_chunk") ? { upload_url: "https://bucket.example/part", headers: {} } : sendApi(m, p, b), sendChunk: async () => { throw new Error("storage failed"); } })).rejects.toThrow("storage failed");
    expect(completions).toEqual([]);
  });
  it("requires an ETag and propagates completion errors rather than reporting success", async () => {
    const input = { batchId: "1", bucket: "oregon", raster: { name: "a.jpg", bytes: Buffer.from("x") } };
    const calls: string[] = [];
    const api = async (method: string) => {
      calls.push(method);
      if (method === "POST") return { contribution_id: 42 };
      if (method === "GET") return { upload_url: "https://bucket.example/p", headers: {} };
      throw new Error("completion failed");
    };
    await expect(uploadEspContribution({ ...input, sendApi: api, sendChunk: async () => "" })).rejects.toThrow(/ETag/);
    expect(calls).toEqual(["POST", "GET"]);
    calls.length = 0;
    await expect(uploadEspContribution({ ...input, sendApi: api, sendChunk: async () => '"etag"' })).rejects.toThrow(/completion failed/);
    expect(calls).toEqual(["POST", "GET", "PUT"]);
  });

});
