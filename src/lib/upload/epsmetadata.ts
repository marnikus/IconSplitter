// epsmetadata.ts — document-level XMP for EPS (Adobe XMP Part 3, §1.6.2.1.3).
// Photoshop comments contain IPTC-IIM0404 and the same XMP packet in0424.
// The converter output is left intact; a pdfmark metadata stream is attached
// before drawing and the drawing is bracketed by BDC/EMC, for both EPS writers.
// The envelope's names are FIXED (2026-11-24, RULE 26): `MetadataDict`,
// `MetadataStream`, `%EndPacket` — a per-file hash suffix read as batch output,
// and `[/NamespacePush` … `[/NamespacePop` already isolates the names.

import {
  countXmpPackets, embedIptcInEps, isCleanEpsEnvelope, readEpsIptc, readEpsPhotoshopXmp, stripEpsIptc,
} from "./epsiptc";
import { sameMetadata } from "./rights";
import { sameLegacyMetadata } from "./iptc";
import type { IconMetadata } from "./meta";
import { stripEpsIdentityLines } from "./epsidentity";
import { buildXmpPacket, readXmpPacket } from "./xmp";

const SETUP_BEGIN = "%BeginDocumentMetadata";
const SETUP_END = "%EndDocumentMetadata";
const TRAILER_BEGIN = "%BeginMetadataTrailer";
const TRAILER_END = "%EndMetadataTrailer";
const LEGACY_SETUP_BEGIN = "% IconSplitter XMP setup begin";
const LEGACY_SETUP_END = "% IconSplitter XMP setup end";
const LEGACY_TRAILER_BEGIN = "% IconSplitter XMP trailer begin";
const LEGACY_TRAILER_END = "% IconSplitter XMP trailer end";
const DICTIONARY = "MetadataDict";
const STREAM = "MetadataStream";
const PACKET_END = "%EndPacket";
/** The hashed names written before 2026-11-24: `MetadataDict_<hex>`, `MetadataStream_<hex>`, `%EndPacket_<hex>`. */
const LEGACY_HASHED_NAME = /(MetadataDict|MetadataStream|%EndPacket)_([0-9a-f]+)(?![0-9A-Za-z])/g;

export interface EpsEmbedOptions {
  /**
   * The 2026-11-19 clean form: ONE carrier (the pdfmark stream), no
   * Photoshop/IPTC copy, no `%ADO_*` flag and no `x:xmptk` signature. Default
   * is the legacy two-carrier envelope the stock upload needs.
   */
  clean?: boolean;
}

/** Add a converter-neutral, Adobe-compatible XMP stream to an EPS document. */
export function embedXmpMetadataInEps(eps: string, metadata: IconMetadata, options: EpsEmbedOptions = {}): string {
  const clean = stripPreviousEmbedding(eps);
  const eol = lineEndingOf(clean);
  const packet = buildXmpPacket(metadata).replace(/\n/g, eol);
  const header = options.clean === true ? withoutAdobeFlags(clean) : embedIptcInEps(addXmpHeader(clean, eol), metadata);
  const setup = setupBlock(packet, eol);
  const trailer = trailerBlock(eol);
  const setupAt = afterSetup(header);
  const trailerAt = beforeTrailer(header);
  const closeAt = trailerAt !== null && trailerAt > setupAt ? trailerAt : header.length;
  return `${header.slice(0, setupAt)}${setup}${eol}${header.slice(setupAt, closeAt)}${trailer}${eol}${header.slice(closeAt)}`;
}

/** The first well-formed Dublin Core XMP packet in an EPS, or null. */
export function readXmpMetadataFromEps(eps: string): IconMetadata | null {
  let at = 0;
  while (at < eps.length) {
    const start = eps.indexOf("<?xpacket begin=", at);
    if (start < 0) return null;
    const endStart = eps.indexOf("<?xpacket end=", start);
    if (endStart < 0) return null;
    const end = eps.indexOf("?>", endStart);
    if (end < 0) return null;
    const metadata = readXmpPacket(eps.slice(start, end + 2));
    if (metadata !== null) return metadata;
    at = end + 2;
  }
  return null;
}

/**
 * Whether the carriers match the accepted fields (legacy limits only in IIM).
 * A clean envelope is verified the other way round: the ONE packet must match
 * and there must be no second copy to disagree with it later.
 */
