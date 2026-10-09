// upload_epsconv.test.ts — the EPS converter registry (2026-10-09, design
// docs/archive/2026-10-09-eps-converters-inkscape-expand/design.md D1): ONE
// table the drop list, the EPS stage and the record read; the built-in entry
// IS writeEps; the Inkscape entry is a thin client to the local helper whose
// every failure is named with its fix. RULE 8: the real converters run — the
// helper is replaced by a fake fetch only where the network is unavoidable.
import { describe, expect, it, vi } from "vitest";
import { writeEps } from "../src/lib/upload/eps";
import { CONVERTERS, CONVERTER_IDS, converterOf, parseConverterId } from "../src/lib/upload/epsconv/registry";
import { verifyEps } from "../src/lib/upload/eps";
import { DEFAULT_BRIDGE_URL, parseBridgeConfig, serializeBridgeConfig } from "../src/lib/upload/epsconv/bridgeconfig";
import type { ConverterDeps } from "../src/lib/upload/epsconv/types";

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const PREPARED = `<svg ${NS} viewBox="0 0 92.8 92.8" width="92.8" height="92.8">`
  + `<rect x="10" y="10" width="72.8" height="72.8" fill="#000000"/></svg>`;
const EPS_OK = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 70 70\n%%EndComments\nnewpath 0 0 moveto fill\n%%EOF\n";

