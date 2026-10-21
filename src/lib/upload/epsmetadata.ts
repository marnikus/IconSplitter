// epsmetadata.ts — document-level XMP and IPTC-IIM for EPS.
// XMP is embedded as a pdfmark metadata stream (Adobe XMP Part 3, §1.6.2.1.3).
// IPTC-IIM is embedded as a hex-encoded comment block (%%IconSplitterIPTC:
// <hex>) so stock sites that read the legacy IIM carrier find the accepted
// fields. Both carriers are written into every exported EPS; both are read
// back and verified before commit. The converter output is left intact except
// for the attached metadata envelopes.

import { fnv1a32 } from "../pairing";
import type { IconMetadata } from "./meta";
import { metadataFingerprint } from "./meta";
import { buildXmpPacket, readXmpPacket } from "./xmp";
import {
  encodeIptcBlock,
  readIptcFromEps,
  hasIptcInEps,
} from "./iptc";

const SETUP_BEGIN = "% IconSplitter XMP setup begin";
const SETUP_END = "% IconSplitter XMP setup end";
const TRAILER_BEGIN = "% IconSplitter XMP trailer begin";
const TRAILER_END = "% IconSplitter XMP trailer end";
const IPTC_BEGIN = "% IconSplitterIPTC begin";
const IPTC_END = "% IconSplitterIPTC end";

/** Add XMP (pdfmark stream) and IPTC-IIM (hex comment block) to an EPS document. */
export function embedXmpMetadataInEps(eps: string, metadata: IconMetadata): string {
  let clean = stripPreviousEmbedding(eps);
  clean = stripIptcBlock(clean);
  const eol = lineEndingOf(clean);
  const packet = buildXmpPacket(metadata).replace(/\n/g, eol);
  const identity = clean.replace(/^%ADO_ContainsXMP:.*(?:\r\n|\r|\n|$)/gm, "")
    .replace(/^%%DocumentData:.*(?:\r\n|\r|\n|$)/gm, "");
  const id = `${metadataFingerprint(metadata)}${fnv1a32(identity).toString(16).padStart(8, "0")}`;
  const header = addXmpHeader(clean, eol);
  const setup = setupBlock(id, packet, eol);
  const trailer = trailerBlock(id, eol);
  const iptc = iptcBlock(metadata, eol);
  const setupAt = afterSetup(header);
  const trailerAt = beforeTrailer(header);
  const closeAt = trailerAt !== null && trailerAt > setupAt ? trailerAt : header.length;
  const withXmp =
    `${header.slice(0, setupAt)}${setup}${eol}${header.slice(setupAt, closeAt)}${trailer}${eol}${header.slice(closeAt)}`;
  return insertIptcBlock(withXmp, iptc);
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

/** The IPTC-IIM fields read back from the EPS comment block, or null. */
export function readIptcMetadataFromEps(eps: string): Partial<IconMetadata> | null {
  return readIptcFromEps(eps);
}

/** Whether an EPS packet reads back exactly the accepted Title, Description, and Tags (XMP + IPTC-IIM). */
export function verifyEpsMetadata(eps: string, expected: IconMetadata): boolean {
  const xmp = readXmpMetadataFromEps(eps);
  const iptc = readIptcMetadataFromEps(eps);
  if (xmp === null && iptc === null) return false;
  const xmpOk =
    xmp !== null &&
    xmp.title === expected.title &&
    xmp.description === expected.description &&
    xmp.tags.join("\u0000") === expected.tags.join("\u0000");
  const iptcOk =
    iptc !== null &&
    (iptc.title ?? "") === expected.title &&
    (iptc.description ?? "") === expected.description &&
    (iptc.tags ?? []).join("\u0000") === expected.tags.join("\u0000");
  return xmpOk || iptcOk; // either carrier satisfying the fields is sufficient
}

function iptcBlock(metadata: IconMetadata, eol: string): string {
  const block = encodeIptcBlock(metadata);
  const hex = block.reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "");
  // For very long IPTC blocks, split across multiple comment lines. Each hex
  // line must start with `%` so it is a PostScript comment, not executable
  // code in the EPS header (raw hex tokens break Illustrator's parser).
  const chunks: string[] = [];
  for (let i = 0; i < hex.length; i += 200) chunks.push(`% ${hex.slice(i, i + 200)}`);
  return [IPTC_BEGIN, ...chunks, IPTC_END, ""].join(eol);
}

function insertIptcBlock(eps: string, iptc: string): string {
  const lines = linesOf(eps);
  const endComments = lines.findIndex((l) => /^%%EndComments\b/.test(lineText(l)));
  const insertAt = endComments >= 0 ? endComments : lines.length;
  lines.splice(insertAt, 0, iptc);
  return lines.join("");
}

function stripIptcBlock(text: string): string {
  return stripMarkedBlock(text, IPTC_BEGIN, IPTC_END);
}

function setupBlock(id: string, packet: string, eol: string): string {
  const dictionary = `IconSplitterXmp_${id}`;
  const stream = `IconSplitterStream_${id}`;
  const marker = uniquePacketMarker(id, packet);
  return [
    SETUP_BEGIN,
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
    SETUP_END,
  ].join(eol);
}

function trailerBlock(id: string, eol: string): string {
  const dictionary = `IconSplitterXmp_${id}`;
  return [TRAILER_BEGIN, `${dictionary} begin`, "[/EMC pdfmark", "end", TRAILER_END].join(eol);
}

function uniquePacketMarker(id: string, packet: string): string {
  let marker = `% IconSplitterXmpEnd_${id}`;
  while (packet.includes(marker)) marker += "_";
  return marker;
}

function stripPreviousEmbedding(eps: string): string {
  let clean = stripMarkedBlock(eps, SETUP_BEGIN, SETUP_END);
  clean = stripMarkedBlock(clean, TRAILER_BEGIN, TRAILER_END);
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
  return (
    findLineSpan(eps, /^%%PageTrailer\b/)?.start ??
    findLineSpan(eps, /^%%Trailer\b/)?.start ??
    findLineSpan(eps, /^%%EOF\b/)?.start ??
    (eof < 0 ? null : eof)
  );
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
  const hasXmp = eps.includes(SETUP_BEGIN) || eps.includes(TRAILER_BEGIN);
  const hasIptc = hasIptcInEps(eps);
  if (!hasXmp && !hasIptc) return eps;
  const xmp = readXmpMetadataFromEps(eps);
  const clean = stripPreviousEmbedding(eps);
  const cleanNoIptc = stripIptcBlock(clean);
  if (xmp !== null) {
    const rebuilt = embedXmpMetadataInEps(cleanNoIptc, xmp);
    if (rebuilt !== eps) throw new Error("unverified EPS metadata envelope");
  } else if (hasIptc) {
    // IPTC-only envelope: re-embed IPTC into the clean document and compare.
    const iptc = readIptcMetadataFromEps(eps);
    if (iptc === null) throw new Error("unverified EPS metadata envelope");
    const eol = lineEndingOf(cleanNoIptc);
    const iptcBlockStr = iptcBlockFromPartial(iptc, eol);
    const rebuilt = insertIptcBlock(cleanNoIptc, iptcBlockStr);
    if (rebuilt !== eps) throw new Error("unverified EPS metadata envelope");
  }
  return cleanNoIptc;
}

/** Build an IPTC comment block from partial metadata (IPTC-only envelope). */
function iptcBlockFromPartial(partial: Partial<IconMetadata>, eol: string): string {
  const meta: IconMetadata = {
    title: partial.title ?? "",
    description: partial.description ?? "",
    tags: partial.tags ?? [],
  };
  return iptcBlock(meta, eol);
}
