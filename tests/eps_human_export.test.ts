// @vitest-environment happy-dom
// eps_human_export.test.ts — the EPS has to read like a drawing program's
// document, not like a script's log (2026-11-19). The review of a delivered
// file found exactly these giveaways, and each is pinned here against a real
// writeEps output: an empty prolog/setup, full-word operators, a `gsave` and an
// identity `[1 0 0 1 0 0] concat` around every single shape, `setlinecap/
// setlinejoin/setmiterlimit` repeated on every stroke, an ISO timestamp where
// DSC wants `D:…`, and a `%%Creator` naming the tab instead of the program.
import { describe, expect, it } from "vitest";
import { writeEps, verifyEpsDocument } from "../src/lib/upload/eps";
import { dscDate } from "../src/lib/upload/epsdoc";
import { hiResBox, runPostScript } from "./helpers/psrun";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const art = (body: string, attrs = "") => `<svg ${NS} viewBox="0 0 40 40" ${attrs}>${body}</svg>`;
const RECT = '<rect x="1" y="1" width="4" height="4" fill="#000"/>';

function epsOf(source: string, opts: { createdAt?: string } = {}): string {
  const out = writeEps(source, "#ffffff", { createdAt: "2026-11-19T00:00:00.000Z", ...opts });
  if (!out.ok) throw new Error(out.reason);
  return out.eps;
}

/** The drawing between `%%EndSetup` and `%%Trailer` — the program a reader runs. */
function bodyOf(eps: string): string {
  const start = eps.indexOf("%%EndSetup");
  const end = eps.indexOf("%%Trailer");
  return eps.slice(start, end < 0 ? eps.length : end);
}

describe("the EPS header reads like a document", () => {
  const eps = epsOf(art(RECT));

  it("names the program, one title, and a DSC timestamp", () => {
    expect(eps).toContain("%%Creator: IconSplitter\n");
    expect(eps).not.toContain("(SVG to upload)"); // the tab name is our paperwork, not the program's
    expect(eps).toContain("%%CreationDate: D:");
    expect(eps).not.toMatch(/%%CreationDate:.*\dT\d\d:/); // never the ISO log line
    expect(dscDate("2026-11-19T00:00:00.000Z")).toBe("D:20261119000000+00'00'");
    expect(dscDate("2026-11-19T20:01:44.512+02:00")).toBe("D:20261119200144+02'00'");
    expect(dscDate("not a date")).toBeNull();
  });

  it("carries the full DSC + Illustrator comment set, and never claims Adobe wrote it", () => {
    for (const marker of [
      "%%DocumentProcessColors:", "%%DocumentSuppliedResources: procset", "%%Pages: 1",
      "%%PageOrder: Ascend", "%%PageOrigin: 0 0", "%AI3_ColorUsage:", "%AI5_FileFormat",
      "%AI5_ArtSize:", "%AI5_NumLayers:", "%AI3_TemplateBox:", "%AI3_TileBox:",
      "%AI3_DocumentPreview:", "%%Trailer",
    ]) expect(eps).toContain(marker);
    expect(eps).not.toMatch(/Adobe Illustrator/i);
    expect(eps).not.toContain("TemplateBox: 0 0 0 0");
  });

  it("declares the prolog it really supplies, and the prolog defines the body's operators", () => {
    expect(eps).toMatch(/^%%DocumentSuppliedResources: procset (\S+) 1\.0 0$/m);
    const name = /^%%DocumentSuppliedResources: procset (\S+)/m.exec(eps)![1];
    expect(eps).toContain(`%%BeginResource: procset ${name} 1.0 0`);
    expect(eps).toContain("%%EndResource");
    for (const alias of ["m {moveto}", "l {lineto}", "c {curveto}", "h {closepath}", "f {fill}", "S {stroke}", "w {setlinewidth}", "rg {setrgbcolor}", "q {gsave}", "Q {grestore}"]) {
      expect(eps).toContain(`/${alias} bind def`);
    }
    expect(eps).toContain("%%BeginProlog");
    expect(eps.indexOf("/m {moveto} bind def")).toBeGreaterThan(eps.indexOf("%%BeginProlog"));
    expect(eps.indexOf("/m {moveto} bind def")).toBeLessThan(eps.indexOf("%%EndProlog"));
  });

  it("keeps the document transform and the pen defaults in the setup, not loose in the artwork", () => {
    const setup = eps.slice(eps.indexOf("%%BeginSetup"), eps.indexOf("%%EndSetup"));
    expect(setup).toContain("[0.75 0 0 -0.75 0 30] concat"); // 40 px tall → 30 pt
    expect(setup).toMatch(/\b1 w\b/);
    expect(setup).toMatch(/\[\] 0 d/);
    expect(setup).toMatch(/\b0 J\b/);
    expect(setup).toMatch(/\b0 j\b/);
    expect(setup).toMatch(/\b4 M\b/);
  });
});

