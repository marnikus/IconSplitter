import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildSync } from "esbuild";
import { decodeFrames, encodeFrame } from "../../companion/src/framing";
import { NativeClient } from "../../src/lib/stockupload/native";
import { isRecord } from "../../src/lib/isrecord";
export async function nativeProcess(mode = "normal") {
  const directory = await mkdtemp(join(tmpdir(), "stock-process-")), script = join(directory, "fixture.cjs");
  buildSync({ entryPoints: [resolve("tests/helpers/nativefixture.ts")], bundle: true, platform: "node", format: "cjs", outfile: script });
  const child = spawn(process.execPath, [script, directory, mode], { stdio: "pipe" });
  const messages: ((message: unknown) => void)[] = [], disconnects: ((event: unknown) => void)[] = [];
  let rest: Buffer = Buffer.alloc(0), stderr = "", rss = 0;
  const exited = new Promise<number | null>(resolve => child.once("exit", code => { disconnects.forEach(fn => fn(undefined)); resolve(code); }));
  child.stderr.on("data", b => { stderr += String(b); });
  child.stdout.on("data", chunk => {
    const decoded = decodeFrames(Buffer.concat([rest, chunk])); rest = decoded.rest;
    for (const raw of decoded.messages) {
      if (isRecord(raw) && typeof raw.rss === "number") rss = Math.max(rss, raw.rss);
      messages.forEach(fn => fn(raw));
    }
  });
  const port = { postMessage: (message: unknown) => { child.stdin.write(encodeFrame(message)); }, disconnect: () => { child.stdin.end(); },
    onMessage: { addListener: (fn: (message: unknown) => void) => { messages.push(fn); } }, onDisconnect: { addListener: (fn: (event: unknown) => void) => { disconnects.push(fn); } } };
  const client = new NativeClient(port);
  return { client, child, directory, exited, rss: () => rss, stderr: () => stderr,
    dispose: async () => { client.close(); await exited; await rm(directory, { recursive: true, force: true }); } };
}
