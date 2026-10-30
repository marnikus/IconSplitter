// @vitest-environment node
// Getty Images web-upload rules and loopback client: what may be sent, how the
// staged header is built, and how failures are scrubbed before they reach the
// UI. No browser and no live account is involved.

import { describe, expect, it, vi } from "vitest";
import {
  GETTY_WEB_ERROR_HINT, GETTY_WEB_SUBMISSION_TYPE, gettyWebBatchName, gettyWebCreatedDate,
  gettyWebFileOrder, isGettyWebPreset, validateGettyWebTasks,
} from "../src/lib/stockupload/gettyweb";
import { gettyWebProgress } from "../src/lib/stockupload/gettyprogress";
import {
  closeBridgeGettyWeb, finishBridgeGettyWeb, probeBridgeGettyWeb, testBridgeGettyWeb, uploadBridgeGettyWeb,
} from "../src/lib/stockupload/gettywebclient";
import { GETTY_WEB_PRESET } from "../src/lib/stockupload/presets";
import type { PlannedTransfer, SkippedFormat } from "../src/lib/stockupload/plan";

const CREDS = { username: "contributor@example.com", password: "GettyPass!42" };

function task(format: PlannedTransfer["format"], fileName: string, itemId = "item-1"): PlannedTransfer {
  return { itemId, stem: fileName.replace(/\.[^.]+$/, ""), targetId: "getty-images-web", targetName: "Getty Images (web upload)", format, fileName, relPath: `export/${fileName}`, estimatedBytes: 10 };
}

const JPEG = task("raster", "icon_a.jpeg");
const EPS = task("eps", "icon_a.eps");

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function decodeHeader(value: string): Record<string, unknown> {
  return JSON.parse(atob(value)) as Record<string, unknown>;
}

describe("Getty web upload rules", () => {
  it("builds a dated batch name from the plan size", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    expect(gettyWebBatchName(now, 1)).toBe("IconSplitter 2026-10-29 (1 icon)");
    expect(gettyWebBatchName(now, 3)).toBe("IconSplitter 2026-10-29 (3 icons)");
    expect(gettyWebBatchName(now, 3).length).toBeLessThanOrEqual(60);
  });

  it("writes Date Created the way Getty's drawer shows it", () => {
    // The captured drawer holds "10/10/2026 00:00:00 +0000", not an ISO date.
    expect(gettyWebCreatedDate(new Date("2026-10-10T15:20:00Z"))).toBe("10/10/2026 00:00:00 +0000");
    expect(gettyWebCreatedDate(new Date("2026-01-05T00:00:00Z"))).toBe("01/05/2026 00:00:00 +0000");
    expect(gettyWebCreatedDate(new Date("2026-12-31T23:59:59Z"))).toBe("12/31/2026 00:00:00 +0000");
  });

  it("accepts a JPEG plus optional matching EPS and puts the JPEG first", () => {
    expect(validateGettyWebTasks([JPEG], [])).toBeNull();
    expect(validateGettyWebTasks([EPS, JPEG], [])).toBeNull();
    expect(gettyWebFileOrder([EPS, JPEG]).map((t) => t.fileName)).toEqual(["icon_a.jpeg", "icon_a.eps"]);
  });

  it("refuses PNG-only, SVG, ZIP, mismatched stems, and vanished files", () => {
    expect(validateGettyWebTasks([task("raster", "icon_a.png")], [])).toContain("JPEG per icon");
    expect(validateGettyWebTasks([JPEG, task("svg", "icon_a.svg")], [])).toContain("SVG and ZIP are not supported");
    expect(validateGettyWebTasks([JPEG, task("eps", "other.eps")], [])).toContain("matching filenames");
    const missing: SkippedFormat[] = [{ itemId: "item-1", stem: "icon_a", format: "eps" }];
    expect(validateGettyWebTasks([JPEG, EPS], missing)).toContain("missing on disk");
  });

  it("only treats the getty-web protocol as a web upload preset", () => {
    expect(isGettyWebPreset(GETTY_WEB_PRESET)).toBe(true);
    expect(GETTY_WEB_PRESET.host).toBe("esp.gettyimages.com");
    expect(GETTY_WEB_PRESET.remoteDir).toBe("/contribute");
    expect(isGettyWebPreset({ ...GETTY_WEB_PRESET, protocol: "esp-https" })).toBe(false);
  });
});

