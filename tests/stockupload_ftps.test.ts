// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FtpsTransport } from "../companion/src/ftp";
import { ftpsFixture } from "./helpers/ftpsfixture";
const credentials = async () => ({ username: "fixture-user", password: "fixture-password" });
describe("real local explicit FTPS", () => {
  it("verifies TLS on both channels, transfers exact bytes and refuses a remote collision", async () => {
    const ftp = await ftpsFixture(), dir = await mkdtemp(join(tmpdir(), "stock-test-"));
    const path = join(dir, "payload"), bytes = Buffer.from([255, 216, 0, 1, 255, 217]); await writeFile(path, bytes);
    const file = { id: "id", name: "local.jpg", kind: "jpg" as const, bytes: bytes.length, hash: "a".repeat(64) };
    const client = new FtpsTransport(credentials, () => undefined, { host: ftp.host, port: ftp.port, secureOptions: { ca: ftp.cert } });
    try {
      expect(await client.upload(path, file)).toEqual({ state: "transferred" });
      expect(ftp.files.get(file.name)).toEqual(bytes);
      expect((await client.upload(path, file)).state).toBe("failed");
      expect(ftp.commands.filter(v => v === "STOR")).toHaveLength(1);
      expect(ftp.commands).toContain("AUTH"); expect(ftp.commands).toContain("PROT");
    } finally { client.close(); await ftp.close(); await rm(dir, { recursive: true, force: true }); }
  });
  it("refuses an untrusted certificate before authenticating; never falls back to plaintext", async () => {
    const ftp = await ftpsFixture(), client = new FtpsTransport(credentials, () => undefined, { host: ftp.host, port: ftp.port });
    try {
      expect((await client.upload("not-opened", { id: "x", name: "x.jpg", kind: "jpg", bytes: 3, hash: "a".repeat(64) })).state).toBe("failed");
      expect(ftp.commands).not.toContain("PASS"); expect(ftp.files.size).toBe(0);
    } finally { client.close(); await ftp.close(); }
  });
}, 15_000);

import { NativeJob } from "../companion/src/job";
import { createHash } from "node:crypto";
import { minimalJpeg } from "./helpers/minijpeg";
it("runs the real staging-to-FTPS path and preserves uncertainty when the final reply is lost", async () => {
  const ftp = await ftpsFixture({ dropAfterStore: true }), bytes = Buffer.from(minimalJpeg(2400, 2400));
  const transport = new FtpsTransport(credentials, () => undefined, { host: ftp.host, port: ftp.port, secureOptions: { ca: ftp.cert } });
  const file = { id: "x", name: "real.jpg", kind: "jpg" as const, bytes: bytes.length, hash: createHash("sha256").update(bytes).digest("hex") };
  const recorded: string[] = [], job = new NativeJob(transport, async r => { recorded.push(r.state); });
  try {
    await job.begin({ v: 1, job: crypto.randomUUID(), account: "shutterstock", epsReviewed: false, files: [file] }); await job.file(file.id); await job.chunk(0, bytes.toString("base64"));
    expect((await job.send()).state).toBe("uncertain"); expect(recorded).toEqual(["uncertain", "uncertain"]);
    expect(ftp.files.get(file.name)).toEqual(bytes); expect(ftp.commands.filter(c => c === "STOR")).toHaveLength(1);
  } finally { await job.dispose(); await ftp.close(); }
}, 15_000);
