// RULE 8 — the genuine EPS writer runs for real: a documented SVG subset →
// real PostScript (%!PS-Adobe-3.0 EPSF-3.0 + %%BoundingBox, y flipped, px→pt),
// and anything outside the subset fails honestly (design §2.5) — never a
// renamed PS/PDF, never a guessed rendering.
import { describe, expect, it } from "vitest";
import { verifyEps, verifyEpsDocument, writeEps } from "../src/lib/upload/eps";
import { hiResBox, runPostScript } from "./helpers/psrun";

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const PREPARED = `<svg ${NS} viewBox="0 0 92.8 92.8" width="92.8" height="92.8">`
  + `<rect x="0" y="0" width="92.8" height="92.8" fill="#ffffff"/>`
  + `<g transform="translate(-3.6 -3.6)"><rect x="10" y="10" width="80" height="80" fill="#000000"/></g></svg>`;

const art = (inner: string) => `<svg ${NS} viewBox="0 0 100 100">${inner}</svg>`;

describe("writeEps — a genuine EPS document", () => {
  it("emits an EPS 10 document: the DSC comments Illustrator 10 expects", () => {
    const result = writeEps(PREPARED, "#ffffff", { title: "fog_AI.eps", createdAt: "2026-10-08T00:00:00.000Z" });
    if (!result.ok) throw new Error(result.reason);
    const head = result.eps.split("%%EndComments")[0];
    expect(head.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(head).toContain("%%Creator: IconSplitter");
    expect(head).toContain("%%Title: fog_AI.eps");
    expect(head).toContain("%%CreationDate: 2026-10-08T00:00:00.000Z");
    expect(head).toContain("%%BoundingBox: 0 0 70 70");
    expect(head).toContain("%%HiResBoundingBox: 0 0 69.6 69.6");
    expect(head).toContain("%%DocumentData: Clean7Bit");
    expect(head).toContain("%%LanguageLevel: 3");
    // the DSC structure around the body, in order
    const order = ["%%EndComments", "%%BeginProlog", "%%EndProlog", "%%BeginSetup", "%%EndSetup"];
    let at = -1;
    for (const part of order) {
      const next = result.eps.indexOf(part);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    expect(result.eps.trimEnd().endsWith("%%EOF")).toBe(true);
    // and it still passes our own verifier
    expect(verifyEps(result.eps).ok).toBe(true);
  });

  it("escapes a title so a stray parenthesis cannot break the DSC string", () => {
    const result = writeEps(PREPARED, "#ffffff", { title: "odd (1) name.eps" });
    if (!result.ok) throw new Error(result.reason);
    expect(result.eps).toContain("%%Title: odd \\(1\\) name.eps");
  });

  it("verifies the EPS 10 markers, not just the header", () => {
    const doc = (body: string) => `%!PS-Adobe-3.0 EPSF-3.0\n${body}\n%%EOF\n`;
    expect(verifyEps(doc("%%BoundingBox: 0 0 1 1")).errors).toContain("missing %%HiResBoundingBox");
    expect(verifyEps(doc("%%BoundingBox: 0 0 1 1\n%%HiResBoundingBox: 0 0 1 1")).errors)
      .toContain("missing %%DocumentData: Clean7Bit");
    expect(verifyEps(doc("%%BoundingBox: 0 0 1 1\n%%HiResBoundingBox: 0 0 1 1\n%%DocumentData: Clean7Bit")).errors)
      .toContain("missing %%LanguageLevel: 3");
    const full = doc("%%BoundingBox: 0 0 1 1\n%%HiResBoundingBox: 0 0 1 1\n%%DocumentData: Clean7Bit\n%%LanguageLevel: 3");
    expect(verifyEps(full).ok).toBe(true);
  });

  it("verifyEpsDocument — the converter-neutral gate (2026-10-09): header, a LanguageLevel, a bounding box, %%EOF — no EPS 10 markers", () => {
    const cairo = "%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: cairo 1.18.0\n%%LanguageLevel: 2\n%%BoundingBox: 0 0 70 70\n%%EndComments\n0 0 moveto fill\n%%EOF\n";
    expect(verifyEpsDocument(cairo)).toEqual({ ok: true, errors: [], boundingBox: { llx: 0, lly: 0, urx: 70, ury: 70 } });
    expect(verifyEps(cairo).ok).toBe(false); // the strict EPS 10 check is the built-in writer's own contract
    expect(verifyEpsDocument("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 1 1\n%%EOF\n").errors).toEqual(["missing %%LanguageLevel"]);
    expect(verifyEpsDocument("<html>").ok).toBe(false);
    const own = writeEps(PREPARED, "#ffffff");
    expect(own.ok && verifyEpsDocument(own.eps).ok).toBe(true); // the built-in passes both
  });

  it("emits the EPS header, an integer bounding box and %%EOF", () => {
    const result = writeEps(PREPARED, "#ffffff");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(result.ok && result.eps).toContain("%%BoundingBox: 0 0 70 70"); // 92.8 px · 0.75 pt, ceiled
    expect(result.eps.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(result.boundingBox).toEqual({ llx: 0, lly: 0, urx: 70, ury: 70 });
    expect(result.shapes).toBe(2); // background rect + artwork rect
  });

  it("flips y and scales px→pt once, up front — as ONE array, the only operand concat accepts", () => {
    // the 2026-10-09 report: bare numbers before `concat` raised /typecheck in
    // Illustrator, and the program stopped before the artwork
    const result = writeEps(PREPARED, "#ffffff");
    expect(result.ok && result.eps).toContain("[0.75 0 0 -0.75 0 69.6] concat");
    const lines = (result.ok ? result.eps : "").split("\n").filter((l) => l.endsWith("concat"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/^\[(-?\d+(\.\d+)? ){5}-?\d+(\.\d+)?\] concat$/);
  });

  it("runs: the subset interpreter executes the document and every painted point is inside the box", () => {
    const result = writeEps(PREPARED, "#ffffff");
    const run = runPostScript(result.ok ? result.eps : "");
    expect(run.errors).toEqual([]);
    const box = hiResBox(result.ok ? result.eps : "");
    expect(run.painted).not.toBeNull();
    expect(run.painted!.llx).toBeGreaterThanOrEqual(box.llx - 1e-6);
    expect(run.painted!.lly).toBeGreaterThanOrEqual(box.lly - 1e-6);
    expect(run.painted!.urx).toBeLessThanOrEqual(box.urx + 1e-6);
    expect(run.painted!.ury).toBeLessThanOrEqual(box.ury + 1e-6);
  });

  it("fills INSIDE gsave/grestore before it strokes, so a filled-and-stroked shape keeps its stroke", () => {
    // `fill` consumes the current path: `… fill … stroke` stroked nothing
    const result = writeEps(art(`<rect x="1" y="1" width="4" height="4" fill="#f00" stroke="#000" stroke-width="1"/>`), "#ffffff");
    expect(result.ok && result.eps).toContain("gsave 1 0 0 setrgbcolor fill grestore 0 0 0 setrgbcolor 1 setlinewidth");
    expect(runPostScript(result.ok ? result.eps : "").errors).toEqual([]);
  });

  it("emits nothing for a shape that paints nothing (fill none, stroke none)", () => {
    const result = writeEps(art(`<rect x="0" y="0" width="100" height="100" fill="none" stroke="none"/><rect x="1" y="1" width="4" height="4" fill="#000"/>`), "#ffffff");
    expect(result.ok && result.shapes).toBe(1);
    expect((result.ok ? result.eps : "").match(/newpath/g)?.length).toBe(1);
  });

  it("paints fills with setrgbcolor inside gsave/concat/grestore", () => {
    const result = writeEps(PREPARED, "#ffffff");
    expect(result.ok && result.eps).toContain("1 1 1 setrgbcolor fill"); // the white background
    expect(result.ok && result.eps).toContain("0 0 0 setrgbcolor fill"); // the black artwork
    expect(result.ok && result.eps).toContain("gsave");
    expect(result.ok && result.eps).toContain("[1 0 0 1 -3.6 -3.6] concat"); // the wrapper translate replayed
  });

  it("replays transforms through the CTM", () => {
    const result = writeEps(art(`<g transform="scale(2)"><rect x="1" y="1" width="4" height="4" fill="#000"/></g>`), "#ffffff");
    expect(result.ok && result.eps).toContain("[2 0 0 2 0 0] concat");
  });

  it("passes verifyEps", () => {
    const result = writeEps(PREPARED, "#ffffff");
    expect(result.ok && verifyEps(result.eps).ok).toBe(true);
  });
});

describe("writeEps — strokes, dashes, caps, joins", () => {
  it("emits the full stroke setup", () => {
    const src = art(`<rect x="10" y="10" width="20" height="20" fill="none" stroke="#ff0000"`
      + ` stroke-width="2" stroke-dasharray="4 2" stroke-linecap="round" stroke-linejoin="bevel"/>`);
    const result = writeEps(src, "#ffffff");
    expect(result.ok && result.eps).toContain("1 0 0 setrgbcolor");
    expect(result.ok && result.eps).toContain("2 setlinewidth");
    expect(result.ok && result.eps).toContain("[4 2] 0 setdash");
    expect(result.ok && result.eps).toContain("1 setlinecap");
    expect(result.ok && result.eps).toContain("2 setlinejoin");
    expect(result.ok && result.eps).toContain("stroke");
  });

  it("flattens fill-opacity onto the export background (PostScript has no alpha)", () => {
    const src = art(`<rect x="10" y="10" width="20" height="20" fill="#000000" fill-opacity="0.5"/>`);
    const result = writeEps(src, "#ffffff");
    expect(result.ok && result.eps).toContain("0.5 0.5 0.5 setrgbcolor fill");
  });

  it("accepts named and rgb() paints", () => {
    const named = writeEps(art(`<rect x="1" y="1" width="4" height="4" fill="red"/>`), "#ffffff");
    expect(named.ok && named.eps).toContain("1 0 0 setrgbcolor fill");
    const rgb = writeEps(art(`<rect x="1" y="1" width="4" height="4" fill="rgb(0, 128, 255)"/>`), "#ffffff");
    expect(rgb.ok && rgb.eps).toContain("0 0.502 1 setrgbcolor fill");
  });
});

describe("writeEps — the shape subset", () => {
  it("circle and ellipse → four cubics each (ONE outline model, 2026-10-08); line/polyline/polygon → lines", () => {
    const src = art(`<circle cx="10" cy="10" r="4" fill="#000"/>`
      + `<ellipse cx="30" cy="10" rx="6" ry="3" fill="#000"/>`
      + `<line x1="1" y1="1" x2="9" y2="9" stroke="#000"/>`
      + `<polyline points="1,1 5,5 9,1" fill="none" stroke="#000"/>`
      + `<polygon points="1,1 5,5 9,1" fill="#000"/>`);
    const result = writeEps(src, "#ffffff");
    expect(result.ok && result.shapes).toBe(5);
    expect(result.ok && result.eps).not.toContain(" arc"); // the circle is the same four-cubic split as the ellipse
    expect(result.ok && result.eps).toContain("14 10 moveto 14 12.209 12.209 14 10 14 curveto");
    expect(result.ok && result.eps.match(/curveto/g)).toHaveLength(8); // circle + ellipse
    expect(result.ok && result.eps).toContain("closepath"); // the polygon
  });

  it("replays path data: lines, curves, quads and arcs", () => {
    const src = art(`<path d="M10 10 L20 20 H30 V5 Z M40 40 l5 5 m10 0 h10 v10 z" fill="#000"/>`
      + `<path d="M0 0 C1 1 2 2 3 3 S5 5 6 6 Q7 7 8 8 T10 10" fill="none" stroke="#000"/>`
      + `<path d="M10 10 A5 5 0 0 1 20 20" fill="none" stroke="#000"/>`);
    const result = writeEps(src, "#ffffff");
    expect(result.ok && result.shapes).toBe(3);
    expect(result.ok && result.eps).toContain("10 10 moveto");
    expect(result.ok && result.eps).toContain("closepath");
    expect(result.ok && result.eps.match(/curveto/g)?.length).toBeGreaterThanOrEqual(4); // C/S/Q/T + the arc
    expect(result.ok && result.eps).not.toContain(" arc"); // SVG arcs replay as cubics, never guessed
  });

  it("skips display:none subtrees and embedded metadata", () => {
    const src = art(`<title>t</title><desc>d</desc><metadata/>`
      + `<g display="none"><rect x="1" y="1" width="4" height="4" fill="#000"/></g>`
      + `<rect x="1" y="1" width="4" height="4" fill="#000"/>`);
    const result = writeEps(src, "#ffffff");
    expect(result.ok && result.shapes).toBe(1);
  });
});

describe("writeEps — a rounded <rect> is written, exactly, and the fix is reported (2026-10-08)", () => {
  it("draws the corners as curveto arcs and names the automatic fix on the ok result", () => {
    const result = writeEps(art(`<rect x="1" y="1" width="8" height="4" rx="1" fill="#000"/>`), "#ffffff");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.eps.match(/curveto/g)).toHaveLength(4);
    expect(result.eps.match(/lineto/g)).toHaveLength(4);
    expect(result.shapes).toBe(1);
    expect(result.fixes).toEqual(["1 rounded <rect> written as an exact path outline"]);
    const two = writeEps(art(`<rect x="1" y="1" width="4" height="4" rx="1" fill="#000"/><rect x="5" y="5" width="2" height="2" ry="0.5" fill="#000"/>`), "#ffffff");
    if (two.ok) expect(two.fixes).toEqual(["2 rounded <rect>s written as exact path outlines"]);
  });

  it("a plain package reports no fix", () => {
    const result = writeEps(PREPARED, "#ffffff");
    if (result.ok) expect(result.fixes).toEqual([]);
  });
});

describe("writeEps — honest subset failures (never guessed)", () => {
  const failures: [string, string][] = [
    ["gradient fill", `<rect x="1" y="1" width="4" height="4" fill="url(#g)"/>`],
    ["text", `<text x="1" y="9">hi</text>`],
    ["image", `<image href="x.png" x="0" y="0" width="4" height="4"/>`],
    ["use", `<use href="#x"/>`],
    ["CSS style", `<style>.a{fill:red}</style><rect class="a" x="1" y="1" width="4" height="4"/>`],
    ["group opacity", `<g opacity="0.5"><rect x="1" y="1" width="4" height="4" fill="#000"/></g>`],
    ["currentColor", `<rect x="1" y="1" width="4" height="4" fill="currentColor"/>`],
    ["clip path", `<rect x="1" y="1" width="4" height="4" fill="#000" clip-path="url(#c)"/>`],
  ];

  it.each(failures)("fails honestly: %s", (_name, inner) => {
    const result = writeEps(art(inner), "#ffffff");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("fails on a non-SVG document and a missing viewBox", () => {
    expect(writeEps("<html/>", "#ffffff").ok).toBe(false);
    expect(writeEps(`<svg ${NS}><rect x="1" y="1" width="4" height="4" fill="#000"/></svg>`, "#ffffff").ok).toBe(false);
  });

  it("fails on an unsupported background paint", () => {
    const result = writeEps(PREPARED, "url(#g)");
    expect(result.ok).toBe(false);
  });
});

describe("verifyEps", () => {
  it("accepts a written document and rejects broken ones", () => {
    const result = writeEps(PREPARED, "#ffffff");
    expect(result.ok && verifyEps(result.eps)).toEqual({ ok: true, errors: [], boundingBox: { llx: 0, lly: 0, urx: 70, ury: 70 } });
    expect(verifyEps("not postscript").errors.length).toBeGreaterThan(0);
    expect(verifyEps("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 1 1\n").errors).toContain("missing %%EOF");
    expect(verifyEps("%!PS-Adobe-3.0 EPSF-3.0\n%%EOF\n").errors[0]).toContain("BoundingBox");
  });

  it("rejects a document that is not executable — the bare-number concat (2026-10-09)", () => {
    const result = writeEps(PREPARED, "#ffffff");
    const broken = (result.ok ? result.eps : "").replace("[0.75 0 0 -0.75 0 69.6] concat", "0.75 0 0 -0.75 0 69.6 concat");
    const verdict = verifyEps(broken);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors).toContain("line 13: concat expects an array, found number"); // no %%CreationDate in this fixture: the CTM is line 13 (14 in the report);
  });
});