describe("Getty web loopback client", () => {
  it("sends both files in order with credentials only inside the loopback header", async () => {
    const reply = {
      ok: true, batchId: "68445204", accepted: ["icon_a.jpeg", "icon_a.eps"],
      completed: true, completion: { clicked: true, label: "Complete", confirmed: true },
      metadata: [{ name: "icon_a.jpeg", status: "saved", fields: { title: true, description: true, keywords: true } }],
    };
    const fetchImpl = vi.fn(async () => jsonResponse(200, reply));
    const metadata = { title: "Star", description: "A star icon", keywords: ["star", "icon"] };
    const result = await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [{ files: [{ name: "icon_a.jpeg", bytes: new Uint8Array([1, 2, 3]) }, { name: "icon_a.eps", bytes: new Uint8Array([4, 5]) }], metadata }],
      batchName: "IconSplitter 2026-10-29 (1 icon)", submissionType: GETTY_WEB_SUBMISSION_TYPE,
      complete: true, fetchImpl,
    });
    // `failed` is normalized even when the helper reports none.
    expect(result).toEqual({ ...reply, failed: [] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:47391/getty-web/upload");
    const header = decodeHeader((init.headers as Record<string, string>)["x-getty-web-config"]);
    expect(header).toMatchObject({
      protocol: "getty-web", host: "esp.gettyimages.com", username: CREDS.username, password: CREDS.password,
      batchName: "IconSplitter 2026-10-29 (1 icon)", submissionType: GETTY_WEB_SUBMISSION_TYPE,
      complete: true,
      icons: [{ metadata, files: [{ name: "icon_a.jpeg", bytes: 3 }, { name: "icon_a.eps", bytes: 2 }] }],
    });
  });

  it("sends every icon of the run in one request, all pairs at once", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      ok: true, batchId: "68565609", accepted: ["icon_a.jpeg", "icon_a.eps", "icon_b.jpeg", "icon_b.eps"],
      completed: false, completion: null, metadata: [],
    }));
    const icon = (stem: string, size: number) => ({
      files: [{ name: `${stem}.jpeg`, bytes: new Uint8Array(size) }, { name: `${stem}.eps`, bytes: new Uint8Array(size) }],
      metadata: { title: stem, description: "", keywords: [] },
    });
    await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [icon("icon_a", 3), icon("icon_b", 2)],
      batchName: "IconSplitter 2026-10-29 (2 icons)", submissionType: GETTY_WEB_SUBMISSION_TYPE,
      sessionKey: "run-7", fetchImpl,
    });
    // One call for the whole run: no per-icon request can stop after the first pair.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const header = decodeHeader((init.headers as Record<string, string>)["x-getty-web-config"]);
    expect(header.icons).toHaveLength(2);
    expect(header).toMatchObject({ sessionKey: "run-7", complete: false });
    expect((init.body as Blob).size).toBe(10);
  });

  it("scrubs a password echoed by the helper and keeps the failure code", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { ok: false, code: "auth", reason: `bad login ${CREDS.password}` }));
    const result = await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [{ files: [{ name: "icon_a.jpeg", bytes: new Uint8Array([1]) }] }],
      batchName: "b", submissionType: GETTY_WEB_SUBMISSION_TYPE, fetchImpl,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("auth");
      expect(result.reason).not.toContain(CREDS.password);
      expect(result.reason).toContain("••••••••");
    }
  });

  it("reports cancellation and an unreachable helper distinctly", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const cancelled = await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [{ files: [{ name: "icon_a.jpeg", bytes: new Uint8Array([1]) }] }],
      batchName: "b", submissionType: GETTY_WEB_SUBMISSION_TYPE, fetchImpl: vi.fn(async () => { throw abort; }),
    });
    expect(cancelled).toEqual({ ok: false, code: "cancelled", reason: "upload cancelled" });

    const down = await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [{ files: [{ name: "icon_a.jpeg", bytes: new Uint8Array([1]) }] }],
      batchName: "b", submissionType: GETTY_WEB_SUBMISSION_TYPE, fetchImpl: vi.fn(async () => { throw new Error("ECONNREFUSED"); }),
    });
    expect(down.ok).toBe(false);
    if (!down.ok) {
      expect(down.code).toBe("helper-down");
      expect(down.reason).toContain("run_ftp_bridge.bat");
    }
  });

  it("says how big the batch was when the helper drops the connection", async () => {
    // A 209-icon run saw only "cannot reach the local helper" — the helper was
    // there all along and had refused the size. The reason now carries the size.
    const twoMB = new Uint8Array(1024 * 1024);
    const dropped = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    const result = await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [
        { files: [{ name: "icon_a.jpeg", bytes: twoMB }, { name: "icon_a.eps", bytes: twoMB }] },
        { files: [{ name: "icon_b.jpeg", bytes: twoMB }] },
      ],
      batchName: "b", submissionType: GETTY_WEB_SUBMISSION_TYPE, fetchImpl: dropped,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("helper-down");
      // 3 MB of staged bytes, named as such, plus the way out.
      expect(result.reason).toContain("3.0 MB");
      expect(result.reason).toContain("GETTY_WEB_MAX_BYTES");
      expect(result.reason).toContain("run_ftp_bridge.bat");
    }
  });

  it("reports an answer that is not JSON with its HTTP status, not as a dead helper", async () => {
    // The helper's own 413 body must never be read as "the helper is not running".
    const plain = vi.fn(async () => new Response("payload too large", { status: 413 }));
    const result = await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [{ files: [{ name: "icon_a.jpeg", bytes: new Uint8Array([1]) }] }],
      batchName: "b", submissionType: GETTY_WEB_SUBMISSION_TYPE, fetchImpl: plain,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("bad-request");
      expect(result.reason).toContain("HTTP 413");
      expect(result.reason).not.toContain("cannot reach the local helper");
    }
  });

  it("reads the helper's own Getty byte cap, so batches are sized to it", async () => {
    const advertises = vi.fn(async () => jsonResponse(200, {
      gettyWeb: { ready: true, browser: "found", maxBytes: 32 * 1024 * 1024 },
    }));
    expect(await probeBridgeGettyWeb("http://127.0.0.1:47391", advertises))
      .toEqual({ ok: true, maxBytes: 32 * 1024 * 1024 });
    // An older helper says nothing about its limits: the app then assumes the small cap.
    const silent = vi.fn(async () => jsonResponse(200, { gettyWeb: { ready: true, browser: "found" } }));
    expect(await probeBridgeGettyWeb("http://127.0.0.1:47391", silent)).toEqual({ ok: true });
  });

  it("probes the helper for the Getty web capability and a browser", async () => {
    const okFetch = vi.fn(async () => jsonResponse(200, { gettyWeb: { ready: true, browser: "found" } }));
    expect(await probeBridgeGettyWeb("http://127.0.0.1:47391", okFetch)).toEqual({ ok: true });

    const noBrowser = vi.fn(async () => jsonResponse(200, { gettyWeb: { ready: true, browser: "missing" } }));
    const missing = await probeBridgeGettyWeb("http://127.0.0.1:47391", noBrowser);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toContain("Chrome");

    const outdated = vi.fn(async () => jsonResponse(200, { ftps: { ready: true } }));
    const old = await probeBridgeGettyWeb("http://127.0.0.1:47391", outdated);
    expect(old.ok).toBe(false);
    if (!old.ok) expect(old.reason).toContain("restart run_ftp_bridge.bat");

    const offline = vi.fn(async () => { throw new Error("refused"); });
    const down = await probeBridgeGettyWeb("http://127.0.0.1:47391", offline);
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.reason).toContain(GETTY_WEB_ERROR_HINT.slice(0, 10));
  });

  it("tests the sign-in and closes the pooled session through their own routes", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return url.endsWith("/getty-web/test") ? jsonResponse(200, { ok: true, signedIn: true }) : jsonResponse(200, { ok: true });
    }) as unknown as typeof fetch;
    expect(await testBridgeGettyWeb("http://127.0.0.1:47391", GETTY_WEB_PRESET, CREDS, fetchImpl)).toEqual({ ok: true });
    await closeBridgeGettyWeb("http://127.0.0.1:47391", "run-123", fetchImpl);
    expect(calls).toEqual(["http://127.0.0.1:47391/getty-web/test", "http://127.0.0.1:47391/getty-web/close"]);
  });
});

