// epscheck.ts — is the built-in EPS an executable program? (I-61, 2026-10-09)
// An EPS is PostScript: if one instruction is invalid the interpreter stops
// before it reaches the artwork. The report that made this file: the uprighting
// CTM was written as bare numbers (`0.75 0 0 -0.75 0 750 concat`), `concat`
// takes ONE array, Illustrator raised /typecheck and opened nothing. No
// Ghostscript is available to the app or its tests, so this is an operand-stack
// model of the writer's OWN operator subset: numbers, `[…]` arrays, the
// dictionary operands of a shading (checked by `epsshading`), and the operators
// `lib/upload/eps` emits — each pops what PostScript documents and leaves what
// PostScript leaves. It judges only the built-in writer's output; a converter's
// PostScript (Inkscape/cairo: procedures, dictionaries) is outside its
// vocabulary and is refused by the vector-only delivery gate.
//
// 2026-11-19: the writer speaks the prolog's short operators (`m l c h f f* S
// W W* w J j M d rg q Q n shfill` and the transparent `%AI5_BeginLayer … LB`
// block pair), so each of them is modelled here too — the gate stays closed.

import { checkShading } from "./epsshading";
import { verifiedEpsArtwork } from "./epsmetadata";

type Kind = "number" | "array" | "string";
type Operand = number | number[] | string;

/**
 * What each operator pops, in stack order (last entry = top of stack). The
 * long names and the prolog aliases are BOTH accepted, so the checker runs a
 * document whether or not its prolog was read.
 */
const POPS: Record<string, Kind[]> = {
  newpath: [], n: [], closepath: [], h: [], fill: [], f: [], eofill: [], "f*": [], stroke: [], S: [],
  clip: [], W: [], eoclip: [], "W*": [], gsave: [], q: [], grestore: [], Q: [],
  moveto: ["number", "number"], m: ["number", "number"],
  lineto: ["number", "number"], l: ["number", "number"],
  curveto: ["number", "number", "number", "number", "number", "number"],
  c: ["number", "number", "number", "number", "number", "number"],
  concat: ["array"], setrgbcolor: ["number", "number", "number"], rg: ["number", "number", "number"],
  setlinewidth: ["number"], w: ["number"],
  setdash: ["array", "number"], d: ["array", "number"],
  setlinecap: ["number"], J: ["number"], setlinejoin: ["number"], j: ["number"], setmiterlimit: ["number"], M: ["number"],
  shfill: [],
  // Illustrator's layer markers around the artwork: `10 operands Lb`, `(name) Ln`, `LB`.
  Lb: ["number", "number", "number", "number", "number", "number", "number", "number", "number", "number"],
  Ln: ["string"], LB: [],
};

/** The prolog aliases, folded onto the real operator (same effects). */
const CANONICAL: Record<string, string> = {
  n: "newpath", h: "closepath", f: "fill", "f*": "eofill", S: "stroke", W: "clip", "W*": "eoclip",
  q: "gsave", Q: "grestore", m: "moveto", l: "lineto", c: "curveto", rg: "setrgbcolor",
  w: "setlinewidth", d: "setdash", J: "setlinecap", j: "setlinejoin", M: "setmiterlimit",
};

/** `/name {operators} bind def` — the one line shape a prolog alias may take. */
const PROLOG_DEFINITION = /^\/[A-Za-z][A-Za-z0-9*]* \{[a-z][A-Za-z0-9*]*(?: [a-z][A-Za-z0-9*]*)*\} bind def$/;

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
  if (/^\s*%%(?:BeginPreview|BeginBinary|BeginData|BeginPhotoshop)\b/m.test(artwork)) return ["embedded raster preview or opaque data is forbidden in EPS"];
  const lines = artwork.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length && st.errors.length === 0; i++) {
    if (!lines[i].startsWith("%")) runLine(lines[i], st, i + 1); // DSC comments and %%EOF are skipped
  }
  return st.errors.length > 0 ? st.errors : atEnd(st);
}

