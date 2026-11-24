// epsclean.ts — the EPS side of the clean export (2026-11-19). Two things a
// shipped EPS tells about the machine that wrote it, beyond the drawing:
//
//   1. DSC bookkeeping: `%%Creator: …`, `%%CreationDate: <the exact second>`,
//      `%%For`, `%%Copyright`, and Adobe's own `%ADO_*` flags.
//   2. Metadata carriers: the legacy envelope writes the packet TWICE (a
//      pdfmark XMP stream AND a Photoshop/IPTC block repeating it), and the
//      packet itself carries `x:xmptk="IconSplitter"`.
//
// The clean form keeps exactly ONE carrier — the pdfmark stream — with no tool
// signature, and is still a verifiable EPS 10: `%%BoundingBox`,
// `%%HiResBoundingBox`, `%%DocumentData`, `%%LanguageLevel`, the Prolog/Setup
// sections and `%%EOF` are untouched. Title, description and tags survive:
// that is the only metadata an export is allowed to carry.
//
// Byte-stable, which is what `verifiedEpsArtwork` relies on: it re-derives the
// envelope from the file alone and compares, so cleaning twice must be a no-op.
//
// `stripEpsIdentity` (2026-11-24) is the ALWAYS-ON part, applied wherever an EPS
// leaves the app whatever the clean setting: no `%%Title` (the internal work
// name), no producer/date lines, no Illustrator private `%AI<n>_…` comments, and
// a legacy hashed envelope renamed to the fixed neutral names.
import { embedXmpMetadataInEps, neutralizeLegacyEnvelopeNames, stripEpsEnvelope } from "./epsmetadata";
import { stripEpsIdentityLines } from "./epsidentity";
import { isCleanEpsEnvelope } from "./epsiptc";
import type { IconMetadata } from "./meta";

/** Adobe Document Object flags (`%ADO_ContainsXMP: MainFirst` and friends). */
const ADO_LINES = /^%ADO_[A-Za-z]+:[^\r\n]*(?:\r\n|\r|\n|$)/gm;
/** Somebody else's Photoshop resource block — a second metadata carrier. */
const FOREIGN_PHOTOSHOP = /^%%BeginPhotoshop:[^\r\n]*(?:\r\n|\r|\n)(?:% [0-9a-fA-F]+(?:\r\n|\r|\n))*%%EndPhotoshop(?:\r\n|\r|\n|$)/gm;
const PACKET = /<\?xpacket begin[\s\S]*?<\?xpacket end[^>]*\?>(?:\r\n|\r|\n)?/g;
const XMPMETA = /<x:xmpmeta[\s\S]*?<\/x:xmpmeta>(?:\r\n|\r|\n)?/g;

/** True when the text is a PostScript program this pass may touch at all. */
function isEps(text: string): boolean {
  return text.startsWith("%!PS-Adobe") || /^%!PS-Adobe/m.test(text);
}

/**
 * The shipped EPS text. With metadata: fingerprints out, then ONE carrier in
 * (which re-derives whatever envelope was already there). Without metadata: no
 * carrier at all — a file may not keep a packet nobody asked to carry. Anything
 * that is not EPS is handed back untouched rather than guessed at.
 */
export function cleanEpsDocument(eps: string, metadata: IconMetadata | null): string {
  if (!isEps(eps)) return eps;
  if (metadata !== null) return embedXmpMetadataInEps(stripEpsFingerprints(eps), metadata, { clean: true });
  return dropAllCarriers(stripEpsEnvelope(stripEpsFingerprints(eps)));
}

/**
 * The identity scrub every shipped EPS passes, whoever wrote it (RULE 26):
 * title/producer/date lines, Illustrator `%AI…` comments and hashed envelope
 * names out; the DSC boxes, level, data and program untouched. Idempotent;
 * text that is not PostScript is handed back as it came.
 */
export function stripEpsIdentity(eps: string): string {
  if (!isEps(eps)) return eps;
  return neutralizeLegacyEnvelopeNames(stripEpsIdentityLines(eps));
}

/** Identity/ADO/foreign-carrier removal. Idempotent. */
export function stripEpsFingerprints(eps: string): string {
  let out = eps.includes("%%BeginPhotoshop:") ? eps.replace(FOREIGN_PHOTOSHOP, "") : eps;
  out = stripEpsIdentity(out);
  return out.includes("%ADO_") ? out.replace(ADO_LINES, "") : out;
}

/** No metadata, so no packet: the XML is dropped whole, never half-cut. */
function dropAllCarriers(eps: string): string {
  let out = eps.includes("<?xpacket begin") ? eps.replace(PACKET, "") : eps;
  if (out.includes("<x:xmpmeta")) out = out.replace(XMPMETA, "");
  return out;
}

/** Whether a shipped EPS is already in the one-carrier clean form. */
export { isCleanEpsEnvelope };
