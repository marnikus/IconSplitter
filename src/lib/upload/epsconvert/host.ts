// host.ts — CliHost implementations (I-60/I-61): unavailable (no spawn),
// and loopback HTTP to 127.0.0.1 only. SVG bytes never leave this machine.

import { INKSCAPE_UNAVAILABLE } from "./inkscape";
import type { CliHost, ConverterId, InkscapeJob, InkscapeRun, ProbeResult } from "./types";

export const LOOPBACK_ORIGIN = "http://127.0.0.1:7788";

const DOWN = "Inkscape CLI is not running on this machine";

export const unavailableHost: CliHost = {
  probe: (id) => Promise.resolve(id === "builtin" ? { ok: true, reason: "in-process" } : { ok: false, reason: INKSCAPE_UNAVAILABLE }),
  runInkscape: () => Promise.resolve({ ok: false, reason: INKSCAPE_UNAVAILABLE }),
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Browser host. `origin` must be 127.0.0.1 (I-61); anything else throws. */
export function loopbackHost(fetchImpl: FetchLike = fetch, origin = LOOPBACK_ORIGIN): CliHost {
  assertLoopback(origin);
  return {
    probe: (id) => probeAt(id, fetchImpl, origin),
    runInkscape: (job, signal) => runAt(job, fetchImpl, origin, signal),
  };
}

function assertLoopback(origin: string): void {
  if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Inkscape host must be 127.0.0.1");
}

async function probeAt(id: ConverterId, fetchImpl: FetchLike, origin: string): Promise<ProbeResult> {
  if (id === "builtin") return { ok: true, reason: "in-process" };
  try {
    const res = await fetchImpl(`${origin}/health`);
    const body = await res.json() as { ok?: boolean; inkscape?: { version?: string }; reason?: string };
    if (body.ok === true) return { ok: true, reason: "ready", version: body.inkscape?.version };
    return { ok: false, reason: typeof body.reason === "string" ? body.reason : DOWN };
  } catch {
    return { ok: false, reason: DOWN };
  }
}

async function runAt(job: InkscapeJob, fetchImpl: FetchLike, origin: string, signal?: AbortSignal): Promise<InkscapeRun> {
  try {
    const res = await fetchImpl(`${origin}/eps`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-IconSplitter-Cli": "1" },
      body: JSON.stringify({ svg: job.svgText, title: job.title }),
      signal,
    });
    return parseEpsBody(await res.json());
  } catch (error) {
    return { ok: false, reason: isAbort(error) ? "interrupted" : DOWN };
  }
}

function parseEpsBody(body: unknown): InkscapeRun {
  if (!isRecord(body)) return { ok: false, reason: DOWN };
  if (body.ok === true && typeof body.eps === "string") {
    return { ok: true, eps: body.eps, version: typeof body.version === "string" ? body.version : "", argv: [] };
  }
  return { ok: false, reason: typeof body.reason === "string" ? body.reason : DOWN };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}
