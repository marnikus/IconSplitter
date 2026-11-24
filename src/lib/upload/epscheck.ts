// epscheck.ts — is the built-in EPS an executable program? (I-61, 2026-10-09)
// An EPS is PostScript: if one instruction is invalid the interpreter stops
// before it reaches the artwork. The report that made this file: the uprighting
// CTM was written as bare numbers (`0.75 0 0 -0.75 0 750 concat`), `concat`
// takes ONE array, Illustrator raised /typecheck and opened nothing. No
// Ghostscript is available to the app or its tests, so this is an operand-stack
// model of the writer's OWN operator subset: numbers, `[…]` arrays, and the
// operators `lib/upload/eps` emits — each pops what PostScript documents and
// leaves what PostScript leaves. It judges only the built-in writer's output;
// a converter's PostScript (Inkscape/cairo: procedures, dictionaries) is outside
// its vocabulary and is refused by the vector-only delivery gate.

import { checkShading } from "./epsshading";
import { verifiedEpsArtwork } from "./epsmetadata";

type Kind = "number" | "array";
type Operand = number | number[];

/** What each operator pops, in stack order (last entry = top of stack). */
const POPS: Record<string, Kind[]> = {
  newpath: [], closepath: [], fill: [], eofill: [], stroke: [], clip: [], eoclip: [], gsave: [], grestore: [],
  moveto: ["number", "number"], lineto: ["number", "number"],
  curveto: ["number", "number", "number", "number", "number", "number"],
  concat: ["array"], setrgbcolor: ["number", "number", "number"],
  setlinewidth: ["number"], setdash: ["array", "number"],
  setlinecap: ["number"], setlinejoin: ["number"], setmiterlimit: ["number"],
};

interface State {
  stack: Operand[];
  array: number[] | null;
  /** The current path has a current point (a `moveto` happened, nothing consumed it since). */
  hasPath: boolean;
  saved: boolean[];
  errors: string[];
}

/**
 * The first defect PostScript would stop at, as `line N: …` (or `end: …` for
 * what is wrong once the program is over); empty when it runs. Like the
 * interpreter it stops at the first error — what follows never executes.
 */
export function checkPostScript(program: string): string[] {
  const st: State = { stack: [], array: null, hasPath: false, saved: [], errors: [] };
  let artwork: string;
  try { artwork = verifiedEpsArtwork(program); }
  catch { return ["EPS metadata envelope is not verified vector-only content"]; }
  if (artwork.includes("%%Begin") && /^\s*%%(?:BeginPreview|BeginBinary|BeginData|BeginPhotoshop)\b/m.test(artwork)) {
    return ["embedded raster preview or opaque data is forbidden in EPS"];
  }
  scanProgramLines(artwork, st);
  return st.errors.length > 0 ? st.errors : atEnd(st);
}

function findLineBreak(src: string, from: number): number {
  let i = from;
  while (i < src.length && src.charCodeAt(i) !== 10 && src.charCodeAt(i) !== 13) i++;
  return i;
}

function nextLineStart(src: string, end: number): number {
  return src.charCodeAt(end) === 13 && src.charCodeAt(end + 1) === 10 ? end + 2 : end + 1;
}

function scanProgramLines(artwork: string, st: State): void {
  const len = artwork.length;
  let pos = 0;
  let lineNo = 1;
  while (pos <= len && st.errors.length === 0) {
    const end = findLineBreak(artwork, pos);
    if (pos < end && artwork.charCodeAt(pos) !== 37) runLineSpan(artwork, [pos, end], st, lineNo);
    if (end >= len) break;
    pos = nextLineStart(artwork, end);
    lineNo++;
  }
}

function isLineWs(c: number): boolean {
  return c === 32 || c === 9 || c === 11 || c === 12 || (c >= 160 && /\s/.test(String.fromCharCode(c)));
}

function runShadingLine(code: string, st: State, n: number): void {
  try {
    if (!code.endsWith(" shfill") || st.stack.length !== 0) throw new Error("invalid shading operands");
    checkShading(code.slice(0, -7));
  } catch {
    st.errors.push(`line ${n}: invalid or raster-bearing shading`);
  }
}

function trimCodeSpan(src: string, start: number, end: number): [number, number] {
  let codeEnd = start;
  while (codeEnd < end && src.charCodeAt(codeEnd) !== 37) codeEnd++;
  let s = start;
  let e = codeEnd;
  while (s < e && isLineWs(src.charCodeAt(s))) s++;
  while (e > s && isLineWs(src.charCodeAt(e - 1))) e--;
  return [s, e];
}

function runLineSpan(src: string, span: [number, number], st: State, n: number): void {
  const [s, e] = trimCodeSpan(src, span[0], span[1]);
  if (s >= e) return;
  if (src.charCodeAt(s) === 60 && s + 1 < e && src.charCodeAt(s + 1) === 60) {
    runShadingLine(src.slice(s, e), st, n);
    return;
  }
  scanLineTokens(src, [s, e], st, n);
}

