// epsaicheck.ts — full outer-DSC + compressed `%AI9_DataStream` + outer-PS
// optimization & zero-raster inspector (`design.md` §2–§4). Calibrated directly
// against real `Adobe Illustrator(R) 30.8.2` (`icon-award-ribbon_8_02.eps`).

import { findRasterOperators } from "./epscheck";
import { decodeAiDataStream } from "./epsinflate";
import { runAiStreamCheck, type AiGradientInfo, type AiObjectInfo } from "./epsaistate";

export type { AiGradientInfo, AiObjectInfo, AiStopInfo } from "./epsaistate";

export interface AiInspection {
  ok: boolean;
  mpsParserFallback: boolean;
  embeddedRasterCount: number;
  maxClippedFillsPerClip: number;
  errors: string[];
  gradients: AiGradientInfo[];
  objects: AiObjectInfo[];
}

const OUTER_AI_REQUIRED = [
  "%%Creator: Adobe Illustrator(R)",
  "%ADOBeginClientInjection: DocumentHeader \"AI11EPS\"",
  "%%AI8_CreatorVersion:",
  "%AI9_PrintingDataBegin",
  "%ADOEndClientInjection: DocumentHeader \"AI11EPS\"",
];

const MAX_CLIPPED_FILLS = 24;
const MAX_CLIPPED_LINETOS = 12;

/** Inspect an EPS (`string` or raw `Uint8Array`, including DOS binary EPS) for raster, AI parity, & optimization. */
export function inspectAiEps(epsOrBytes: string | Uint8Array): AiInspection {
  const ps = unwrapDosEpsIfPresent(typeof epsOrBytes === "string" ? epsOrBytes : latin1FromBytes(epsOrBytes));
  const errors: string[] = [...findRasterOperators(ps)];
  const mpsFallback = checkOuterAiWrapper(ps, errors);
  const maxClippedFillsPerClip = checkOuterPsOptimization(ps, errors);
  const priv = extractAiPrivateStream(ps, errors);
  if (priv === null) {
    return {
      ok: false, mpsParserFallback: mpsFallback, embeddedRasterCount: countRasterErrs(errors),
      maxClippedFillsPerClip, errors, gradients: [], objects: [],
    };
  }
  errors.push(...findRasterOperators(priv.inflated));
  const vm = runAiStreamCheck(priv.concatenated);
  errors.push(...vm.errors);
  return {
    ok: errors.length === 0,
    mpsParserFallback: mpsFallback,
    embeddedRasterCount: countRasterErrs(errors),
    maxClippedFillsPerClip,
    errors,
    gradients: vm.gradients,
    objects: vm.objects,
  };
}

/** Verify `%AI9_PrivateDataBegin` when present; returns human-readable errors. */
export function verifyAiPrivateStream(eps: string): string[] {
  if (!eps.includes("%AI9_PrivateDataBegin")) return [];
  return inspectAiEps(eps).errors;
}

function countRasterErrs(errors: string[]): number {
  return errors.filter((e) => e.startsWith("forbidden raster ")).length;
}

function checkOuterAiWrapper(ps: string, errors: string[]): boolean {
  const head = ps.split("%%EndComments")[0] ?? "";
  if (OUTER_AI_REQUIRED.some((marker) => !head.includes(marker))) {
    errors.push("missing outer Adobe Illustrator native format signature (would invoke MPSParser.aip)");
    return true;
  }
  const endPrint = ps.indexOf("%AI9_PrintingDataEnd");
  const beginPriv = ps.indexOf("%AI9_PrivateDataBegin");
  if (endPrint < 0 || (beginPriv >= 0 && endPrint > beginPriv) || !ps.includes("/ai9_skip_data")) {
    errors.push("missing %AI9_PrintingDataEnd / ai9_skip_data transition before %AI9_PrivateDataBegin (triggers MPSParser.aip)");
    return true;
  }
  return false;
}

function checkOuterPsOptimization(ps: string, errors: string[]): number {
  const cut = ps.indexOf("%AI9_PrintingDataEnd");
  const outer = cut >= 0 ? ps.slice(0, cut) : ps;
  let clipDepth = 0;
  let clippedFills = 0;
  let worst = 0;
  for (const line of outer.split(/\r\n|\r|\n/)) {
    if (line.startsWith("%")) continue;
    [clipDepth, clippedFills, worst] = stepOptLine(line, [clipDepth, clippedFills, worst], errors);
  }
  return worst;
}

function stepOptLine(line: string, [depth, fills, worst]: [number, number, number], errors: string[]): [number, number, number] {
  if (/\bgrestore\b/.test(line) && depth > 0) return [depth - 1, 0, Math.max(worst, fills)];
  if (/\b(?:eoclip|clip)\b/.test(line)) return [depth + 1, 0, worst];
  if (depth === 0 || !/\bfill\b/.test(line)) return [depth, fills, worst];
  auditClippedFill(line, fills + 1, errors);
  return [depth, fills + 1, Math.max(worst, fills + 1)];
}

