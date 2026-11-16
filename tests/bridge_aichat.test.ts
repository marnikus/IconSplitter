// @vitest-environment node
// The helper's /aichat routes end to end over loopback HTTP: capability block,
// request refusals, progress and cancel. No browser is launched (every request
// here is refused or idle before a page would be opened).

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SERVER = path.resolve("tools/bridge/server.mjs");
const live: ChildProcess[] = [];

async function startHelper(): Promise<string> {
  const child = spawn(process.execPath, [SERVER, "--port", "0", "--no-update-watch"], {
    env: { ...process.env, INKSCAPE_PATH: "/nonexistent/inkscape", AICHAT_PROFILE: path.resolve("coverage/.aichat-test-profile") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  live.push(child);
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("helper timeout")), 8000);
    child.stdout?.on("data", (chunk: Buffer) => {
      const match = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(chunk.toString());
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`exited ${code}`)); });
  });
}

afterEach(() => { for (const child of live.splice(0)) child.kill(); });

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("/aichat routes", () => {
  it("reports the capability on /health without launching a browser", async () => {
    const base = await startHelper();
    const health = await (await fetch(`${base}/health`)).json();
    expect(health.aichat).toMatchObject({ ready: true, headed: true });
    expect(health.aichat.profile).toContain(".aichat-test-profile");
  });

  it("refuses a foreign chat URL and a missing image before opening anything", async () => {
    const base = await startHelper();
    const foreign = await post(`${base}/aichat/send`, { url: "https://example.com/c/1", prompt: "x", image: "AAAA" });
    expect(foreign.status).toBe(400);
    expect((await foreign.json()).reason).toMatch(/chatgpt\.com/);
    const noImage = await post(`${base}/aichat/send`, { url: "https://chatgpt.com/c/1", prompt: "x", image: "" });
    expect(noImage.status).toBe(400);
  });

  it("answers progress and cancel while idle", async () => {
    const base = await startHelper();
    const progress = await (await fetch(`${base}/aichat/progress?sessionKey=s1`)).json();
    expect(progress).toEqual({ ok: true, busy: false, progress: null });
    const cancel = await (await post(`${base}/aichat/cancel`, { sessionKey: "s1" })).json();
    expect(cancel).toEqual({ ok: true, cancelled: false });
    expect((await post(`${base}/aichat/close`, {})).status).toBe(200);
  });
});
