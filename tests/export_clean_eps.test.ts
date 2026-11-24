// export_clean_eps.test.ts — the clean switch reaches the EPS too (2026-11-19).
// The EPS artwork was already clean because it is written from the cleaned SVG
// copy; what the converter and the metadata envelope add is not: `%%Creator`,
// `%%CreationDate`, `%ADO_ContainsXMP`, the packet TWICE (pdfmark stream plus a
// Photoshop/IPTC block) and `x:xmptk="IconSplitter"`. The clean form keeps ONE
// carrier, still verifies as EPS 10, still reads Title/description/tags, and is
// byte-stable so the artwork audit can re-derive it from the file alone.
import { afterEach, describe, expect, it } from "vitest";
import { cleanEpsDocument, stripEpsFingerprints } from "../src/lib/upload/epsclean";
import {
  embedXmpMetadataInEps, readXmpMetadataFromEps, verifiedEpsArtwork, verifyEpsMetadata,
} from "../src/lib/upload/epsmetadata";
import { readEpsIptc, readEpsPhotoshopXmp } from "../src/lib/upload/epsiptc";
import { verifyEpsDocument } from "../src/lib/upload/epsdoc";
import { checkPostScript } from "../src/lib/upload/epscheck";
import { writeEps } from "../src/lib/upload/eps";
import type { IconMetadata } from "../src/lib/upload/meta";
import type { SheetMetadata } from "../src/lib/svgBuilder/types";
import { setTextOutliner } from "../src/lib/upload/expandtext";
import { packageOf, sheetSvg, textOf } from "./helpers/sheetpackage";

const META: IconMetadata = { title: "Food icons", description: "Kitchen set", tags: ["food", "kitchen", "cook"] };
const SHEET_META: SheetMetadata = { ...META, state: "accepted", validation: null, fingerprint: null };
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="none" stroke="#6d0b04" stroke-width="2" stroke-linecap="round"/></svg>';

/** A real EPS 10 from the built-in writer. */
function eps(): string {
  const out = writeEps(ICON, "white", { createdAt: "2026-11-19T00:00:00.000Z" });
  if (!out.ok) throw new Error(out.reason);
  return out.eps;
}

const packets = (text: string) => (text.match(/<\?xpacket begin=/g) ?? []).length;

afterEach(() => setTextOutliner(null));