function auditClippedFill(line: string, count: number, errors: string[]): void {
  const linetos = (line.match(/\blineto\b/g) ?? []).length;
  if (linetos > MAX_CLIPPED_LINETOS) pushOnce(errors, `unoptimized outer PS polyline tessellation (${linetos} lineto vertices in clipped band)`);
  if (count > MAX_CLIPPED_FILLS) pushOnce(errors, `unoptimized outer PS clip group (>${MAX_CLIPPED_FILLS} stacked bands causes lag in PostScript importers)`);
}

function pushOnce(errors: string[], msg: string): void {
  if (!errors.includes(msg)) errors.push(msg);
}

function unwrapDosEpsIfPresent(raw: string): string {
  if (raw.length < 12) return raw;
  const magic = ((raw.charCodeAt(0) << 24) | (raw.charCodeAt(1) << 16) | (raw.charCodeAt(2) << 8) | raw.charCodeAt(3)) >>> 0;
  if (magic !== 0xc5d0d3c6) return raw;
  const off = u32le(raw, 4);
  const len = u32le(raw, 8);
  return off + len <= raw.length ? raw.slice(off, off + len) : raw;
}

function u32le(raw: string, at: number): number {
  return ((raw.charCodeAt(at) & 0xff)
    | ((raw.charCodeAt(at + 1) & 0xff) << 8)
    | ((raw.charCodeAt(at + 2) & 0xff) << 16)
    | ((raw.charCodeAt(at + 3) & 0xff) << 24)) >>> 0;
}

function latin1FromBytes(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  }
  return parts.join("");
}

function extractAiPrivateStream(ps: string, errors: string[]): { inflated: string; concatenated: string } | null {
  const begin = ps.indexOf("%AI9_PrivateDataBegin");
  if (begin < 0) { errors.push("missing %AI9_PrivateDataBegin native Illustrator vector section"); return null; }
  const dataAt = ps.indexOf("%AI9_DataStream", begin);
  const end = ps.indexOf("%AI9_PrivateDataEnd", dataAt < 0 ? begin : dataAt);
  if (dataAt < 0 || end < 0) { errors.push("malformed %AI9_PrivateDataBegin / %AI9_DataStream section"); return null; }
  const preHeader = ps.slice(begin + "%AI9_PrivateDataBegin".length, dataAt).trim();
  checkPrivateHeader(preHeader, errors);
  const privSection = ps.slice(begin, end + "%AI9_PrivateDataEnd".length);
  if (privSection.split(/\r\n|\r|\n/).some((l) => l.length > 255)) {
    errors.push("private section line exceeds 255-byte AI9_read_buffer limit");
  }
  const rawLines = ps.slice(dataAt + "%AI9_DataStream".length, end).trim();
  let inflated: string;
  try {
    inflated = decodeAiDataStream(rawLines);
  } catch (err) {
    errors.push(`corrupt %AI9_DataStream zlib/ASCII85 payload: ${(err as Error).message}`);
    return null;
  }
  checkInflatedHead(inflated, errors);
  return { inflated, concatenated: `${preHeader}\r\n${inflated}` };
}

function checkPrivateHeader(preHeader: string, errors: string[]): void {
  if (!preHeader.startsWith("%!PS-Adobe-3.0 EPSF-3.0")) errors.push("private header missing %!PS-Adobe-3.0 EPSF-3.0");
  if (!preHeader.includes("%%Creator: Adobe Illustrator(R) 10.0")) errors.push("private header missing %%Creator: Adobe Illustrator(R) 10.0");
  if (!preHeader.includes("%%AI8_CreatorVersion:")) errors.push("private header missing %%AI8_CreatorVersion");
  if (!preHeader.includes("%%Canvassize:")) errors.push("private header missing %%Canvassize");
}

function checkInflatedHead(inflated: string, errors: string[]): void {
  const trimmed = inflated.trimStart();
  if (trimmed.startsWith("%!PS-Adobe")) {
    errors.push("inflated %AI9_DataStream must start at %%BoundingBox, not a duplicate %!PS-Adobe header");
  }
  if (!trimmed.startsWith("%%BoundingBox:")) errors.push("inflated %AI9_DataStream must begin with %%BoundingBox:");
  if (!inflated.includes("%%HiResBoundingBox:")) errors.push("inflated %AI9_DataStream missing %%HiResBoundingBox:");
  if (!inflated.includes("%AI5_FileFormat 6.0")) errors.push("inflated %AI9_DataStream missing %AI5_FileFormat 6.0");
  if (!inflated.includes("%AI5_BeginPalette") || !inflated.includes("%AI5_EndPalette")) {
    errors.push("inflated %AI9_DataStream missing %AI5_BeginPalette swatch table");
  }
  if (!inflated.trimEnd().endsWith("%%EOF")) errors.push("inflated %AI9_DataStream missing terminal %%EOF");
}
