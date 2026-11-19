// epsmetadata.ts — document-level XMP for EPS (Adobe XMP Part 3, §1.6.2.1.3).
// Photoshop comments contain IPTC-IIM0404 and the same XMP packet in0424.
// The converter output is left intact; a pdfmark metadata stream is attached
// before drawing and the drawing is bracketed by BDC/EMC, for both EPS writers.

import { embedIptcInEps, readEpsIptc, readEpsPhotoshopXmp, stripEpsIptc } from "./epsiptc";
import { sameMetadata } from "./rights";
import { sameLegacyMetadata } from "./iptc";
import { fnv1a32 } from "../pairing";
import type { IconMetadata } from "./meta";
import { metadataFingerprint } from "./meta";
import { buildXmpPacket, readXmpPacket } from "./xmp";

const SETUP_BEGIN = "% IconSplitter XMP setup begin";
const SETUP_END = "% IconSplitter XMP setup end";
const TRAILER_BEGIN = "% IconSplitter XMP trailer begin";
const TRAILER_END = "% IconSplitter XMP trailer end";
// The clean-export pass (epsclean.ts) keeps this one carrier but renames its
// wrapper, so the shipped file never says whose generator wrote it.
const CLEAN_SETUP_BEGIN = "% metadata XMP setup begin";
const CLEAN_SETUP_END = "% metadata XMP setup end";
const CLEAN_TRAILER_BEGIN = "% metadata XMP trailer begin";
const CLEAN_TRAILER_END = "% metadata XMP trailer end";

/**
 * How the envelope is written (2026-11-19). `clean` is the delivered-file form:
 * ONE metadata carrier (the pdfmark XMP stream, no Photoshop/IPTC duplicate), no
 * `x:xmptk`, no `%ADO_ContainsXMP`, and neutral object names — so the file never
 * names the producer. The default form stays byte-identical to what the upload
 * pipeline has always written (its audit rebuilds it exactly).
 */
export interface EpsEnvelopeOptions { clean?: boolean }

