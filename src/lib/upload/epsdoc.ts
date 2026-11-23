// epsdoc.ts — the document layer of the EPS writer (design §2.5): the DSC
// comment block, the Illustrator artboard comments, the PROLOG the body is
// written against, the setup, and structural verification. Split out of
// `eps.ts` (RULE 18) so the shape walker there stays about SVG, and every fact
// about what makes the file an EPS 10 / Illustrator-compatible document lives
// in ONE place here.
//
// 2026-11-19 — "make it look like a drawing program wrote it": a delivered EPS
// used to open with two empty sections (`%%BeginProlog`/`%%BeginSetup`) and then
// a wall of full-word operators, one `gsave` and one identity `concat` per
// shape. That reads as a generator's log, not as a document. It now carries the
// comment set a real Illustrator-compatible export carries, a prolog that
// supplies the short operators the body actually uses, the document transform
// and the pen defaults in the setup (where a reader expects them), one named
// layer, and DSC-format timestamps. The one thing it never does is claim
// somebody else wrote it: `%%Creator` names this program, the procset is our
// own (`VectorEPS`, not an Adobe resource name), and no `Adobe Illustrator`
// string appears anywhere (see docs/current/sor/upload-eps.md).

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
  /** `%%CreationDate` — the run's clock, as the ISO string the pipeline knows; written as DSC `D:…`. */
  createdAt?: string;
  /** The single layer's name; `Layer 1` when nobody said. */
  layerName?: string;
}

/**
 * What every valid EPS 10 document must carry (checked by `verifyEps`). These
 * are the markers a reader actually uses; the additional Illustrator comments
 * are informative, so their absence is a smell, not a failure.
 */
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

/** The name of the prolog procset this writer supplies (ours, never Adobe's). */
export const PROCSET = "VectorEPS";

/**
 * The operators the body is written with, and the PostScript they stand for.
 * A drawing program's output is compact because its prolog supplies these; the
 * body then reads as geometry (`0 0 m 10 0 l h f`), not as a sentence.
 */
const PROLOG: [string, string][] = [
  ["n", "newpath"], ["m", "moveto"], ["l", "lineto"], ["c", "curveto"], ["h", "closepath"],
  ["f", "fill"], ["f*", "eofill"], ["S", "stroke"], ["W", "clip"],
  ["w", "setlinewidth"], ["J", "setlinecap"], ["j", "setlinejoin"], ["M", "setmiterlimit"], ["d", "setdash"],
  ["rg", "setrgbcolor"], ["q", "gsave"], ["Q", "grestore"],
];

/**
 * The pen every object starts with — written ONCE, in the setup. A body then
 * writes only what it changes, which is what makes a stroke look like a stroke
 * and not like five redundant state lines.
 */
export const PEN_DEFAULTS = "1 w [] 0 d 0 J 0 j 4 M";

/** Everything one finished document is assembled from. */
export interface EpsDoc {
  /** The root viewBox — its origin and size place the artwork. */
  viewBox: number[];
  /** The integer DSC box (`%%BoundingBox`), what a Level-1 reader uses. */
  box: EpsBoundingBox;
  /** The exact box (`%%HiResBoundingBox`), in points. */
  hires: EpsBoundingBox;
  /** The emitted PostScript body, one object per entry. */
  body: string[];
  opts: EpsOptions;
}

/**
 * The EPS 10 document: header, prolog, setup (document transform + pen
 * defaults), one layer holding the body, then the trailer.
 */
