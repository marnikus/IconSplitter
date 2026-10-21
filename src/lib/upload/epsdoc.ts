// epsdoc.ts — the document layer of the EPS writer (design.md §3–§4): outer
// Illustrator-compatible DSC headers (`AI11EPS` + `%AI9_PrintingDataBegin`),
// uprighting CTM, and fail-closed zero-raster + native AI stream verification.

import { verifyAiPrivateStream } from "./epsaicheck";
import { checkPostScript, findRasterOperators } from "./epscheck";
import { fmt } from "./geom";
import type { Matrix } from "./geom/matrix";

/** SVG user units (px at 96 DPI) → PostScript points. */
export const PX_TO_PT = 0.75;

export interface EpsBoundingBox { llx: number; lly: number; urx: number; ury: number }

/** Integer DSC bounds round out from the exact art rectangle on all four sides. */
export function integerBounds(box: EpsBoundingBox): EpsBoundingBox {
  return { llx: Math.floor(box.llx), lly: Math.floor(box.lly), urx: Math.ceil(box.urx), ury: Math.ceil(box.ury) };
}

/** Document metadata written into DSC headers. */
export interface EpsOptions {
  /** `%%Title` — the artifact's own file name, by convention `${stem}.eps`. */
  title?: string;
  /** `%%CreationDate` — the run's clock; omitted when unknown. */
  createdAt?: string;
}

/** What every valid EPS document from the built-in writer carries. */
export const EPS10_MARKERS = [
  "%%HiResBoundingBox:",
  "%%DocumentData: Clean7Bit",
  "%%LanguageLevel: 3",
];

export interface EpsVerification {
  ok: boolean;
  errors: string[];
  boundingBox: EpsBoundingBox | null;
}

/** Everything one finished document is assembled from. */
export interface EpsDoc {
  viewBox: number[];
  box: EpsBoundingBox;
  hires: EpsBoundingBox;
  body: string[];
  trailer?: string;
  opts: EpsOptions;
}

/** Exact matrix mapping SVG root user units to y-up PostScript / Illustrator art points. */
export function uprightMatrix(viewBox: number[], hires: EpsBoundingBox): Matrix {
  return {
    a: PX_TO_PT, b: 0, c: 0, d: -PX_TO_PT,
    e: hires.llx - PX_TO_PT * viewBox[0],
    f: hires.ury + PX_TO_PT * viewBox[1],
  };
}

/** Assemble the EPS document: Illustrator DSC header, CTM, pure-vector body, trailer, %%EOF. */
export function assemble({ viewBox, box, hires, body, trailer, opts }: EpsDoc): string {
  const header = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    ...commentLines(box, hires, opts),
    "%%EndComments",
    "%%BeginProlog",
    "%%EndProlog",
    "%%BeginSetup",
    "%%EndSetup",
  ].join("\n");
  const u = uprightMatrix(viewBox, hires);
  const upright = `[${fmt(u.a)} 0 0 ${fmt(u.d)} ${fmt(u.e)} ${fmt(u.f)}] concat`;
  const parts = [header, upright, ...body];
  if (trailer !== undefined && trailer !== "") parts.push(`%%Trailer\n${trailer}`);
  return `${parts.join("\n")}\n%%EOF\n`;
}

/** Outer DSC headers matching `Adobe Illustrator(R) 30.8.2` (`icon-award-ribbon_8_02.eps`). */
function commentLines(box: EpsBoundingBox, hires: EpsBoundingBox, opts: EpsOptions): string[] {
  const lines = [
    "%%Creator: Adobe Illustrator(R) 24.0",
    "%%For: (IconSplitter) ()",
    `%%Title: ${dscString(opts.title ?? "export.eps")}`,
  ];
  if (opts.createdAt !== undefined) lines.push(`%%CreationDate: ${dscString(opts.createdAt)}`);
  lines.push(
    `%%BoundingBox: ${box.llx} ${box.lly} ${box.urx} ${box.ury}`,
    `%%HiResBoundingBox: ${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    `%%CropBox: ${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    "%%DocumentData: Clean7Bit",
    "%%LanguageLevel: 3",
    "%ADOBeginClientInjection: DocumentHeader \"AI11EPS\"",
    "%%AI8_CreatorVersion: 24.0.0",
    "%AI9_PrintingDataBegin",
    "%ADOEndClientInjection: DocumentHeader \"AI11EPS\"",
    "%%Pages: 1",
    ...illustratorArtboard(hires),
  );
  return lines;
}

/** Illustrator's outer AI5 comment stores height then width and a centered template point. */
function illustratorArtboard(box: EpsBoundingBox): string[] {
  const width = box.urx - box.llx;
  const height = box.ury - box.lly;
  const cx = (box.llx + box.urx) / 2;
  const cy = (box.lly + box.ury) / 2;
  return [
    `%AI5_ArtSize: ${fmt(height)} ${fmt(width)}`,
    `%AI3_TemplateBox: ${fmt(cx)} ${fmt(cy)} ${fmt(cx)} ${fmt(cy)}`,
  ];
}

/** Escape backslashes, parentheses, and line breaks inside a DSC comment value. */
function dscString(value: string): string {
  return value.replace(/[\\()]/g, (ch) => `\\${ch}`).replace(/\s+/g, " ");
}

/**
 * Verifies a built-in EPS document: DSC markers, executable PS stack check,
 * hard zero-raster & zero-`shfill` gate, AND native AI private-stream check.
 */
export function verifyEps(eps: string): EpsVerification {
  const errors = EPS10_MARKERS.filter((marker) => !eps.includes(marker)).map((marker) => `missing ${marker.replace(/:$/, "")}`);
  return verifyDsc(eps, [...errors, ...checkPostScript(eps)]);
}

/**
 * Converter-neutral gate enforced before commit: header, LanguageLevel,
 * BoundingBox, %%EOF, hard zero-raster + zero-`shfill` gate, AND native AI check.
 */
export function verifyEpsDocument(eps: string): EpsVerification {
  return verifyDsc(eps, /^%%LanguageLevel:\s*\d/m.test(eps) ? [] : ["missing %%LanguageLevel"]);
}

function verifyDsc(eps: string, errors: string[]): EpsVerification {
  if (!eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")) errors.unshift("missing %!PS-Adobe-3.0 EPSF-3.0 header");
  const m = /^%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/m.exec(eps);
  if (m === null) errors.push("missing or malformed %%BoundingBox");
  if (!eps.trimEnd().endsWith("%%EOF")) errors.push("missing %%EOF");
  errors.push(...findRasterOperators(eps), ...verifyAiPrivateStream(eps));
  const box = m === null ? null : { llx: +m[1], lly: +m[2], urx: +m[3], ury: +m[4] };
  return { ok: errors.length === 0, errors, boundingBox: box };
}