describe("cleanEpsDocument", () => {
  it("strips the producer's paperwork and the second metadata carrier", () => {
    // what an external converter leaves (the built-in writer writes none of it since 2026-11-24)
    const converterEps = eps().replace("%%BoundingBox:", "%%Creator: Inkscape 1.3\n%%CreationDate: 2026-11-19T00:00:00Z\n%%Title: sheet.eps\n%%BoundingBox:");
    const legacy = embedXmpMetadataInEps(converterEps, META);
    expect(legacy).toContain("%%Creator:");
    expect(legacy).toContain("%%CreationDate:");
    expect(legacy).toContain("%ADO_ContainsXMP:");
    expect(legacy).toContain("%%BeginPhotoshop:");
    expect(legacy).not.toContain("IconSplitter");
    expect(legacy).not.toContain("x:xmptk");
    expect(packets(legacy)).toBe(1);
    const clean = cleanEpsDocument(converterEps, META);
    expect(clean).not.toContain("%%Creator");
    expect(clean).not.toContain("%%CreationDate");
    expect(clean).not.toContain("%%Title"); // RULE 26 (2026-11-24): the file never names the work
    expect(clean).not.toContain("%ADO_");
    expect(clean).not.toContain("%%BeginPhotoshop");
    expect(clean).not.toContain("x:xmptk");
    expect(packets(clean)).toBe(1);
    expect((clean.match(/<x:xmpmeta/g) ?? []).length).toBe(1);
  });

  it("is still a verifiable EPS 10", () => {
    const clean = cleanEpsDocument(eps(), META);
    for (const marker of ["%!PS-Adobe", "%%BoundingBox:", "%%HiResBoundingBox:", "%%DocumentData:", "%%LanguageLevel:", "%%EndComments", "%%BeginProlog", "%%EndProlog", "%%BeginSetup", "%%EndSetup", "%%EOF"]) {
      expect(clean, marker).toContain(marker);
    }
    expect(verifyEpsDocument(clean).ok).toBe(true);
  });

  it("keeps Title, description and tags — and no second copy to disagree with", () => {
    const clean = cleanEpsDocument(eps(), META);
    expect(readXmpMetadataFromEps(clean)).toMatchObject({ title: "Food icons", description: "Kitchen set", tags: ["food", "kitchen", "cook"] });
    expect(verifyEpsMetadata(clean, META)).toBe(true);
    expect(readEpsIptc(clean)).toBeNull();
    expect(readEpsPhotoshopXmp(clean)).toBeNull();
    // a second copy is refused, not ignored
    const doubled = clean.replace("%%EOF", `${clean.slice(clean.indexOf("<?xpacket begin="), clean.indexOf('<?xpacket end="w"?>') + 20)}\n%%EOF`);
    expect(verifyEpsMetadata(doubled, META)).toBe(false);
  });

  it("is byte-stable, so the artwork audit can re-derive it from the file", () => {
    const once = cleanEpsDocument(eps(), META);
    expect(cleanEpsDocument(once, META)).toBe(once);
    const artwork = verifiedEpsArtwork(once);
    expect(artwork).not.toContain("<?xpacket");
    expect(checkPostScript(artwork)).toEqual([]);
    expect(verifyEpsDocument(artwork).ok).toBe(true);
  });

  it("carries no carrier at all when the export has no metadata", () => {
    const blind = cleanEpsDocument(embedXmpMetadataInEps(eps(), META), null);
    expect(packets(blind)).toBe(0);
    expect(blind).not.toContain("x:xmpmeta");
    expect(blind).not.toContain("% IconSplitter XMP");
    expect(verifyEpsDocument(blind).ok).toBe(true);
  });

  it("leaves text that is not PostScript alone, and the legacy envelope intact", () => {
    expect(cleanEpsDocument("not an eps", META)).toBe("not an eps");
    expect(stripEpsFingerprints("not an eps")).toBe("not an eps");
    const legacy = embedXmpMetadataInEps(eps(), META); // default = the stock-upload shape
    expect(legacy).toContain("%%BeginPhotoshop");
    expect(verifyEpsMetadata(legacy, META)).toBe(true);
  });
});

describe("the clean switch on the package's EPS", () => {
  const outline = () => setTextOutliner(() => ({ d: "M0 0 L10 0", width: 10 }));

  it("ships the cleaned EPS with one carrier and no producer line", async () => {
    outline();
    const pkg = await packageOf(sheetSvg(), { includeEps: true, expandText: true, includeJpeg: false }, SHEET_META);
    expect(pkg.problems).toEqual([]);
    const epsText = textOf(pkg, ".eps") as string;
    expect(epsText).not.toContain("%%Creator");
    expect(epsText).not.toContain("%%CreationDate");
    expect(epsText).not.toContain("%ADO_");
    expect(epsText).not.toContain("%%BeginPhotoshop");
    expect(epsText).not.toContain("x:xmptk");
    expect(packets(epsText)).toBe(1);
    expect(readXmpMetadataFromEps(epsText)).toMatchObject({ title: "Food icons" });
    expect(verifyEpsDocument(epsText).ok).toBe(true);
  });

  it("off: ships the two-carrier envelope while still stripping producer attribution (RULE 26)", async () => {
    outline();
    const pkg = await packageOf(sheetSvg(), { includeEps: true, expandText: true, includeJpeg: false, cleanExport: false }, SHEET_META);
    const epsText = textOf(pkg, ".eps") as string;
    expect(epsText).not.toContain("%%Creator");
    expect(epsText).not.toContain("IconSplitter");
    expect(epsText).toContain("%%BeginPhotoshop: 6");
  });
});
