// @vitest-environment node
// A timeout in one upload must never take the helper down: the run has to keep
// going and answer the app, and a stray rejected promise must not kill the window
// the user is watching.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — the helper's modules ship untyped to the app build
import { createReplyReader } from "../tools/bridge/ftps/reply.mjs";
import { installCrashGuards } from "../tools/bridge/guards.mjs";

const SERVER = path.resolve("tools/bridge/server.mjs");
const SUPERVISE = path.resolve("tools/bridge/supervise.mjs");

const children: ChildProcess[] = [];
const servers: Server[] = [];
const stale: (() => void)[] = [];
const temps: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill("SIGKILL");
    await new Promise((r) => (child.exitCode === null ? child.once("exit", r) : r(null)));
  }
  for (const drop of stale.splice(0)) drop();
  for (const server of servers.splice(0)) await new Promise((r) => { server.close(() => r(null)); server.unref?.(); });
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A TCP server that greets once and then says nothing: every reply times out. */
async function silentFtpsServer(): Promise<number> {
  const sockets: { destroy: () => void }[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    socket.write("220-stalled\r\n220 ready\r\n");
  });
  stale.push(() => { for (const socket of sockets) socket.destroy(); });
  servers.push(server);
  const listening = new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => {
    resolve((server.address() as { port: number }).port);
  }));
  return await listening;
}

describe("one timed-out upload never kills the helper", () => {
  it("keeps the reply reader's waiters independent and settles each once", async () => {
    const control = new EventEmitter();
    const reader = createReplyReader(control as never);
    // Two concurrent reads: the first must time out without stealing the second.
    const first = reader.nextReply(30);
    const second = reader.nextReply(400);
    setTimeout(() => control.emit("data", Buffer.from("220 still here\r\n")), 80);
    await expect(first).rejects.toMatchObject({ code: "timeout" });
    expect((await second).code).toBe(220);
  });

  it("answers a stalled FTPS server with a failure and stays up", async () => {
    const port = await silentFtpsServer();
    const child = spawn(process.execPath, [SERVER, "--port", "0", "--no-update-watch"], {
      env: { ...process.env, BRIDGE_TMP: tempDir("guard-") }, stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    const log: string[] = [];
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`helper timeout:\n${log.join("")}`)), 10_000);
      const onChunk = (chunk: Buffer) => {
        log.push(chunk.toString());
        const m = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log.join(""));
        if (m !== null) { clearTimeout(timer); resolve(m[1]); }
      };
      child.stdout?.on("data", onChunk);
      child.stderr?.on("data", onChunk);
    });
    const cfg = { protocol: "ftps-explicit", host: "127.0.0.1", port, remoteDir: "/", timeoutMs: 800,
      tlsPolicy: "none", username: "u", password: "p" };
    const upload = await fetch(`${url}/ftps/upload`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-ftps-config": Buffer.from(JSON.stringify(cfg)).toString("base64") },
      body: new Uint8Array([1, 2, 3]),
    });
    const body = await upload.json() as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(String(body.reason)).toMatch(/timed out|timeout/i);
    // The helper is still there for the next file.
    const health = await fetch(`${url}/health`);
    expect(health.status).toBe(200);
    expect(child.exitCode).toBeNull();
  }, 25_000);
});

describe("cancelling a stalled upload does not end the run", () => {
  it("survives the reply timer that fires after /ftps/close", async () => {
    // The reported crash: `/ftps/close` answered 200, then the stalled reply timer
    // fired 30 s later and Node killed the helper with it.
    const port = await silentFtpsServer();
    const child = spawn(process.execPath, [SERVER, "--port", "0", "--no-update-watch"], {
      env: { ...process.env, BRIDGE_TMP: tempDir("cancel-") }, stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    const log: string[] = [];
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`helper timeout:\n${log.join("")}`)), 10_000);
      const onChunk = (chunk: Buffer) => {
        log.push(chunk.toString());
        const m = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log.join(""));
        if (m !== null) { clearTimeout(timer); resolve(m[1]); }
      };
      child.stdout?.on("data", onChunk);
      child.stderr?.on("data", onChunk);
    });
    const cfg = { protocol: "ftps-explicit", host: "127.0.0.1", port, remoteDir: "/", timeoutMs: 700,
      tlsPolicy: "none", username: "someone", password: "secret-pass", sessionKey: "run-1" };
    const upload = fetch(`${url}/ftps/upload`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-ftps-config": Buffer.from(JSON.stringify(cfg)).toString("base64") },
      body: new Uint8Array([1, 2, 3]),
    }).catch(() => null);
    await new Promise((r) => setTimeout(r, 120));
    const closed = await fetch(`${url}/ftps/close`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionKey: "run-1" }),
    });
    expect(closed.status).toBe(200);
    await upload;
    // Past the reply timeout the old helper would be dead.
    await new Promise((r) => setTimeout(r, 900));
    expect(child.exitCode).toBeNull();
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect(log.join("")).not.toMatch(/FtpsError|Node\.js v/);
  }, 25_000);
});

describe("a stray error is logged, not fatal", () => {
  it("survives an unhandled rejection and an uncaught exception", async () => {
    const target = new EventEmitter() as unknown as NodeJS.Process;
    const seen: string[] = [];
    const uninstall = installCrashGuards(target, { onError: (kind, err) => seen.push(`${kind}:${(err as Error).message}`), log: () => undefined });
    (target as unknown as EventEmitter).emit("unhandledRejection", new Error("boom"), Promise.resolve());
    (target as unknown as EventEmitter).emit("uncaughtException", new Error("bad socket"));
    uninstall();
    expect(seen).toEqual(["rejection:boom", "exception:bad socket"]);
  });

  it("keeps a real process alive after an abandoned promise rejects", async () => {
    const dir = tempDir("guard-live-");
    const script = path.join(dir, "worker.mjs");
    writeFileSync(script, [
      `import { installCrashGuards } from ${JSON.stringify(path.resolve("tools/bridge/guards.mjs"))};`,
      "installCrashGuards(process, { log: (line) => console.log(`guard: ${line}`) });",
      "Promise.reject(new Error('abandoned upload timer'));",
      "setTimeout(() => { console.log('alive'); }, 200);",
    ].join("\n"));
    const child = spawn(process.execPath, [script], { stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let out = "";
    child.stdout?.on("data", (c) => { out += c.toString(); });
    const code = await new Promise<number | null>((r) => child.once("exit", r));
    expect(code).toBe(0);
    expect(out).toContain("alive");
    expect(out).toContain("abandoned upload timer");
  }, 15_000);
});

describe("the supervisor says why it stopped", () => {
  it("gives up on a crash loop with a readable reason", async () => {
    const dir = tempDir("sup-loop-");
    const child = path.join(dir, "crash.mjs");
    writeFileSync(child, "process.exit(1);\n");
    const sup = spawn(process.execPath, [SUPERVISE, "--child", child, "--max-restarts", "1"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(sup);
    let out = "";
    sup.stdout?.on("data", (c) => { out += c.toString(); });
    sup.stderr?.on("data", (c) => { out += c.toString(); });
    await new Promise((r) => sup.once("exit", r));
    expect(out).toMatch(/the helper stopped \(1\)/);
    expect(out).toMatch(/stopping after 1 restart/);
  }, 20_000);
});
