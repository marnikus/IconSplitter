// svgup_eps.test.ts — the EPS output and the honesty around it (design §13; C10).
// The request is explicit: a genuine EPS or none. So: no converter configured is
// a PREFLIGHT refusal that still lets SVG+JPEG through (Partial, not Processed);
// something that is not Encapsulated PostScript is refused rather than renamed;
// a truncated EPS is caught; and the failure wording never pretends the file was
// written.
import { describe, expect, it } from "vitest";
import { NO_CONVERTER_REASON, epsFailureReason, epsRequest, isGenuineEps, planEps, verifyEps } from "../src/lib/svgupload/eps";

const EPS = new TextEncoder().encode(
  "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 3886 3886\n%%HiResBoundingBox: 0 0 3886.0 3886.0\n%%Creator: converter\n%%EndComments\n0 0 moveto 10 10 lineto stroke\n%%EOF\n",
);

const trunc = (bytes: Uint8Array, at: number): Uint8Array => bytes.slice(0, at);

describe("planEps — decided before any work starts", () => {
  it("says nothing when EPS was not asked for", () => {
    expect(planEps(false, null)).toEqual({ requested: false, converter: null, reason: null });
    expect(planEps(false, "https://convert.local/eps")).toEqual({ requested: false, converter: null, reason: null });
  });

  it("refuses clearly when EPS was asked for and no converter is configured", () => {
    const plan = planEps(true, null);
    expect(plan.requested).toBe(true);
    expect(plan.converter).toBeNull();
    expect(plan.reason).toBe(NO_CONVERTER_REASON);
    expect(plan.reason).toContain("Partial");
    expect(plan.reason).toContain("SVG and the JPEG were still exported");
    expect(planEps(true, "   ").reason).toBe(NO_CONVERTER_REASON);
  });

  it("accepts a configured converter and keeps its URL", () => {
    const plan = planEps(true, " https://convert.local/eps ");
    expect(plan.converter).toBe("https://convert.local/eps");
    expect(plan.reason).toBeNull();
  });
});

describe("epsRequest", () => {
  it("posts the export SVG and the artboard size to the converter", () => {
    const req = epsRequest("https://convert.local/eps", "<svg/>", { width: 3886, height: 3886 });
    expect(req.url).toBe("https://convert.local/eps");
    expect(req.init.method).toBe("POST");
    expect(JSON.parse(req.init.body)).toEqual({ format: "eps", width: 3886, height: 3886, svg: "<svg/>" });
    expect(req.init.headers.Accept).toContain("postscript");
  });
});

describe("isGenuineEps — a renamed file can never pass", () => {
  it("accepts a real EPS header with a bounding box", () => {
    expect(isGenuineEps(EPS)).toBe(true);
  });

  it("refuses a PDF, an SVG, an HTML error page and an empty answer", () => {
    const enc = (t: string) => new TextEncoder().encode(t);
    expect(isGenuineEps(enc("%PDF-1.7\n%%BoundingBox: 0 0 1 1"))).toBe(false);
    expect(isGenuineEps(enc("<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>"))).toBe(false);
    expect(isGenuineEps(enc("<html><body>500 Internal Server Error</body></html>"))).toBe(false);
    expect(isGenuineEps(new Uint8Array(0))).toBe(false);
  });

  it("refuses PostScript that declares no bounding box (not Encapsulated)", () => {
    expect(isGenuineEps(new TextEncoder().encode("%!PS-Adobe-3.0\n0 0 moveto\nshowpage\n"))).toBe(false);
  });
});

describe("verifyEps — the check a written EPS must pass", () => {
  it("accepts a complete file", () => {
    expect(verifyEps(EPS)).toEqual({ ok: true, errors: [] });
  });

  it("catches a truncated answer that has the header but no trailer", () => {
    const cut = trunc(EPS, EPS.length - 6);
    const check = verifyEps(cut);
    expect(check.ok).toBe(false);
    expect(check.errors.join(" ")).toContain("%%EOF");
  });

  it("says exactly what was wrong when the answer is not EPS at all", () => {
    const check = verifyEps(new TextEncoder().encode("<svg/>"));
    expect(check.ok).toBe(false);
    expect(check.errors[0]).toContain("%!PS-Adobe");
  });
});

describe("epsFailureReason", () => {
  it("words an unreachable converter distinctly from a rejection", () => {
    expect(epsFailureReason(0, "connection refused")).toContain("could not be reached");
    expect(epsFailureReason(404, "")).toContain("does not accept EPS conversions");
    expect(epsFailureReason(500, "boom")).toContain("failed (500)");
    expect(epsFailureReason(422, "unsupported filter")).toContain("rejected the request (422)");
  });

  it("clips a long body instead of pasting a whole page into the log", () => {
    const reason = epsFailureReason(500, "x".repeat(400));
    expect(reason.length).toBeLessThan(260);
    expect(reason).toContain("…");
  });
});