function deps(fetchImpl: ConverterDeps["fetch"], bridgeUrl = DEFAULT_BRIDGE_URL): ConverterDeps {
  return { bridgeUrl, fetch: fetchImpl };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("the registry — one table", () => {
  it("lists the two converters in order, with labels the drop list shows", () => {
    expect(CONVERTER_IDS).toEqual(["builtin", "inkscape"]);
    expect(CONVERTERS.builtin.label).toBe("Built-in (PostScript subset)");
    expect(CONVERTERS.inkscape.label).toBe("Inkscape CLI (local helper)");
    for (const id of CONVERTER_IDS) expect(converterOf(id).id).toBe(id);
  });

  it("parseConverterId: a known id passes, anything else is the built-in (RULE 13)", () => {
    expect(parseConverterId("inkscape")).toBe("inkscape");
    expect(parseConverterId("builtin")).toBe("builtin");
    expect(parseConverterId("ghostscript")).toBe("builtin");
    expect(parseConverterId(undefined)).toBe("builtin");
    expect(parseConverterId(3)).toBe("builtin");
  });
});

describe("the built-in converter IS writeEps", () => {
  it("returns the same bytes as writeEps, is always available, and names its writer", async () => {
    const direct = writeEps(PREPARED, "#ffffff", { title: "fog.eps", createdAt: "2026-10-09T00:00:00.000Z" });
    const viaRegistry = await CONVERTERS.builtin.convert(
      { svg: PREPARED, background: "#ffffff", title: "fog.eps", createdAt: "2026-10-09T00:00:00.000Z" },
      deps(() => Promise.reject(new Error("never called"))),
    );
    expect(direct.ok).toBe(true);
    expect(viaRegistry.ok).toBe(true);
    if (!direct.ok || !viaRegistry.ok) return;
    expect(viaRegistry.eps).toBe(direct.eps);
    expect(viaRegistry.writer).toBe("builtin-subset-2");
    expect(viaRegistry.fixes).toEqual([]);
    expect(await CONVERTERS.builtin.probe(deps(() => Promise.reject(new Error("never"))))).toEqual({ ok: true, version: "builtin-subset-2" });
  });

  it("the built-in converter verifies its own program before it answers ok (I-61)", async () => {
    const out = await CONVERTERS.builtin.convert(
      { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="4" height="4" fill="#f00" stroke="#000"/></svg>`, background: "#ffffff", title: "x.eps" },
      deps(() => Promise.reject(new Error("never"))), undefined,
    );
    expect(out.ok).toBe(true);
    expect(out.ok && verifyEps(out.eps).ok).toBe(true);
    expect(out.ok && out.eps).toContain("] concat");
  });

  it("an honest subset failure stays a failure, with its reason", async () => {
    const out = await CONVERTERS.builtin.convert(
      { svg: `<svg ${NS} viewBox="0 0 10 10"><text x="1" y="5">hi</text></svg>`, background: "#ffffff", title: "t.eps" },
      deps(() => Promise.reject(new Error("never"))),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("<text>");
  });
});

describe("the Inkscape converter — a client to the local helper", () => {
  it("probe: helper up + Inkscape found → ok with the version", async () => {
    const f = vi.fn(async (url: string) => { expect(url).toBe(`${DEFAULT_BRIDGE_URL}/health`); return json({ ok: true, inkscape: { found: true, version: "1.3.2", path: "C:\\x\\inkscape.com" } }); });
    expect(await CONVERTERS.inkscape.probe(deps(f))).toEqual({ ok: true, version: "1.3.2" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("probe: helper not reachable → the reason names the URL and the fix names the bat file", async () => {
    const state = await CONVERTERS.inkscape.probe(deps(() => Promise.reject(new TypeError("Failed to fetch")), "http://127.0.0.1:47391"));
    expect(state.ok).toBe(false);
    if (state.ok) return;
    expect(state.reason).toBe("the Inkscape helper is not reachable at http://127.0.0.1:47391");
    expect(state.fix).toContain("run_inkscape_bridge.bat");
  });

  it("probe: helper up but Inkscape not installed → a normal state with the install fix (RULE 4)", async () => {
    const state = await CONVERTERS.inkscape.probe(deps(async () => json({
      ok: true, inkscape: { found: false, version: null, path: null, fix: "install Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH" },
    })));
    expect(state).toEqual({
      ok: false, reason: "the Inkscape helper is running but Inkscape was not found",
      fix: "install Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH",
    });
  });

  it("convert: POSTs the SVG and returns the EPS with the writer from the helper's version header", async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(PREPARED);
      expect((init?.headers as Record<string, string>)["content-type"]).toBe("image/svg+xml");
      return new Response(EPS_OK, { status: 200, headers: { "content-type": "application/postscript", "x-inkscape-version": "1.3.2" } });
    });
    const out = await CONVERTERS.inkscape.convert({ svg: PREPARED, background: "#ffffff", title: "fog.eps" }, deps(f));
    expect(out).toEqual({ ok: true, eps: EPS_OK, writer: "inkscape-cli@1.3.2", fixes: [] });
    expect(String(f.mock.calls[0][0])).toBe(`${DEFAULT_BRIDGE_URL}/convert/eps`);
  });

  it("convert: a helper error carries the helper's reason; an unreachable helper carries the fix; a non-EPS body is refused", async () => {
    const failed = await CONVERTERS.inkscape.convert({ svg: PREPARED, background: "#fff", title: "t" }, deps(async () => json({ reason: "inkscape exited with code 1" }, 502)));
    expect(failed).toEqual({ ok: false, reason: "inkscape exited with code 1" });
    const down = await CONVERTERS.inkscape.convert({ svg: PREPARED, background: "#fff", title: "t" }, deps(() => Promise.reject(new TypeError("Failed to fetch"))));
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.reason).toContain("not reachable");
    const junk = await CONVERTERS.inkscape.convert({ svg: PREPARED, background: "#fff", title: "t" }, deps(async () => new Response("<html>", { status: 200 })));
    expect(junk).toEqual({ ok: false, reason: "the helper answered with something that is not an EPS" });
  });

  it("convert: the run's abort signal reaches fetch (RULE 7)", async () => {
    const ctl = new AbortController();
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBe(ctl.signal);
      return new Response(EPS_OK, { status: 200 });
    });
    await CONVERTERS.inkscape.convert({ svg: PREPARED, background: "#fff", title: "t" }, deps(f), ctl.signal);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("the helper URL — device config, validated on read (RULE 13)", () => {
  it("defaults to the loopback port, keeps a valid http(s) origin, refuses the rest", () => {
    expect(DEFAULT_BRIDGE_URL).toBe("http://127.0.0.1:47391");
    expect(parseBridgeConfig(null)).toEqual({ url: DEFAULT_BRIDGE_URL });
    expect(parseBridgeConfig({ url: "http://localhost:5000/" })).toEqual({ url: "http://localhost:5000" }); // no trailing slash
    expect(parseBridgeConfig({ url: "ftp://x" })).toEqual({ url: DEFAULT_BRIDGE_URL });
    expect(parseBridgeConfig({ url: 12 })).toEqual({ url: DEFAULT_BRIDGE_URL });
    expect(JSON.parse(serializeBridgeConfig({ url: "http://localhost:5000" }))).toEqual({ url: "http://localhost:5000" });
  });
});
