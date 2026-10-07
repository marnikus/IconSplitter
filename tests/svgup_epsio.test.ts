// svgup_epsio.test.ts — the EPS seam's order of work (merge report §3.2, §9):
// the LOCAL writer answers for the subset icons are made of — offline, with not
// one request — and the configured converter is asked only for the documents the
// writer honestly refuses, with the artboard's real size (the donor sent zero,
// which the report names as a defect). With neither available the stage fails
// with both reasons and writes nothing.
import { describe, expect, it } from "vitest";
import { epsBytes, parseSvgText } from "../src/svgupload/epsio";
import { NO_CONVERTER_REASON, planEps } from "../src/lib/svgupload/eps";
import { ptToPx } from "../src/lib/svgupload/units";

const SQUARE = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"><rect x="0" y="0" width="1000" height="1000" fill="#f0f0f0"/><path d="M 100 100 L 900 100 L 900 900 L 100 900 Z" fill="none" stroke="#101010" stroke-width="0.75"/></svg>`;
const WITH_TEXT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="1" y="2">hi</text><path d="M 0 0 L 24 24" stroke="#000" fill="none" stroke-width="1"/></svg>`;

const REQUEST = { artboard: { w: 1000, h: 1000 }, stroke: { width: ptToPx(2.2), pt: 2.2 } };

interface Fetched {
  url: string;
  body: string;
  init: RequestInit;
}

/** A fetch that records its calls and answers with the given bytes. */
function transport(bytes = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 750 750\n%%EOF\n", status = 200): { fetchImpl: typeof fetch; calls: Fetched[] } {
  const calls: Fetched[] = [];
  const fetchImpl = (async (url: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(url), body: String(init.body ?? ""), init });
    return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => new TextEncoder().encode(bytes).buffer } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("the local writer answers first (§3.2)", () => {
  it("writes a genuine EPS with no request at all", async () => {
    const t = transport();
    const out = await epsBytes(SQUARE, { plan: planEps(true, "http://localhost:8899/eps"), request: REQUEST, title: "Icon", fetchImpl: t.fetchImpl });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.via).toBe("local"); // the converter was configured and NOT used
    expect(t.calls).toHaveLength(0);
    const text = new TextDecoder().decode(out.bytes);
    expect(text.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(text).toContain("%%BoundingBox: 0 0 750 750");
    expect(text).toContain("2.2 setlinewidth");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});

describe("the converter is the fallback, asked with the real size (§9, S60)", () => {
  it("sends the artboard size and the export copy when the subset cannot be drawn", async () => {
    const t = transport();
    const out = await epsBytes(WITH_TEXT, { plan: planEps(true, "http://localhost:8899/eps"), request: REQUEST, title: "Icon", fetchImpl: t.fetchImpl });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.via).toBe("converter");
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].url).toBe("http://localhost:8899/eps");
    const body = JSON.parse(t.calls[0].body) as { format: string; width: number; height: number; svg: string };
    expect(body.format).toBe("eps");
    expect(body.width).toBe(1000); // never zero
    expect(body.height).toBe(1000);
    expect(body.svg).toContain("<text");
  });

  it("reports the converter's HTTP failure without inventing a file", async () => {
    const t = transport("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 1 1\n%%EOF\n", 503);
    const out = await epsBytes(WITH_TEXT, { plan: planEps(true, "http://localhost:8899/eps"), request: REQUEST, title: "Icon", fetchImpl: t.fetchImpl });
    expect(out).toMatchObject({ ok: false, reason: "The EPS converter answered 503." });
  });

  it("states BOTH reasons when the subset refused and no converter is configured", async () => {
    const t = transport();
    const out = await epsBytes(WITH_TEXT, { plan: planEps(true, null), request: REQUEST, title: "Icon", fetchImpl: t.fetchImpl });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain("unsupported for EPS: text");
    expect(out.reason).toContain(NO_CONVERTER_REASON);
    expect(out.reason).toContain("Partial");
    expect(t.calls).toHaveLength(0); // nothing was sent anywhere
  });

  it("refuses a document that is not parsable SVG, naming that", async () => {
    const t = transport();
    const out = await epsBytes("not an svg at all", { plan: planEps(true, null), request: REQUEST, title: "Icon", fetchImpl: t.fetchImpl });
    expect(out).toMatchObject({ ok: false, reason: expect.stringContaining("not a parsable SVG") });
  });
});

describe("parseSvgText — one parse, shared with the writer", () => {
  it("returns the scene for a document and null for junk", () => {
    expect(parseSvgText(SQUARE)?.shapes).toHaveLength(2);
    expect(parseSvgText("<svg not closed")).toBeNull();
  });
});