describe("Getty web live progress", () => {
  it("reads the per-file counts the helper reports for a running upload", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      ok: true, progress: { phase: "uploading", total: 4, uploaded: 3, failed: 1, listed: 4, reloads: 1 },
    }));
    const progress = await gettyWebProgress("http://127.0.0.1:47391", "run 7", fetchImpl as unknown as typeof fetch);
    expect(progress).toEqual({ phase: "uploading", total: 4, uploaded: 3, failed: 1, listed: 4, reloads: 1 });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("http://127.0.0.1:47391/getty-web/progress?sessionKey=run%207");
  });

  it("says nothing when the helper has no progress route or is gone", async () => {
    const missing = vi.fn(async () => jsonResponse(404, { ok: false }));
    expect(await gettyWebProgress("http://127.0.0.1:47391", "run-7", missing as unknown as typeof fetch)).toBeNull();
    const down = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    expect(await gettyWebProgress("http://127.0.0.1:47391", "run-7", down as unknown as typeof fetch)).toBeNull();
  });

  it("never counts a file Getty rejected, and names it with its id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      ok: true, batchId: "2302569283",
      accepted: ["icon_a.jpeg", "icon_a.eps"],
      failed: [{ name: "icon-megaphone.eps", id: "FSPID51446" }],
      completed: false, completion: null, metadata: [],
    }));
    const result = await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [{ files: [{ name: "icon_a.jpeg", bytes: new Uint8Array([1]) }] }],
      batchName: "b", submissionType: GETTY_WEB_SUBMISSION_TYPE, fetchImpl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accepted).toEqual(["icon_a.jpeg", "icon_a.eps"]);
      expect(result.failed).toEqual([{ name: "icon-megaphone.eps", id: "FSPID51446" }]);
    }
  });
});