export function verifyEpsMetadata(eps: string, expected: IconMetadata): boolean {
  if (!sameMetadata(readXmpMetadataFromEps(eps), expected)) return false;
  if (isCleanEpsEnvelope(eps)) return countXmpPackets(eps) === 1;
  return sameMetadata(readEpsPhotoshopXmp(eps), expected) && sameLegacyMetadata(readEpsIptc(eps), expected);
}

function setupBlock(packet: string, eol: string): string {
  const marker = uniquePacketMarker(packet);
  return [
    SETUP_BEGIN,
    `/${DICTIONARY} 8 dict def`,
    `${DICTIONARY} begin`,
    "/currentdistillerparams where",
    "{pop currentdistillerparams /CoreDistVersion get 5000 lt} {true} ifelse",
    "{ /pdfmark /cleartomark load def /metafile_pdfmark {flushfile cleartomark} bind def}",
    "{ /metafile_pdfmark {/PUT pdfmark} bind def} ifelse",
    "[/NamespacePush pdfmark",
    `[/_objdef {${STREAM}} /type /stream /OBJ pdfmark`,
    `[{${STREAM}} 2 dict begin /Type /Metadata def /Subtype /XML def currentdict end /PUT pdfmark`,
    `[{${STREAM}}`,
    `currentfile 0 (${marker}) /SubFileDecode filter metafile_pdfmark`,
    packet,
    marker,
    `[/Document 1 dict begin /Metadata {${STREAM}} def currentdict end /BDC pdfmark`,
    "[/NamespacePop pdfmark",
    "end",
    SETUP_END,
  ].join(eol);
}

function trailerBlock(eol: string): string {
  return [TRAILER_BEGIN, `${DICTIONARY} begin`, "[/EMC pdfmark", "end", TRAILER_END].join(eol);
}

/** The SubFileDecode end marker: fixed, lengthened only if the packet text itself contains it. */
function uniquePacketMarker(packet: string): string {
  let marker = PACKET_END;
  while (packet.includes(marker)) marker += "_";
  return marker;
}

/**
 * An envelope written before 2026-11-24 with ONE consistent hashed id, renamed
 * to today's fixed names (byte-for-byte what the writer now emits). Mixed ids
 * are left alone, so a tampered envelope still fails the audit below.
 */
export function neutralizeLegacyEnvelopeNames(eps: string): string {
  if (!eps.includes("MetadataDict_") && !eps.includes("%EndPacket_")) return eps;
  const ids = new Set(Array.from(eps.matchAll(LEGACY_HASHED_NAME), (m) => m[2]));
  if (ids.size !== 1) return eps;
  return eps.replace(LEGACY_HASHED_NAME, (_hit, name: string) => name);
}

/** Everything our envelope added, gone: the converter's own program remains. */
export function stripEpsEnvelope(eps: string): string {
  return stripPreviousEmbedding(eps);
}

function stripPreviousEmbedding(eps: string): string {
  if (!hasEnvelopeMarkers(eps)) return eps;
  let clean = stripMarkedBlock(stripEpsIptc(eps), SETUP_BEGIN, SETUP_END);
  clean = stripMarkedBlock(clean, TRAILER_BEGIN, TRAILER_END);
  clean = stripMarkedBlock(clean, LEGACY_SETUP_BEGIN, LEGACY_SETUP_END);
  clean = stripMarkedBlock(clean, LEGACY_TRAILER_BEGIN, LEGACY_TRAILER_END);
  return clean;
}

function stripMarkedBlock(text: string, begin: string, end: string): string {
  const lines = linesOf(text);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lineText(lines[i]) !== begin) {
      out.push(lines[i]);
      continue;
    }
    const endAt = lines.findIndex((line, j) => j > i && lineText(line) === end);
    if (endAt < 0) {
      out.push(...lines.slice(i));
      break;
    }
    i = endAt;
  }
  return out.join("");
}

/** Clean mode is one carrier: no `%ADO_*` flag, and no `%%DocumentData` rewrite. */
function withoutAdobeFlags(eps: string): string {
  return eps.includes("%ADO_") ? eps.replace(/^%ADO_[A-Za-z]+:[^\r\n]*(?:\r\n|\r|\n|$)/gm, "") : eps;
}

function addXmpHeader(eps: string, eol: string): string {
  const lines = linesOf(eps);
  const end = headerEnd(lines);
  const header = lines.slice(0, end).filter((line) => {
    const text = lineText(line);
    return !/^%ADO_ContainsXMP:/i.test(text) && !/^%%DocumentData:/i.test(text);
  });
  return [
    ...header,
    `%ADO_ContainsXMP: MainFirst${eol}`,
    `%%DocumentData: Clean8Bit${eol}`,
    ...lines.slice(end),
  ].join("");
}

