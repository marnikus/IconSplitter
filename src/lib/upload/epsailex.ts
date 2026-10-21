// epsailex.ts — line-oriented tokenizer for native Adobe Illustrator editing
// streams (`%_` pseudo-comment tokens, `(…)` strings, `<…>` hex, `[` / `]`).

export type AiVal =
  | { kind: "num"; n: number }
  | { kind: "str"; s: string }
  | { kind: "arr"; items: AiVal[] }
  | { kind: "hex" };

export function lexAiLine(line: string, lineNo: number, errors: string[]): AiVal[] {
  const normalized = line.replace(/%_/g, " ");
  const out: AiVal[] = [];
  let i = 0;
  while (i < normalized.length && errors.length === 0) {
    const ch = normalized[i];
    if (ch <= " ") { i++; continue; }
    if (ch === "%") break;
    i = lexNextToken(normalized, i, lineNo, { out, errors });
  }
  return out;
}

function lexNextToken(src: string, at: number, lineNo: number, sink: { out: AiVal[]; errors: string[] }): number {
  const ch = src[at];
  if (ch === "(") return readParenString(src, at, lineNo, sink);
  if (ch === "<") return readHexString(src, at, lineNo, sink);
  if (ch === "[" || ch === "]") { sink.out.push({ kind: "str", s: `\0${ch}` }); return at + 1; }
  const word = /^[^\s()<>[\]%]+/.exec(src.slice(at))?.[0] ?? "";
  sink.out.push(isNumberWord(word) ? { kind: "num", n: Number(word) } : { kind: "str", s: `\0${word}` });
  return at + word.length;
}

function readHexString(src: string, start: number, lineNo: number, sink: { out: AiVal[]; errors: string[] }): number {
  const end = src.indexOf(">", start + 1);
  if (end < 0) { sink.errors.push(`line ${lineNo}: unclosed hex`); return src.length; }
  sink.out.push({ kind: "hex" });
  return end + 1;
}

function readParenString(src: string, start: number, lineNo: number, sink: { out: AiVal[]; errors: string[] }): number {
  let i = start + 1;
  let depth = 1;
  let acc = "";
  while (i < src.length && depth > 0) {
    const c = src[i++];
    if (c === "\\" && i < src.length) acc += src[i++];
    else { depth += c === "(" ? 1 : c === ")" ? -1 : 0; if (depth > 0) acc += c; }
  }
  if (depth !== 0) sink.errors.push(`line ${lineNo}: unclosed string`);
  else sink.out.push({ kind: "str", s: acc });
  return i;
}

function isNumberWord(w: string): boolean {
  return /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(w);
}