export function assemble({ viewBox, box, hires, body, opts }: EpsDoc): string {
  const lines = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    ...commentLines(box, hires, opts),
    "%%EndComments",
    "%%BeginProlog",
    ...prologLines(),
    "%%EndProlog",
    "%%BeginSetup",
    uprightingMatrix(viewBox, hires),
    PEN_DEFAULTS,
    "%%EndSetup",
    "%%Page: 1 1",
    ...layerOpen(opts.layerName ?? "Layer 1"),
    ...body,
    "LB",
    "%AI5_EndLayer--",
    "%%PageTrailer",
    "%%Trailer",
    "%%EOF",
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Anchor the artwork to the exact HiRes artboard; the integer DSC box only
 * rounds outward for legacy readers (`%AI5_ArtSize` preserves the exact size).
 * `concat` takes ONE matrix, never six bare numbers (I-61 / Illustrator).
 */
function uprightingMatrix(viewBox: number[], hires: EpsBoundingBox): string {
  const tx = fmt(hires.llx - PX_TO_PT * viewBox[0]);
  const ty = fmt(hires.ury + PX_TO_PT * viewBox[1]);
  return `[${fmt(PX_TO_PT)} 0 0 ${fmt(-PX_TO_PT)} ${tx} ${ty}] concat`;
}

/** The DSC + Illustrator comment block, in the order a reader prefers. */
function commentLines(box: EpsBoundingBox, hires: EpsBoundingBox, opts: EpsOptions): string[] {
  return [
    "%%Creator: IconSplitter",
    `%%Title: (${dscString(opts.title ?? "export.eps")})`,
    ...creationDate(opts.createdAt),
    `%%BoundingBox: ${box.llx} ${box.lly} ${box.urx} ${box.ury}`,
    `%%HiResBoundingBox: ${fmt(hires.llx)} ${fmt(hires.lly)} ${fmt(hires.urx)} ${fmt(hires.ury)}`,
    "%%DocumentData: Clean7Bit",
    "%%LanguageLevel: 3",
    "%%DocumentProcessColors: Cyan Magenta Yellow Black",
    `%%DocumentSuppliedResources: procset ${PROCSET} 1.0 0`,
    "%%Pages: 1",
    "%%PageOrder: Ascend",
    "%%PageOrigin: 0 0",
    ...illustratorArtboard(hires),
  ];
}

function creationDate(iso: string | undefined): string[] {
  const date = iso === undefined ? null : dscDate(iso);
  return date === null ? [] : [`%%CreationDate: ${date}`];
}

/**
 * An ISO timestamp as DSC wants it: `D:YYYYMMDDHHmmSS±HH'MM'`. Anything that is
 * not a timestamp with a zone yields null — a made-up date is worse than none.
 */
export function dscDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.exec(iso.trim());
  if (m === null) return null;
  const zone = m[7] === "Z" ? "+00'00'" : `${normalizeZone(m[7]).slice(0, 3)}'${normalizeZone(m[7]).slice(3)}'`;
  return `D:${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}${zone}`;
}

/** `+02:00` → `+0200`. */
function normalizeZone(zone: string): string {
  return zone.replace(":", "");
}

/** The prolog: the short operators the body is written with, and nothing else. */
function prologLines(): string[] {
  return [
    `%%BeginResource: procset ${PROCSET} 1.0 0`,
    ...PROLOG.map(([name, op]) => `/${name} {${op}} bind def`),
    "%%EndResource",
  ];
}

/** Illustrator's layer markers around the artwork: a drawing program names its layers. */
function layerOpen(name: string): string[] {
  return [
    "%AI5_BeginLayer",
    "1 1 1 1 0 0 0 79 128 255 Lb", // visible, previewable, enabled, printable, not dimmed, no masks, colour index, colour
    `(${dscString(name)}) Ln`,
  ];
}

/** Illustrator's artboard comments: AI5 stores height then width, and a centred template point. */
function illustratorArtboard(box: EpsBoundingBox): string[] {
  const width = box.urx - box.llx;
  const height = box.ury - box.lly;
  const cx = (box.llx + box.urx) / 2;
  const cy = (box.lly + box.ury) / 2;
  return [
    "%AI3_ColorUsage: Color",
    "%AI5_FileFormat 4.0",
    "%AI3_DocumentPreview: None",
    `%AI5_ArtSize: ${fmt(height)} ${fmt(width)}`,
    "%AI5_NumLayers: 1",
    `%AI3_TemplateBox: ${fmt(cx)} ${fmt(cy)} ${fmt(cx)} ${fmt(cy)}`,
    `%AI3_TileBox: ${fmt(box.llx)} ${fmt(box.lly)} ${fmt(box.urx)} ${fmt(box.ury)}`,
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
  const errors = EPS10_MARKERS.filter((marker) => !eps.includes(marker) && !(marker === "%%DocumentData: Clean7Bit" && eps.includes("%%DocumentData: Clean8Bit"))).map((marker) => `missing ${marker.replace(/:$/, "")}`);
  return verifyDsc(eps, [...errors, ...checkPostScript(eps)]);
}

/**
 * The converter-neutral gate every EPS passes before commit (2026-10-09):
 * DSC envelope AND the closed vector program grammar, after canonical XMP
 * validation. External converter code that cannot be audited fails closed.
 */
export function verifyEpsDocument(eps: string): EpsVerification {
  return verifyDsc(eps, [...(/^%%LanguageLevel:\s*\d/m.test(eps) ? [] : ["missing %%LanguageLevel"]), ...checkPostScript(eps)]);
}

function verifyDsc(eps: string, errors: string[]): EpsVerification {
  if (!eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")) errors.unshift("missing %!PS-Adobe-3.0 EPSF-3.0 header");
  const m = /^%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/m.exec(eps);
  if (m === null) errors.push("missing or malformed %%BoundingBox");
  if (!eps.trimEnd().endsWith("%%EOF")) errors.push("missing %%EOF");
  const box = m === null ? null : { llx: +m[1], lly: +m[2], urx: +m[3], ury: +m[4] };
  return { ok: errors.length === 0, errors, boundingBox: box };
}