/** Add a converter-neutral, Adobe-compatible XMP stream to an EPS document. */
export function embedXmpMetadataInEps(eps: string, metadata: IconMetadata, opts: EpsEnvelopeOptions = {}): string {
  const rest = opts.clean === true;
  const clean = stripPreviousEmbedding(eps);
  const eol = lineEndingOf(clean);
  const packet = buildXmpPacket(metadata, { clean: rest }).replace(/\n/g, eol);
  const identity = clean.replace(/^%ADO_ContainsXMP:.*(?:\r\n|\r|\n|$)/gm, "")
    .replace(/^%%DocumentData:.*(?:\r\n|\r|\n|$)/gm, "");
  // The id names what the FILE carries: the Icon Name (2026-11-08) is never written into it, so it must not
  // reach the id — the audit rebuilds this envelope from the file's own metadata and must reproduce it exactly.
  // A delivered file carries no run-dependent id (it must be reproducible: the
  // clean pass is idempotent and the audit rebuilds the envelope byte for byte).
  const id = `${metadataFingerprint({ ...metadata, name: undefined })}${rest ? "" : fnv1a32(identity).toString(16).padStart(8, "0")}`;
  const header = rest ? cleanXmpHeader(clean, eol) : embedIptcInEps(addXmpHeader(clean, eol), metadata);
  const setup = setupBlock(id, packet, eol, rest);
  const trailer = trailerBlock(id, eol, rest);
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

/** Whether both EPS metadata carriers match accepted fields (legacy limits only in IIM). */
export function verifyEpsMetadata(eps: string, expected: IconMetadata): boolean {
  const actual = readXmpMetadataFromEps(eps);
  // A delivered file keeps ONE carrier (the document packet) and must carry no
  // second copy — and no producer identity — that could disagree with it.
  if (isCleanEps(eps)) {
    return sameMetadata(actual, expected) && !eps.includes("%%BeginPhotoshop") && !eps.includes("IconSplitter");
  }
  return sameMetadata(actual, expected) && sameMetadata(readEpsPhotoshopXmp(eps), expected)
    && sameLegacyMetadata(readEpsIptc(eps), expected);
}

function setupBlock(id: string, packet: string, eol: string, rest = false): string {
  const dictionary = rest ? "DocMeta" : `IconSplitterXmp_${id}`;
  const stream = rest ? "DocStream" : `IconSplitterStream_${id}`;
  const marker = uniquePacketMarker(id, packet, rest);
  return [
    rest ? CLEAN_SETUP_BEGIN : SETUP_BEGIN,
    `/${dictionary} 8 dict def`,
    `${dictionary} begin`,
    "/currentdistillerparams where",
    "{pop currentdistillerparams /CoreDistVersion get 5000 lt} {true} ifelse",
    "{ /pdfmark /cleartomark load def /metafile_pdfmark {flushfile cleartomark} bind def}",
    "{ /metafile_pdfmark {/PUT pdfmark} bind def} ifelse",
    "[/NamespacePush pdfmark",
    `[/_objdef {${stream}} /type /stream /OBJ pdfmark`,
    `[{${stream}} 2 dict begin /Type /Metadata def /Subtype /XML def currentdict end /PUT pdfmark`,
    `[{${stream}}`,
    `currentfile 0 (${marker}) /SubFileDecode filter metafile_pdfmark`,
    packet,
    marker,
    `[/Document 1 dict begin /Metadata {${stream}} def currentdict end /BDC pdfmark`,
    "[/NamespacePop pdfmark",
    "end",
    rest ? CLEAN_SETUP_END : SETUP_END,
  ].join(eol);
}

function trailerBlock(id: string, eol: string, rest = false): string {
  const dictionary = rest ? "DocMeta" : `IconSplitterXmp_${id}`;
  return [rest ? CLEAN_TRAILER_BEGIN : TRAILER_BEGIN, `${dictionary} begin`, "[/EMC pdfmark", "end", rest ? CLEAN_TRAILER_END : TRAILER_END].join(eol);
}

function uniquePacketMarker(id: string, packet: string, rest = false): string {
  let marker = rest ? `% DocMetaEnd_${id.slice(-8)}` : `% IconSplitterXmpEnd_${id}`;
  while (packet.includes(marker)) marker += "_";
  return marker;
}

/** The document with EVERY metadata envelope removed — what a clean rebuild starts from. */
export function stripEpsEnvelope(eps: string): string {
  return stripPreviousEmbedding(eps);
}

/**
 * Removes ONE of our marked blocks (`% IconSplitter XMP setup begin` … end).
 * Shared with the clean-export pass (epsclean.ts), which drops the whole
 * embedding except the single document packet it keeps.
 */
export function stripXmpSetup(eps: string, begin: string): string {
  const end = begin === TRAILER_BEGIN ? TRAILER_END : SETUP_END;
  return stripMarkedBlock(eps, begin, end);
}

function stripPreviousEmbedding(eps: string): string {
  let clean = stripMarkedBlock(stripEpsIptc(eps), SETUP_BEGIN, SETUP_END);
  clean = stripMarkedBlock(clean, TRAILER_BEGIN, TRAILER_END);
  clean = stripMarkedBlock(clean, CLEAN_SETUP_BEGIN, CLEAN_SETUP_END);
  clean = stripMarkedBlock(clean, CLEAN_TRAILER_BEGIN, CLEAN_TRAILER_END);
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

/**
 * The header of a delivered file: the same XMP markers a reader needs, without
 * the lines that name the producer (`%%Creator`), the moment it ran
 * (`%%CreationDate`), or the Photoshop carrier the packet replaces.
 */
function cleanXmpHeader(eps: string, eol: string): string {
  const lines = linesOf(eps);
  const end = headerEnd(lines);
  const header = lines.slice(0, end).filter((line) => {
    const text = lineText(line);
    return !/^%ADO_ContainsXMP:/i.test(text) && !/^%%Creator:/i.test(text) && !/^%%CreationDate:/i.test(text)
      && !/^%%DocumentData:/i.test(text);
  });
  return [...header, `%%DocumentData: Clean8Bit${eol}`, ...lines.slice(end)].join("");
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
  const pageSetup = findLineSpan(eps, /^%%EndPageSetup\b/);
  if (pageSetup !== null) return pageSetup.end;
  const setup = findLineSpan(eps, /^%%EndSetup\b/);
  if (setup !== null) return setup.end;
  const comments = findLineSpan(eps, /^%%EndComments\b/);
  if (comments !== null) return comments.end;
  return startOfLine(eps, headerEnd(linesOf(eps)));
}

function beforeTrailer(eps: string): number | null {
  const eof = eps.lastIndexOf("%%EOF");
  return findLineSpan(eps, /^%%PageTrailer\b/)?.start
    ?? findLineSpan(eps, /^%%Trailer\b/)?.start
    ?? findLineSpan(eps, /^%%EOF\b/)?.start
    ?? (eof < 0 ? null : eof);
}

interface LineSpan { start: number; end: number }

/** Find a DSC line once and expose both insertion boundaries. */
function findLineSpan(eps: string, pattern: RegExp): LineSpan | null {
  let start = 0;
  for (const line of linesOf(eps)) {
    const end = start + line.length;
    if (pattern.test(lineText(line))) return { start, end };
    start = end;
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

/** Only our byte-for-byte canonical metadata program may be excluded from the
 * vector grammar audit. Marker comments alone are never a bypass. */
export function verifiedEpsArtwork(eps: string): string {
  if (!eps.includes(SETUP_BEGIN) && !eps.includes(TRAILER_BEGIN) && !eps.includes(CLEAN_SETUP_BEGIN) && !eps.includes("% IconSplitter IPTC begin")) return eps;
  const metadata = readXmpMetadataFromEps(eps);
  const clean = stripPreviousEmbedding(eps);
  if (metadata === null) throw new Error("unverified EPS metadata envelope");
  // A delivered (clean) envelope and the pipeline's own envelope both rebuild
  // byte-for-byte from the file's metadata — nothing else may pass this gate.
  if (embedXmpMetadataInEps(clean, metadata, { clean: true }) === eps) return clean;
  if (embedXmpMetadataInEps(clean, metadata) !== eps) throw new Error("unverified EPS metadata envelope");
  return clean;
}

/** Whether this EPS carries a delivered-file envelope (one carrier, no producer identity). */
export function isCleanEps(eps: string): boolean {
  return eps.includes(CLEAN_SETUP_BEGIN) || eps.includes(CLEAN_TRAILER_BEGIN);
}
