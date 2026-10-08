// RULE 8 — loopback CliHost: health/eps over fake fetch, refused unless
// 127.0.0.1, builtin never fetches, connection refused is unavailable (I-61).
import { describe, expect, it } from "vitest";
import { LOOPBACK_ORIGIN, loopbackHost } from "../src/lib/upload/epsconvert/host";
import type { FetchLike } from "../src/lib/upload/epsconvert/host";

const CAIRO = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 1 1\n0 0 0 setrgbcolor fill\n%%EOF\n";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("loopbackHost", () => {
  it("refuses an origin that is not 127.0.0.1 (I-61)", () => {
    expect(() => loopbackHost(fetch, "https://evil.example")).toThrow(/127\.0\.0\.1/);
    expect(() => loopbackHost(fetch, "http://localhost:7788")).toThrow(/127\.0\.0\.1/);
  });

  it("probe GET /health 200 → ready + version; builtin never fetches", async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(url);
      return jsonResponse({ ok: true, inkscape: { version: "Inkscape 1.3.2", path: "inkscape" } });
    };
    const host = loopbackHost(fetchImpl);
    expect(LOOPBACK_ORIGIN).toBe("http://127.0.0.1:7788");
    await expect(host.probe("builtin")).resolves.toEqual({ ok: true, reason: "in-process" });
    expect(urls).toEqual([]);
    await expect(host.probe("inkscape")).resolves.toEqual({ ok: true, reason: "ready", version: "Inkscape 1.3.2" });
    expect(urls).toEqual([`${LOOPBACK_ORIGIN}/health`]);
  });

  it("connection refused is unavailable, not thrown (RULE 4)", async () => {
    const host = loopbackHost(async () => { throw new TypeError("Failed to fetch"); });
    await expect(host.probe("inkscape")).resolves.toEqual({
      ok: false, reason: "Inkscape CLI is not running on this machine",
    });
  });

  it("POST /eps forwards svg and title and returns the body", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      expect(url).toBe(`${LOOPBACK_ORIGIN}/eps`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ svg: "<svg/>", title: "a.eps" });
      return jsonResponse({ ok: true, eps: CAIRO, version: "1.3.2" });
    };
    const run = await loopbackHost(fetchImpl).runInkscape({ svgText: "<svg/>", title: "a.eps" });
    expect(run).toEqual({ ok: true, eps: CAIRO, version: "1.3.2", argv: [] });
  });
});