function isTokenDelim(c: number): boolean {
  return isLineWs(c) || c === 91 || c === 93;
}

function readWordEnd(src: string, start: number, limit: number): number {
  let q = start + 1;
  while (q < limit && !isTokenDelim(src.charCodeAt(q))) q++;
  return q;
}

function scanLineTokens(src: string, span: [number, number], st: State, n: number): void {
  let p = span[0];
  const e = span[1];
  while (p < e && st.errors.length === 0) {
    const c = src.charCodeAt(p);
    if (isLineWs(c)) { p++; continue; }
    if (c === 91 || c === 93) { handleBracket(c, st); p++; continue; }
    const q = readWordEnd(src, p, e);
    if (isFinitePsNumber(src, p, q)) (st.array ?? st.stack).push(0);
    else runOperator(src.slice(p, q), st, n);
    p = q;
  }
}

function handleBracket(c: number, st: State): void {
  if (c === 91) st.array = [];
  else { st.stack.push(st.array ?? []); st.array = null; }
}

/** What is still wrong when the last token has run. */
function atEnd(st: State): string[] {
  if (st.array !== null) return ["end: an array is never closed"];
  if (st.stack.length > 0) return [`end: ${plural(st.stack.length, "operand")} left on the stack`];
  if (st.saved.length > 0) return [`end: ${plural(st.saved.length, "gsave")} not restored`];
  return [];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function isFinitePsNumber(src: string, p: number, q: number): boolean {
  let i = src.charCodeAt(p) === 45 ? p + 1 : p;
  let digits = 0;
  let seenDot = false;
  for (; i < q; i++) {
    const ch = src.charCodeAt(i);
    if (ch >= 48 && ch <= 57) { digits++; continue; }
    if (ch === 46 && !seenDot) { seenDot = true; continue; }
    return false;
  }
  return digits > 0 && (q - p < 308 || Number.isFinite(Number(src.slice(p, q))));
}

function runOperator(tok: string, st: State, line: number): void {
  const pops = POPS[tok];
  if (pops === undefined) {
    st.errors.push(`line ${line}: unknown operator ${tok.length <= 64 ? tok : "<unsupported token>"}`);
    return;
  }
  const first = takeFirst(tok, pops, st, line);
  if (st.errors.length === 0) apply(tok, first, st, line);
}

/** Pops the operands in place or reports why it cannot (arity, then type, like PostScript). */
function takeFirst(op: string, pops: Kind[], st: State, line: number): Operand | null {
  if (st.stack.length < pops.length) {
    st.errors.push(`line ${line}: ${op} expects ${plural(pops.length, "operand")}, found ${st.stack.length}`);
    st.stack.length = 0;
    return null;
  }
  const base = st.stack.length - pops.length;
  for (let i = 0; i < pops.length; i++) {
    const got = kindOf(st.stack[base + i]);
    if (got !== pops[i]) {
      st.stack.length = base;
      st.errors.push(`line ${line}: ${op} expects ${article(pops[i])}, found ${got}`);
      return null;
    }
  }
  const first = pops.length > 0 ? st.stack[base] : null;
  st.stack.length = base;
  return first;
}

/** The operator's effect on the path and the gsave stack; the error it raises, if any. */
const EFFECTS: Record<string, (st: State, first: Operand | null) => string | null> = {
  concat: (_st, first) => ((first as number[]).length === 6 ? null : `concat expects an array of 6 numbers, found ${(first as number[]).length}`),
  newpath: (st) => { st.hasPath = false; return null; },
  moveto: (st) => { st.hasPath = true; return null; },
  lineto: (st) => (st.hasPath ? null : "lineto has no current point"),
  curveto: (st) => (st.hasPath ? null : "curveto has no current point"),
  fill: (st) => paint("fill", st),
  stroke: (st) => paint("stroke", st),
  eofill: (st) => paint("eofill", st),
  clip: (st) => (st.hasPath ? null : "clip has no current path"),
  eoclip: (st) => (st.hasPath ? null : "eoclip has no current path"),
  gsave: (st) => { st.saved.push(st.hasPath); return null; },
  grestore: (st) => restore(st),
};

function apply(op: string, first: Operand | null, st: State, line: number): void {
  const problem = EFFECTS[op]?.(st, first) ?? null;
  if (problem !== null) st.errors.push(`line ${line}: ${problem}`);
}

/** Painting consumes the path — which is why `fill` then `stroke` strokes nothing. */
function paint(op: string, st: State): string | null {
  const problem = st.hasPath ? null : `${op} has no current path`;
  st.hasPath = false;
  return problem;
}

function restore(st: State): string | null {
  const had = st.saved.pop();
  if (had === undefined) return "grestore without gsave";
  st.hasPath = had;
  return null;
}

function kindOf(v: Operand): Kind {
  return typeof v === "number" ? "number" : "array";
}

function article(kind: Kind): string {
  return kind === "array" ? "an array" : "a number";
}