describe("Getty web finish call", () => {
  it("asks the helper to submit the run's one batch with the same session key", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      ok: true, batchId: "68565609", accepted: [], completed: true,
      completion: { clicked: true, label: "SUBMIT", confirmed: true }, metadata: [],
    }));
    const result = await finishBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS, sessionKey: "run-7",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: true, batchId: "68565609", completed: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:47391/getty-web/finish");
    expect(new Headers(init.headers).get("content-type")).toContain("text/plain");
    const header = decodeHeader(String(init.body));
    expect(header).toMatchObject({ protocol: "getty-web", username: CREDS.username, sessionKey: "run-7" });
    expect(String(init.body)).not.toContain("GettyPass!42");
  });

  it("keeps the helper's refusal (a missing contribution) as the honest reason", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(504, {
      ok: false, code: "timeout", reason: "Getty lists 1 of 2 contribution(s) — not completing the batch",
    }));
    const result = await finishBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS, sessionKey: "run-7",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    if (!result.ok) expect(result.reason).toContain("1 of 2 contribution(s)");
  });

  it("names an outdated helper when the finish route is missing", async () => {
    const fetchImpl = vi.fn(async () => new Response("not found", { status: 404 }));
    const result = await finishBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS, sessionKey: "run-7",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, code: "bad-request" });
    if (!result.ok) expect(result.reason).toContain("restart run_ftp_bridge.bat");
  });
});

describe("Getty web batch requests", () => {
  it("asks the helper for a new batch, so a run can exceed one batch's 100 icons", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      ok: true, batchId: "9", accepted: ["icon_a.jpeg"], completed: false, completion: null, metadata: [],
    }));
    await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [{ files: [{ name: "icon_a.jpeg", bytes: new Uint8Array([1]) }] }],
      batchName: "IconSplitter 2026-10-30 2/3 (1 icon)", submissionType: GETTY_WEB_SUBMISSION_TYPE,
      newBatch: true, sessionKey: "run-8", fetchImpl,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const header = decodeHeader((init.headers as Record<string, string>)["x-getty-web-config"]);
    expect(header).toMatchObject({ newBatch: true, batchName: "IconSplitter 2026-10-30 2/3 (1 icon)" });
  });

  it("keeps what a failed batch had already accepted, rejected and listed", async () => {
    // A 100-icon chunk that timed out after 95 cards: re-sending the whole chunk
    // would upload those 95 a second time.
    const fetchImpl = vi.fn(async () => jsonResponse(504, {
      ok: false, code: "timeout",
      reason: "Getty listed 98 of 100 file(s) in 180 s",
      accepted: ["icon_a.jpeg", "icon_a.eps"],
      failed: [{ name: "icon_b.eps", id: "FSPID9" }],
      seen: ["icon_a.eps", "icon_b.eps"],
    }));
    const result = await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [{ files: [{ name: "icon_a.jpeg", bytes: new Uint8Array([1]) }] }],
      batchName: "b", submissionType: GETTY_WEB_SUBMISSION_TYPE, fetchImpl,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("timeout");
      expect(result.accepted).toEqual(["icon_a.jpeg", "icon_a.eps"]);
      expect(result.failed).toEqual([{ name: "icon_b.eps", id: "FSPID9" }]);
      expect(result.seen).toEqual(["icon_a.eps", "icon_b.eps"]);
    }
  });

  it("leaves those lists out when the helper could not report them", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { ok: false, code: "browser", reason: "no browser" }));
    const result = await uploadBridgeGettyWeb({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      icons: [{ files: [{ name: "icon_a.jpeg", bytes: new Uint8Array([1]) }] }],
      batchName: "b", submissionType: GETTY_WEB_SUBMISSION_TYPE, fetchImpl,
    });
    expect(result).toEqual({ ok: false, code: "browser", reason: "no browser" });
  });
});
