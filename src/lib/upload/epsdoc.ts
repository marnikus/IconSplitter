// epsdoc.ts — the document layer of the EPS writer (design §2.5): the DSC
// comment block, the two bounding boxes, the uprighting CTM and the structural
// verification of a finished document. Split out of `eps.ts` (RULE 18) so the
// shape walker there stays about SVG, and every fact about what makes the file
// an **EPS 10 / Illustrator-10-compatible** document lives in ONE place here.

import { fmt } from "./geom";

/** SVG user units (px at 96 DPI) → PostScript points. */
export const PX_TO_PT = 0.75;

export interface EpsBoundingBox { llx: number; lly: number; urx: number; ury: number }

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
  const upright = `${fmt(PX_TO_PT)} 0 0 ${fmt(-PX_TO_PT)} ${fmt(-PX_TO_PT * viewBox[0])} ${fmt(PX_TO_PT * (viewBox[1] + viewBox[3]))} concat`;
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
    `%%HiResBoundingBox: ${hires.llx} ${hires.lly} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    "%%DocumentData: Clean7Bit",
    "%%LanguageLevel: 3",
  );
  return lines;
}

/** A DSC `(…)` string: backslash and parentheses escaped, newlines flattened. */
function dscString(value: string): string {
  return value.replace(/[\\()]/g, (ch) => `\\${ch}`).replace(/\s+/g, " ");
}

export type EpsProfile = "eps10" | "generic";

/** Verifies an EPS 10 document: header, the DSC markers, bounding box, %%EOF. */
export function verifyEps(eps: string): EpsVerification {
  return verifyEpsDocument(eps, "eps10");
}

/** Profile-aware verify (D6): builtin is EPS 10; Inkscape/Cairo is generic. */
export function verifyEpsDocument(eps: string, profile: EpsProfile): EpsVerification {
  const errors: string[] = [];
  const box = collectVerifyErrors(eps, profile, errors);
  return { ok: errors.length === 0, errors, boundingBox: box };
}

function collectVerifyErrors(eps: string, profile: EpsProfile, errors: string[]): EpsBoundingBox | null {
  checkProfileHeader(eps, profile, errors);
  const m = /^%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/m.exec(eps);
  if (m === null) errors.push("missing or malformed %%BoundingBox");
  if (!eps.trimEnd().endsWith("%%EOF")) errors.push("missing %%EOF");
  if (profile === "generic") checkGenericBody(eps, errors);
  return m === null ? null : { llx: +m[1], lly: +m[2], urx: +m[3], ury: +m[4] };
}

function checkProfileHeader(eps: string, profile: EpsProfile, errors: string[]): void {
  if (profile === "generic") checkGenericHeader(eps, errors);
  else checkEps10(eps, errors);
}

function checkEps10(eps: string, errors: string[]): void {
  if (!eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")) errors.push("missing %!PS-Adobe-3.0 EPSF-3.0 header");
  for (const marker of EPS10_MARKERS) {
    if (!eps.includes(marker)) errors.push(`missing ${marker.replace(/:$/, "")}`);
  }
}

function checkGenericHeader(eps: string, errors: string[]): void {
  const line = eps.split("\n")[0] ?? "";
  if (!line.startsWith("%!PS-Adobe-") || !line.includes("EPSF")) errors.push("missing EPSF header");
}

/** Generic EPS must have a non-comment body (Cairo's operators), not just DSC. */
function checkGenericBody(eps: string, errors: string[]): void {
  const body = eps.split("\n").filter((line) => line !== "" && !line.startsWith("%"));
  if (body.length === 0) errors.push("empty EPS body");
}