/** The end of the EPS header: explicit EndComments, otherwise the first code line. */
function headerEnd(lines: string[]): number {
  const endComments = lines.findIndex((line) => /^%%EndComments\b/.test(lineText(line)));
  if (endComments >= 0) return endComments;
  for (let i = 1; i < lines.length; i++) {
    if (!lineText(lines[i]).startsWith("%")) return i;
  }
  return lines.length;
}

function afterSetup(eps: string): number {
  const pageSetup = findDscLine(eps, "%%EndPageSetup");
  if (pageSetup !== null) return pageSetup.end;
  const setup = findDscLine(eps, "%%EndSetup");
  if (setup !== null) return setup.end;
  const comments = findDscLine(eps, "%%EndComments");
  if (comments !== null) return comments.end;
  return startOfLine(eps, headerEnd(linesOf(eps)));
}

function beforeTrailer(eps: string): number | null {
  const eof = eps.lastIndexOf("%%EOF");
  return findDscLine(eps, "%%PageTrailer")?.start
    ?? findDscLine(eps, "%%Trailer")?.start
    ?? findDscLine(eps, "%%EOF")?.start
    ?? (eof < 0 ? null : eof);
}

interface LineSpan { start: number; end: number }

function isDscWordCode(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

function lineEndAfter(eps: string, at: number): number {
  let i = at;
  while (i < eps.length && eps.charCodeAt(i) !== 10 && eps.charCodeAt(i) !== 13) i++;
  if (i >= eps.length) return eps.length;
  return eps.charCodeAt(i) === 13 && eps.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
}

/** Find a DSC line once via substring search and expose both insertion boundaries. */
function findDscLine(eps: string, tag: string): LineSpan | null {
  let from = 0;
  while (from <= eps.length - tag.length) {
    const start = eps.indexOf(tag, from);
    if (start < 0) return null;
    const atLineStart = start === 0 || eps.charCodeAt(start - 1) === 10 || eps.charCodeAt(start - 1) === 13;
    const after = start + tag.length;
    if (atLineStart && (after >= eps.length || !isDscWordCode(eps.charCodeAt(after)))) {
      return { start, end: lineEndAfter(eps, after) };
    }
    from = start + 1;
  }
  return null;
}

function startOfLine(eps: string, lineIndex: number): number {
  let at = 0;
  for (const line of linesOf(eps).slice(0, lineIndex)) at += line.length;
  return at;
}

function linesOf(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\r" && text[i] !== "\n") continue;
    if (text[i] === "\r" && text[i + 1] === "\n") i++;
    out.push(text.slice(start, i + 1));
    start = i + 1;
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

function lineText(line: string): string {
  return line.replace(/(?:\r\n|\r|\n)$/, "");
}

function lineEndingOf(text: string): string {
  return /\r\n|\n|\r/.exec(text)?.[0] ?? "\n";
}

function hasEnvelopeMarkers(eps: string): boolean {
  return eps.includes(SETUP_BEGIN)
    || eps.includes(TRAILER_BEGIN)
    || eps.includes(LEGACY_SETUP_BEGIN)
    || eps.includes(LEGACY_TRAILER_BEGIN)
    || eps.includes("% IconSplitter IPTC begin")
    || /^%%BeginPhotoshop:/m.test(eps);
}

/** Only our byte-for-byte canonical metadata program may be excluded from the
 * vector grammar audit. Marker comments alone are never a bypass. */
export function verifiedEpsArtwork(eps: string): string {
  if (!hasEnvelopeMarkers(eps)) return eps;
  // Packages exported before 2026-11-24 keep verifying: identity COMMENTS (title, %AI…) cannot change what the
  // program does, so they are not part of the envelope comparison; a legacy hashed id is renamed first.
  const file = neutralizeLegacyEnvelopeNames(stripEpsIdentityLines(eps));
  const metadata = readXmpMetadataFromEps(file);
  const clean = stripPreviousEmbedding(file);
  const mode = isCleanEpsEnvelope(file) ? { clean: true } : {};
  if (metadata === null || embedXmpMetadataInEps(clean, metadata, mode) !== file) throw new Error("unverified EPS metadata envelope");
  return clean;
}
