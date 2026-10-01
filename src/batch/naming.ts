// naming.ts owns AI/reference filename parsing + split-output naming (pure).

export interface AiParsed {
  base: string;
  variant: number | null;
  ext: string;
  stem: string;
}

export interface SplitNameOpts {
  ext: string;
  prefix: string;
  tries: number;
}

const AI_SUFFIX = /^(.*)_AI(?:_(\d+))?$/;

export function parseAiFile(fileName: string): AiParsed | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return null;
  const stem = fileName.slice(0, dot);
  const ext = fileName.slice(dot + 1);
  if (!stem || !ext) return null;
  const m = AI_SUFFIX.exec(stem);
  if (!m || !m[1]) return null;
  return { base: m[1], variant: m[2] == null ? null : parseInt(m[2], 10), ext, stem };
}

export function isAiFile(fileName: string): boolean {
  return parseAiFile(fileName) !== null;
}

export function baseOfAi(fileName: string): string | null {
  return parseAiFile(fileName)?.base ?? null;
}

export function referenceNameFor(aiFileName: string): string | null {
  const p = parseAiFile(aiFileName);
  return p ? `${p.base}.${p.ext}` : null;
}

export function statusJsonName(base: string): string {
  return `${base}.json`;
}

export function stemOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? fileName : fileName.slice(0, dot);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function monthFolder(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function batchFolder(d: Date): string {
  const day = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return `${day}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

export function splitDirName(index1: number, prefix = "split_"): string {
  return `${prefix}${pad2(index1)}`;
}

export function splitFileName(parent: string, index1: number, ext = "png"): string {
  return `${parent}_${pad2(index1)}.${ext}`;
}

export function dirCandidates(wanted: string, prefix: string, tries: number): string[] {
  const out = [wanted];
  for (let n = 2; n <= tries; n++) out.push(`${wanted}${prefix}${pad2(n)}`);
  return out;
}

export function splitCandidates(parent: string, index1: number, opts: SplitNameOpts): string[] {
  const out = [splitFileName(parent, index1, opts.ext)];
  for (let n = 2; n <= opts.tries; n++) {
    out.push(splitFileName(`${parent}${opts.prefix}${pad2(n)}`, index1, opts.ext));
  }
  return out;
}
