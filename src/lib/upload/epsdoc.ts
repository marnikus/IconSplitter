// epsdoc.ts — the document layer of the EPS writer (design §2.5): the DSC
// comment block, the EPS and Illustrator artboard bounds, the uprighting CTM
// and structural verification. Split out of `eps.ts` (RULE 18) so the
// shape walker there stays about SVG, and every fact about what makes the file
// an **EPS 10 / Illustrator-10-compatible** document lives in ONE place here.

import { checkPostScript } from "./epscheck";
import { fmt } from "./geom";

/** SVG user units (px at 96 DPI) → PostScript points. */
export const PX_TO_PT = 0.75;

export interface EpsBoundingBox { llx: number; lly: number; urx: number; ury: number }

/** Integer DSC bounds round out from the exact art rectangle on all four sides. */
export function integerBounds(box: EpsBoundingBox): EpsBoundingBox {
  return { llx: Math.floor(box.llx), lly: Math.floor(box.lly), urx: Math.ceil(box.urx), ury: Math.ceil(box.ury) };
}

/** The document identity the DSC comments carry (never invented, never Adobe's). */
export interface EpsOptions {
  /** `%%Title` — the artifact's own file name, by convention `${stem}.eps`. */
  title?: string;
  /** `%%CreationDate` — the run's clock; omitted when unknown. */
  createdAt?: string;
}

/** What every valid EPS 10 document must carry (checked by `verifyEps`). */
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
  /** The root viewBox — its origin and size place the artwork. */
  viewBox: number[];
  /** The integer DSC box (`%%BoundingBox`), what a Level-1 reader uses. */
  box: EpsBoundingBox;
  /** The exact box (`%%HiResBoundingBox`), in points. */
  hires: EpsBoundingBox;
  /** The emitted PostScript body, one operator group per shape. */
  body: string[];
  opts: EpsOptions;
}

/** The EPS 10 document: DSC comments, the uprighting CTM, then the body. */
export function assemble({ viewBox, box, hires, body, opts }: EpsDoc): string {
  const header = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    ...commentLines(box, hires, opts),
    "%%EndComments",
    "%%BeginProlog",
    "%%EndProlog",
    "%%BeginSetup",
    "%%EndSetup",
  ].join("\n");
  // Anchor the artwork to the exact HiRes artboard; the integer DSC box only
  // rounds outward for legacy readers (AI5_ArtSize preserves the exact size).
  // `concat` takes ONE matrix, never six bare numbers (I-61 / Illustrator).
  const tx = fmt(hires.llx - PX_TO_PT * viewBox[0]);
  const ty = fmt(hires.ury + PX_TO_PT * viewBox[1]);
  const upright = `[${fmt(PX_TO_PT)} 0 0 ${fmt(-PX_TO_PT)} ${tx} ${ty}] concat`;
  return `${header}\n${upright}\n${body.join("\n")}\n%%EOF\n`;
}

/** The documented DSC comment order (Creator, Title, date, boxes, data, level). */
function commentLines(box: EpsBoundingBox, hires: EpsBoundingBox, opts: EpsOptions): string[] {
  const lines = [
    "%%Creator: IconSplitter (SVG to upload)",
    `%%Title: ${dscString(opts.title ?? "export.eps")}`,
  ];
  if (opts.createdAt !== undefined) lines.push(`%%CreationDate: ${dscString(opts.createdAt)}`);
  lines.push(
    `%%BoundingBox: ${box.llx} ${box.lly} ${box.urx} ${box.ury}`,
    `%%HiResBoundingBox: ${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    "%%DocumentData: Clean7Bit",
    "%%LanguageLevel: 3",
    ...illustratorArtboard(hires),
  );
  return lines;
}

/** Illustrator's AI5 comment stores height then width and a centered template point. */
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

/** A DSC `(…)` string: backslash and parentheses escaped, newlines flattened. */
function dscString(value: string): string {
  return value.replace(/[\\()]/g, (ch) => `\\${ch}`).replace(/\s+/g, " ");
}

/**
 * Verifies an EPS 10 document — the built-in writer's own contract: header, the
 * DSC markers, bounding box, %%EOF, AND an executable program (I-61): the
 * subset stack checker names the first instruction PostScript would stop at.
 */
export function verifyEps(eps: string): EpsVerification {
  const errors = EPS10_MARKERS.filter((marker) => !eps.includes(marker)).map((marker) => `missing ${marker.replace(/:$/, "")}`);
  return verifyDsc(eps, [...errors, ...checkPostScript(eps)]);
}

/**
 * The converter-neutral gate every EPS passes before commit (2026-10-09):
 * the EPSF-3.0 header, a declared LanguageLevel (any), a bounding box, %%EOF.
 * Inkscape's cairo output has these and NOT the EPS 10 markers above.
 */
export function verifyEpsDocument(eps: string): EpsVerification {
  return verifyDsc(eps, /^%%LanguageLevel:\s*\d/m.test(eps) ? [] : ["missing %%LanguageLevel"]);
}

function verifyDsc(eps: string, errors: string[]): EpsVerification {
  if (!eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")) errors.unshift("missing %!PS-Adobe-3.0 EPSF-3.0 header");
  const m = /^%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/m.exec(eps);
  if (m === null) errors.push("missing or malformed %%BoundingBox");
  if (!eps.trimEnd().endsWith("%%EOF")) errors.push("missing %%EOF");
  const box = m === null ? null : { llx: +m[1], lly: +m[2], urx: +m[3], ury: +m[4] };
  return { ok: errors.length === 0, errors, boundingBox: box };
}
