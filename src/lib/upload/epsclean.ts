// epsclean.ts — the clean-export pass for an EPS document (2026-11-19).
// A shipped EPS carried more generator paperwork than the SVG did: a duplicate
// hex-encoded Photoshop/IPTC resource block, an `%ADO_ContainsXMP` header line,
// `IconSplitterXmp_<hex>` / `IconSplitterStream_<hex>` object names,
// `x:xmptk="IconSplitter"` inside the packet, `% IconSplitter …` block markers,
// plus `%%Creator` and `%%CreationDate`. A stock reviewer reads all of it as
// "assembled by a script".
//
// The rule this file enforces: ONE metadata carrier — the document XMP packet
// (dc:title, dc:description, dc:subject) — and no producer identity. The file is
// REBUILT through the same writer that owns the envelope (`embedXmpMetadataInEps`
// with `{clean:true}`), never patched by hand, so the delivered EPS keeps the
// exact pdfmark structure a reader needs and `verifyEpsDocument` still passes it.
import { embedXmpMetadataInEps, readXmpMetadataFromEps, stripEpsEnvelope } from "./epsmetadata";

export type CleanEpsResult =
  | { ok: true; eps: string; removed: string[] }
  | { ok: false; eps: string; reason: string };

const GENERATOR = "IconSplitter";
const IDENTITY_COMMENTS = [/^%%Creator:.*(?:\r\n|\r|\n|$)/gm, /^%%CreationDate:.*(?:\r\n|\r|\n|$)/gm, /^%ADO_ContainsXMP:.*(?:\r\n|\r|\n|$)/gm];
const PHOTOSHOP = /^%%BeginPhotoshop:[\s\S]*?^%%EndPhotoshop(?:\r\n|\r|\n|$)/gm;

const isEps = (eps: string): boolean => eps.startsWith("%!PS-Adobe-3.0");

/**
 * Was any generator paperwork there to remove? (reported, so export.json can
 * say what the delivered file lost.) The document packet itself STAYS — it is
 * the one carrier a stock site reads title/description/tags from.
 */
function tracesOf(eps: string): string[] {
  const found: string[] = [];
  if (eps.includes("%%BeginPhotoshop") || eps.includes("% IconSplitter IPTC begin")) found.push("a duplicate IPTC/Photoshop metadata resource");
  if (IDENTITY_COMMENTS.some((re) => re.test(eps))) found.push("header comments naming the producing software or the run time");
  if (eps.includes(GENERATOR)) found.push("the producer's own name");
  return found;
}

/**
 * The delivered EPS: one metadata carrier, no producer identity, still the same
 * document. Everything removed is named in `removed`.
 */
export function cleanExportEps(eps: string): CleanEpsResult {
  if (!isEps(eps)) return { ok: false, eps, reason: "the text is not an EPS 10 document (no %!PS-Adobe-3.0 header)" };
  const removed = tracesOf(eps);
  const metadata = readXmpMetadataFromEps(eps);
  const base = stripEpsEnvelope(eps).replace(PHOTOSHOP, "");
  let out = metadata === null ? base : embedXmpMetadataInEps(base, metadata, { clean: true });
  if (metadata === null) for (const re of IDENTITY_COMMENTS) out = out.replace(re, "");
  return { ok: true, eps: out, removed };
}
