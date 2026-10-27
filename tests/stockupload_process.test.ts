// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { nativeProcess } from "./helpers/nativeprocess";
import { minimalJpeg } from "./helpers/minijpeg";
const payload = Buffer.from(minimalJpeg(2400, 2400));
const manifest = () => ({ v: 1, job: crypto.randomUUID(), account: "shutterstock", epsReviewed: false, files: [{ id: "file1", name: "icon.jpg", kind: "jpg", bytes: payload.length, hash: createHash("sha256").update(payload).digest("hex") }] });
async function stage(p: Awaited<ReturnType<typeof nativeProcess>>) {
  await p.client.hello(); await p.client.call("begin", { manifest: manifest() });
  await p.client.call("file", { file: "file1" }); await p.client.call("chunk", { seq: 0, data: payload.toString("base64") });
}
describe("launched native host lifetime", () => {
  it("records a durable terminal receipt, acknowledges and exits without an idle service", async () => {
    const p = await nativeProcess();
    try {
      await stage(p); expect(await p.client.call("send")).toMatchObject({ state: "transferred" });
      await p.client.call("finish"); await p.client.call("ack"); expect(await p.exited).toBe(0);
      const receipts = JSON.parse(await readFile(join(p.directory, "receipts.json"), "utf8")); expect(receipts[0].state).toBe("transferred");
      expect(await readdir(p.directory)).not.toContain("active.lock"); expect(p.stderr()).toBe("");
    } finally { await p.dispose(); }
  });
  it("cancels an in-flight task, preserves uncertainty and releases its owned lock", async () => {
    const p = await nativeProcess("hang");
    try {
      await stage(p); const sending = p.client.call("send").catch(() => undefined);
      // The explicit progress event means the transfer intent is on disk before cancellation.
      const ready = new Promise<void>(resolve => p.child.stdout.on("data", () => { if (p.rss() > 0) resolve(); }));
      await ready; await p.client.call("cancel"); await sending; expect(await p.exited).toBe(0);
      expect(JSON.parse(await readFile(join(p.directory, "receipts.json"), "utf8"))[0].state).toBe("uncertain");
      expect(await readdir(p.directory)).not.toContain("active.lock");
    } finally { await p.dispose(); }
  });
  it("page/channel EOF stops an active host rather than reconnecting or continuing", async () => {
    const p = await nativeProcess();
    try { await p.client.hello(); p.client.close(); expect(await p.exited).toBe(0); expect(p.stderr()).toBe(""); }
    finally { await p.dispose(); }
  });
  it("refuses bad sequence/hash and never calls the transport", async () => {
    const p = await nativeProcess();
    try {
      await p.client.hello(); await p.client.call("begin", { manifest: manifest() }); await p.client.call("file", { file: "file1" });
      await expect(p.client.call("chunk", { seq: 2, data: payload.toString("base64") })).rejects.toThrow();
      expect(await p.exited).toBe(0); expect(p.rss()).toBe(0);
    } finally { await p.dispose(); }
  });
}, 10_000);
