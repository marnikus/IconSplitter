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
import { embedXmpMetadataInEps, stripEpsEnvelope } from "./epsmetadata";
import { isCleanEpsEnvelope } from "./epsiptc";
import type { IconMetadata } from "./meta";

/** DSC lines that name the producer or the moment, never the artwork. */
const PRODUCER_LINES = /^%%(?:Creator|CreationDate|For|Copyright|CopyrightNotice)\b[^\r\n]*(?:\r\n|\r|\n|$)/gm;
/** Adobe Document Object flags (`%ADO_ContainsXMP: MainFirst` and friends). */
const ADO_LINES = /^%ADO_[A-Za-z]+:[^\r\n]*(?:\r\n|\r|\n|$)/gm;
/** Somebody else's Photoshop resource block — a second metadata carrier. */
const FOREIGN_PHOTOSHOP = /^%%BeginPhotoshop:[^\r\n]*(?:\r\n|\r|\n)(?:% [0-9a-fA-F]+(?:\r\n|\r|\n))*%%EndPhotoshop(?:\r\n|\r|\n|$)/gm;
const PACKET = /<\?xpacket begin[\s\S]*?<\?xpacket end[^>]*\?>(?:\r\n|\r|\n)?/g;
const XMPMETA = /[\s\S]*?<x:xmpmeta[\s\S]*?<\/x:xmpmeta>(?:\r\n|\r|\n)?/g;

/** True when the text is a PostScript program this pass may touch at all. */
function isEps(text: string): boolean {
  return /^%!PS-Adobe/m.test(text);
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

/** Producer/date/ADO/foreign-carrier removal. Idempotent. */
export function stripEpsFingerprints(eps: string): string {
  return eps.replace(FOREIGN_PHOTOSHOP, "").replace(PRODUCER_LINES, "").replace(ADO_LINES, "");
}

/** No metadata, so no packet: the XML is dropped whole, never half-cut. */
function dropAllCarriers(eps: string): string {
  return eps.replace(PACKET, "").replace(XMPMETA, "");
}

/** Whether a shipped EPS is already in the one-carrier clean form. */
export { isCleanEpsEnvelope };