function runLine(line: string, st: State, n: number): void {
  const code = line.split("%")[0].trim();
  // A prolog definition of the form `/name {body} bind def` — the writer supplies
  // its own operators this way. Nothing is executed here: the body is only
  // checked by being CALLED, and every call is modelled below.
  if (PROLOG_DEFINITION.test(code)) return;
  if (code.startsWith("<<")) {
    try {
      if (!code.endsWith(" shfill") || st.stack.length !== 0) throw new Error("invalid shading operands");
      checkShading(code.slice(0, -7));
    } catch { st.errors.push(`line ${n}: invalid or raster-bearing shading`); }
    return;
  }
  for (const tok of tokens(code)) {
    token(tok, st, n);
    if (st.errors.length > 0) return;
  }
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

/**
 * Whitespace-separated tokens, with `[` and `]` as tokens of their own and a
 * `(…)` literal (a layer name, say) kept whole even when it contains spaces.
 */
function tokens(line: string): string[] {
  const out: string[] = [];
  let at = 0;
  while (at < line.length) {
    const ch = line[at];
    if (ch === " " || ch === "\t") { at++; continue; }
    if (ch === "[" || ch === "]") { out.push(ch); at++; continue; }
    if (ch === "(") {
      const close = line.indexOf(")", at);
      const end = close < 0 ? line.length : close + 1;
      out.push(line.slice(at, end));
      at = end;
      continue;
    }
    const start = at;
    while (at < line.length && !/[\s[\]]/.test(line[at])) at++;
    out.push(line.slice(start, at));
  }
  return out;
}

function token(tok: string, st: State, line: number): void {
  if (bracket(tok, st)) return;
  if (isNumber(tok)) { (st.array ?? st.stack).push(Number(tok)); return; }
  if (tok.startsWith("(")) { st.stack.push(tok); return; } // a PostScript literal string, opaque here
  const pops = POPS[tok];
  if (pops === undefined) { st.errors.push(`line ${line}: unknown operator ${tok.length <= 64 ? tok : "<unsupported token>"}`); return; }
  const args = take(tok, pops, st, line);
  if (args !== null) apply(tok, args, st, line);
}

/** `[` opens an array, `]` closes it onto the stack; anything else is not a bracket. */
function bracket(tok: string, st: State): boolean {
  if (tok === "[") st.array = [];
  else if (tok === "]") { st.stack.push(st.array ?? []); st.array = null; }
  else return false;
  return true;
}

function isNumber(tok: string): boolean {
  return /^-?(\d+\.?\d*|\.\d+)$/.test(tok) && Number.isFinite(Number(tok));
}

/** Pops the operands or reports why it cannot (arity, then type, like PostScript). */
function take(op: string, pops: Kind[], st: State, line: number): Operand[] | null {
  if (st.stack.length < pops.length) {
    st.errors.push(`line ${line}: ${op} expects ${plural(pops.length, "operand")}, found ${st.stack.length}`);
    st.stack.length = 0;
    return null;
  }
  const args = st.stack.splice(st.stack.length - pops.length, pops.length);
  const wrong = args.findIndex((a, i) => kindOf(a) !== pops[i]);
  if (wrong < 0) return args;
  st.errors.push(`line ${line}: ${op} expects ${article(pops[wrong])}, found ${kindOf(args[wrong])}`);
  return null;
}

/** The operator's effect on the path and the gsave stack; the error it raises, if any. */
const EFFECTS: Record<string, (st: State, args: Operand[]) => string | null> = {
  concat: (_st, args) => ((args[0] as number[]).length === 6 ? null : `concat expects an array of 6 numbers, found ${(args[0] as number[]).length}`),
  newpath: (st) => { st.hasPath = false; return null; },
  moveto: (st) => { st.hasPath = true; return null; },
  lineto: (st) => (st.hasPath ? null : "lineto has no current point"),
  curveto: (st) => (st.hasPath ? null : "curveto has no current point"),
  fill: (st) => paint("fill", st),
  stroke: (st) => paint("stroke", st),
  eofill: (st) => paint("eofill", st),
  clip: (st) => (st.hasPath ? null : "clip has no current path"),
  eoclip: (st) => (st.hasPath ? null : "eoclip has no current path"),
  shfill: () => null, // a shading paints itself; it needs no current path
  gsave: (st) => { st.saved.push(st.hasPath); return null; },
  grestore: (st) => restore(st),
};

function apply(op: string, args: Operand[], st: State, line: number): void {
  const problem = EFFECTS[CANONICAL[op] ?? op]?.(st, args) ?? null;
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
  if (typeof v === "number") return "number";
  return typeof v === "string" ? "string" : "array";
}

function article(kind: Kind): string {
  if (kind === "string") return "a string";
  return kind === "array" ? "an array" : "a number";
}
