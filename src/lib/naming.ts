// naming.ts — pure naming rules for batch processing (spec §4, §5).
// Owns: _AI eligibility parse, reference derivation, split folder/image names,
// variation suffixes, batch path layout. No IO, no browser APIs (RULE 3).

export interface AiName {
  base: string; // without _AI and without extension
  suffix: string; // numeric tail after _AI: "" | "_7" | "_9_01" (batch outputs)
  ext: string; // includes the dot, original case
}

const AI_RE = /^(.+)_AI((?:_\d+)*)(\.[A-Za-z0-9]+)$/i;
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"];

/** Parses `name_AI.ext` / `name_AI_7.ext` / `name_AI_9_01.ext`; null when not eligible. */
export function parseAiName(fileName: string): AiName | null {
  const m = AI_RE.exec(fileName);
  if (!m) return null;
  return { base: m[1], suffix: m[2], ext: m[3] };
}

/** Eligible = parseable AI name with an image extension. */
export function isEligibleImage(fileName: string): boolean {
  const p = parseAiName(fileName);
  return p !== null && isImageExt(p.ext);
}

export function isImageExt(ext: string): boolean {
  return IMAGE_EXTS.includes(ext.toLowerCase());
}

/** This app's own versioned output (`X_AI_v2.svg`) — an artifact, not a source. */
export function isVersionArtifact(fileName: string): boolean {
  const m = /^(.*)_v\d+\.svg$/i.exec(fileName);
  return m !== null && parseAiName(`${m[1]}.svg`) !== null;
}

/** Reference image file name for a parsed AI name (spec §4). */
export function referenceName(n: AiName): string {
  return `${n.base}${n.ext}`;
}

/** File name without extension (folder name for split results, spec §5). */
export function splitFolderName(sourceFile: string): string {
  const i = sourceFile.lastIndexOf(".");
  return i > 0 ? sourceFile.slice(0, i) : sourceFile;
}

/** Split image file name: `<folder>_<NN>.png`, padded (spec §5). */
export function splitImageName(folder: string, index: number): string {
  return `${folder}_${pad2(index)}.png`;
}

/** Variation suffix `_v02…` appended when needed; v<=1 leaves name untouched. */
export function withVariation(folder: string, v: number): string {
  return v <= 1 ? folder : `${folder}_v${pad2(v)}`;
}

/** `YYYY-MM/YYYY-MM-DD_HH-mm-ss` batch path from a date (spec §5). */
export function batchPath(d: Date): string {
  const m = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const s = `${m}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
  return `${m}/${s}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