describe("the EPS body is written the way a drawing program writes it", () => {
  it("suppresses every identity matrix and every per-shape gsave", () => {
    const eps = epsOf(art(RECT + RECT + RECT));
    expect(eps).not.toContain("[1 0 0 1 0 0]");
    expect(bodyOf(eps)).not.toContain("concat"); // no transforms at all: no CTM operator either
    expect(bodyOf(eps)).not.toMatch(/\bgsave\b|\bgrestore\b|\bq\b|\bQ\b/);
  });

  it("wraps a transformed group ONCE instead of once per shape in it", () => {
    const eps = epsOf(art(`<g transform="translate(2 3)">${RECT}${RECT}${RECT}</g>`));
    const body = bodyOf(eps);
    expect(body).not.toContain("[1 0 0 1 0 0]");
    expect(body.match(/\[1 0 0 1 2 3\] concat/g)).toHaveLength(1);
    expect(body.match(/\bq\b/g)).toHaveLength(1);
    expect(body.match(/\bQ\b/g)).toHaveLength(1);
    expect(body.indexOf("q")).toBeLessThan(body.indexOf("[1 0 0 1 2 3] concat"));
  });

  it("speaks the prolog's operators, not the full PostScript words", () => {
    const body = bodyOf(epsOf(art('<path d="M1 1 L5 1 C6 1 7 2 7 3 Z" fill="#000"/>')));
    expect(body).toContain("1 1 m");
    expect(body).toContain("5 1 l");
    expect(body).toContain("6 1 7 2 7 3 c");
    expect(body).toContain("h");
    expect(body).toMatch(/\bf\b/);
    expect(body).not.toMatch(/moveto|\blineto\b|curveto|closepath|setrgbcolor|\bfill\b|\bstroke\b/);
  });

  it("writes only the pen values that differ from the ones already set", () => {
    const plain = bodyOf(epsOf(art(RECT)));
    expect(plain).not.toMatch(/\bJ\b|\bj\b|\bM\b|\bd\b|\bw\b/); // nothing to change: nothing written
    const round = bodyOf(epsOf(art('<rect x="1" y="1" width="4" height="4" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"/>')));
    expect(round).toContain("2 w");
    expect(round).toContain("1 J");
    expect(round).not.toMatch(/\b0 j\b|\b4 M\b/); // joins and miter are still the setup's
    const dashed = bodyOf(epsOf(art('<rect x="1" y="1" width="4" height="4" fill="none" stroke="#000" stroke-dasharray="4 2"/>')));
    expect(dashed).toContain("[4 2] 0 d");
  });

  it("paints a filled-and-stroked shape without losing the stroke, and repeats no colour", () => {
    const body = bodyOf(epsOf(art('<rect x="1" y="1" width="4" height="4" fill="#f00" stroke="#f00" stroke-width="1"/>')));
    expect(body.match(/1 0 0 rg/g)).toHaveLength(1); // one colour, named once for both paints
    expect(body).toMatch(/\bf\b/);
    expect(body).toMatch(/\bS\b/);
  });
});

describe("the compact body still draws the same picture", () => {
  it("executes, and every painted point stays inside the declared box", () => {
    const eps = epsOf(art('<g transform="translate(2 3) scale(2)">'
      + '<rect x="1" y="1" width="4" height="4" fill="#000"/>'
      + '<circle cx="6" cy="6" r="2" fill="none" stroke="#000" stroke-width="0.5"/>'
      + "</g>"));
    const run = runPostScript(eps);
    expect(run.errors).toEqual([]);
    expect(verifyEpsDocument(eps).errors).toEqual([]);
    expect(run.painted).not.toBeNull();
    const box = hiResBox(eps);
    expect(run.painted!.llx).toBeGreaterThanOrEqual(box.llx - 1e-6);
    expect(run.painted!.lly).toBeGreaterThanOrEqual(box.lly - 1e-6);
    expect(run.painted!.urx).toBeLessThanOrEqual(box.urx + 1e-6);
    expect(run.painted!.ury).toBeLessThanOrEqual(box.ury + 1e-6);
  });

  it("is materially smaller than the word-per-operator form it replaced", () => {
    const shapes = Array.from({ length: 12 }, (_, i) => `<rect x="${i}" y="${i}" width="2" height="2" fill="#123456"/>`).join("");
    const eps = epsOf(art(shapes));
    const body = bodyOf(eps).split("\n").filter((line) => !line.startsWith("%")).join("\n").trim();
    // 12 solid shapes: `rg`, one path, one `f` each — no per-shape state at all.
    // The form this replaced wrote ~100 bytes per shape (gsave, an identity
    // matrix, full-word operators, grestore); this is the ~45% the review wanted.
    const perShape = body.length / 12;
    expect(perShape).toBeLessThan(55);
    expect(body.match(/\brg\b/g)).toHaveLength(1); // one colour for the whole run
    expect(verifyEpsDocument(eps).errors).toEqual([]);
  });
});
