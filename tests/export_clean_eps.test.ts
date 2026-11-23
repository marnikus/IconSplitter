// @vitest-environment happy-dom
// export_clean_eps.test.ts — the EPS half of the clean export (2026-11-19).
// The forensic review found the generator's name all over a shipped file; an
// EPS carries MORE of it than the SVG does: our XMP setup/trailer blocks, a
// hex-encoded Photoshop/IPTC resource, `%ADO_ContainsXMP`, `IconSplitterXmp_<hex>`
// dictionary names, `%%Creator` and `%%CreationDate`. A clean EPS keeps ONE
// metadata carrier (the document XMP packet: title, description, tags) and no
// generator name — and it must still be an executable EPS 10 document.
import { describe, expect, it } from "vitest";
import { writeEps } from "../src/lib/upload/eps";
import { embedXmpMetadataInEps, readXmpMetadataFromEps } from "../src/lib/upload/epsmetadata";
import { verifyEpsDocument } from "../src/lib/upload/epsdoc";
import { cleanExportEps } from "../src/lib/upload/epsclean";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect x="4" y="4" width="92" height="52" fill="none" stroke="#000"/></svg>';
const META = { title: "Quiet line icons", description: "Line icons of kitchen tools", tags: ["icon", "kitchen"] };

function shipped(): string {
  const eps = writeEps(SVG, "#ffffff", { title: "temporary.eps", createdAt: "2026-11-19T10:00:00Z" });
  if (!eps.ok) throw new Error(eps.reason);
  return embedXmpMetadataInEps(eps.eps, META);
}

describe("cleanExportEps — no generator traces, one metadata carrier", () => {
  it("removes every occurrence of the app's name from the shipped document", () => {
    const before = shipped();
    expect(before).toContain("IconSplitter");
    const out = cleanExportEps(before);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.eps).not.toContain("IconSplitter");
    expect(out.eps).not.toContain("%ADO_ContainsXMP");
    expect(out.eps).not.toContain("%%Creator");
    expect(out.eps).not.toContain("%%CreationDate");
    expect(out.eps).not.toContain("%%BeginPhotoshop");
    expect(out.removed.length).toBeGreaterThan(0);
  });

  it("keeps exactly ONE metadata carrier: the document XMP packet", () => {
    const out = cleanExportEps(shipped());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.eps.match(/<\?xpacket begin=/g)?.length).toBe(1);
    expect(out.eps).not.toContain("%%BeginPhotoshop");
    // and it still reads back as the accepted fields
    expect(readXmpMetadataFromEps(out.eps)).toEqual(META);
  });

  it("still is an executable, DSC-complete EPS 10 document", () => {
    const out = cleanExportEps(shipped());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true);
    expect(out.eps).toContain("%%BoundingBox:");
    expect(out.eps).toContain("%%LanguageLevel: 3");
    expect(out.eps.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(verifyEpsDocument(out.eps).ok).toBe(true);
  });

  it("is idempotent and leaves a plain EPS (no metadata) alone", () => {
    const once = cleanExportEps(shipped());
    if (!once.ok) throw new Error("refused");
    expect(cleanExportEps(once.eps)).toMatchObject({ ok: true, eps: once.eps });
    const plain = writeEps(SVG, "#ffffff");
    if (!plain.ok) throw new Error(plain.reason);
    expect(cleanExportEps(plain.eps)).toMatchObject({ ok: true });
  });

  it("refuses, never guesses, when the text is not an EPS", () => {
    const out = cleanExportEps("hello");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain("EPS");
  });
});
