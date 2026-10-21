// epsaicheck.ts — full outer-DSC + compressed `%AI9_DataStream` Illustrator
// format & zero-raster inspector (`design.md` §4 Tier 1). Detects:
//  1) ANY raster operator or `shfill` in outer PostScript OR inflated `%AI9_DataStream`
//  2) Missing outer `Adobe Illustrator(R)` / `AI11EPS` / `%AI9_PrintingDataBegin`
//     headers (which cause Illustrator 30.x to dispatch to `MPSParser.aip`)
//  3) Malformed `%AI9_PrivateDataBegin` concatenation, duplicate `%!PS-Adobe-3.0`,
//     corrupt ASCII85/zlib, or any AI 9–30.x stack/block error (`epsaistate.ts`).

import { findRasterOperators } from "./epscheck";
import { decodeAiDataStream } from "./epsinflate";
import { runAiStreamCheck, type AiGradientInfo, type AiObjectInfo } from "./epsaistate";

export type { AiGradientInfo, AiObjectInfo, AiStopInfo } from "./epsaistate";

export interface AiInspection {
  ok: boolean;
  mpsParserFallback: boolean;
  embeddedRasterCount: number;
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

/** Inspect an EPS (`string` or raw `Uint8Array`, including DOS binary EPS) for raster & AI native validity. */
export function inspectAiEps(epsOrBytes: string | Uint8Array): AiInspection {
  const rawText = typeof epsOrBytes === "string" ? epsOrBytes : latin1FromBytes(epsOrBytes);
  const ps = unwrapDosEpsIfPresent(rawText);
  const errors: string[] = [];
  const outerRasters = findRasterOperators(ps);
  errors.push(...outerRasters);
  const head = ps.split("%%EndComments")[0] ?? "";
  const mpsFallback = OUTER_AI_REQUIRED.some((marker) => !head.includes(marker));
  if (mpsFallback) errors.push("missing outer Adobe Illustrator native format signature (would invoke MPSParser.aip)");
  const priv = extractAiPrivateStream(ps, errors);
  if (priv === null) {
    return { ok: false, mpsParserFallback: mpsFallback, embeddedRasterCount: outerRasters.length, errors, gradients: [], objects: [] };
  }
  const innerRasters = findRasterOperators(priv.inflated);
  errors.push(...innerRasters);
  const vm = runAiStreamCheck(priv.concatenated);
  errors.push(...vm.errors);
  const embeddedRasterCount = outerRasters.length + innerRasters.length;
  return {
    ok: errors.length === 0,
    mpsParserFallback: mpsFallback,
    embeddedRasterCount,
    errors,
    gradients: vm.gradients,
    objects: vm.objects,
  };
}

/** Verify `%AI9_PrivateDataBegin` when present (or required); returns human-readable errors. */
export function verifyAiPrivateStream(eps: string): string[] {
  if (!eps.includes("%AI9_PrivateDataBegin")) return [];
  return inspectAiEps(eps).errors;
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
  const rawLines = ps.slice(dataAt + "%AI9_DataStream".length, end).trim();
  let inflated: string;
  try {
    inflated = decodeAiDataStream(rawLines);
  } catch (err) {
    errors.push(`corrupt %AI9_DataStream zlib/ASCII85 payload: ${(err as Error).message}`);
    return null;
  }
  checkInflatedHead(inflated, errors);
  return { inflated, concatenated: `${preHeader}\n${inflated}` };
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
  if (!inflated.includes("%AI5_FileFormat")) errors.push("inflated %AI9_DataStream missing %AI5_FileFormat");
  if (!inflated.trimEnd().endsWith("%%EOF")) errors.push("inflated %AI9_DataStream missing terminal %%EOF");
}
