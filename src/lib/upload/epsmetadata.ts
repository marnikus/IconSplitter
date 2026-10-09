// epsmetadata.ts — document-level XMP for EPS (Adobe XMP Part 3, §1.6.2.1.3).
// The converter output is left intact; a pdfmark metadata stream is attached
// before drawing and the drawing is bracketed by BDC/EMC, for both EPS writers.

import { fnv1a32 } from "../pairing";
import type { IconMetadata } from "./meta";
import { metadataFingerprint } from "./meta";
import { buildXmpPacket, readXmpPacket } from "./xmp";

const SETUP_BEGIN = "% IconSplitter XMP setup begin";
const SETUP_END = "% IconSplitter XMP setup end";
const TRAILER_BEGIN = "% IconSplitter XMP trailer begin";
const TRAILER_END = "% IconSplitter XMP trailer end";

/** Add a converter-neutral, Adobe-compatible XMP stream to an EPS document. */
export function embedXmpMetadataInEps(eps: string, metadata: IconMetadata): string {
  const clean = stripPreviousEmbedding(eps);
  const eol = lineEndingOf(clean);
  const packet = buildXmpPacket(metadata).replace(/\n/g, eol);
  const identity = clean.replace(/^%ADO_ContainsXMP:.*(?:\r\n|\r|\n|$)/gm, "")
    .replace(/^%%DocumentData:.*(?:\r\n|\r|\n|$)/gm, "");
  const id = `${metadataFingerprint(metadata)}${fnv1a32(identity).toString(16).padStart(8, "0")}`;
  const dictionary = `IconSplitterXmp_${id}`;
  const stream = `IconSplitterStream_${id}`;
  let marker = `% IconSplitterXmpEnd_${id}`;
  while (packet.includes(marker)) marker += "_";
  const header = addXmpHeader(clean, eol);
  const setup = setupBlock({ dictionary, stream, marker, packet, eol });
  const trailer = trailerBlock(dictionary, eol);
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

/** Whether an EPS packet reads back exactly the accepted Title, Description, and Tags. */
export function verifyEpsMetadata(eps: string, expected: IconMetadata): boolean {
  const actual = readXmpMetadataFromEps(eps);
  return actual !== null && actual.title === expected.title && actual.description === expected.description
    && actual.tags.join("\u0000") === expected.tags.join("\u0000");
}

function setupBlock(input: { dictionary: string; stream: string; marker: string; packet: string; eol: string }): string {
  const { dictionary, stream, marker, packet, eol } = input;
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

function trailerBlock(dictionary: string, eol: string): string {
  return [TRAILER_BEGIN, `${dictionary} begin`, "[/EMC pdfmark", "end", TRAILER_END].join(eol);
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
  const pageSetup = indexAfterLine(eps, /^%%EndPageSetup\b/);
  if (pageSetup !== null) return pageSetup;
  const setup = indexAfterLine(eps, /^%%EndSetup\b/);
  if (setup !== null) return setup;
  const comments = indexAfterLine(eps, /^%%EndComments\b/);
  if (comments !== null) return comments;
  return startOfLine(eps, headerEnd(linesOf(eps)));
}

function beforeTrailer(eps: string): number | null {
  return indexOfLine(eps, /^%%PageTrailer\b/)
    ?? indexOfLine(eps, /^%%Trailer\b/)
    ?? indexOfLine(eps, /^%%EOF\b/)
    ?? (eps.lastIndexOf("%%EOF") < 0 ? null : eps.lastIndexOf("%%EOF"));
}

function indexAfterLine(eps: string, pattern: RegExp): number | null {
  let at = 0;
  for (const line of linesOf(eps)) {
    if (pattern.test(lineText(line))) return at + line.length;
    at += line.length;
  }
  return null;
}

function indexOfLine(eps: string, pattern: RegExp): number | null {
  let at = 0;
  for (const line of linesOf(eps)) {
    if (pattern.test(lineText(line))) return at;
    at += line.length;
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
