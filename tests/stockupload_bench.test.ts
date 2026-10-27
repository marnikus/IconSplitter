// @vitest-environment node
// Reproducible native IPC/staging measurement, NOT a browser or internet-FTPS benchmark.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { nativeProcess } from "./helpers/nativeprocess";
import { CHUNK_BYTES } from "../src/lib/stockupload/protocol";
const measurements: object[] = [];
describe("real native chunk/staging resource prototype", () => {
  for (const mb of [1, 10, 50, 100]) it(`checks ${mb} MB with ACK backpressure and exits`, async () => {
    const p = await nativeProcess(), payload = Buffer.alloc(mb * 1_000_000, 32);
    payload.write("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 2400 2400\n%%EndComments\n"); payload.write("\n%%EOF\n", payload.length - 7);
    const file = { id: "export/prototype.eps", name: "prototype.eps", kind: "eps", bytes: payload.length, hash: createHash("sha256").update(payload).digest("hex") };
    const start = performance.now();
    try {
      await p.client.hello(); await p.client.call("begin", { manifest: { v: 1, job: crypto.randomUUID(), account: "shutterstock", epsReviewed: true, files: [file] } }); await p.client.call("file", { file: file.id });
      let seq = 0; for (let at = 0; at < payload.length; at += CHUNK_BYTES) await p.client.call("chunk", { seq: seq++, data: payload.subarray(at, at + CHUNK_BYTES).toString("base64") });
      expect(await p.client.call("send")).toMatchObject({ state: "transferred" }); await p.client.call("finish"); await p.client.call("ack"); expect(await p.exited).toBe(0);
      measurements.push({ mb, milliseconds: Math.round(performance.now() - start), hostRssMiB: Math.round(p.rss() / 1024 ** 2), chunks: seq });
      expect(p.rss()).toBeLessThan(128 * 1024 ** 2);
      if (mb === 100) console.log(JSON.stringify(measurements));
    } finally { await p.dispose(); }
  }, 15_000);
});
