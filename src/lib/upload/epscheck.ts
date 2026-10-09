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
// its vocabulary and is NOT checked by it (`verifyEpsDocument` stays neutral).

type Kind = "number" | "array";
type Operand = number | number[];

/** What each operator pops, in stack order (last entry = top of stack). */
const POPS: Record<string, Kind[]> = {
  newpath: [], closepath: [], fill: [], stroke: [], gsave: [], grestore: [],
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
  const lines = program.split("\n");
  for (let i = 0; i < lines.length && st.errors.length === 0; i++) {
    if (!lines[i].startsWith("%")) runLine(lines[i], st, i + 1); // DSC comments and %%EOF are skipped
  }
  return st.errors.length > 0 ? st.errors : atEnd(st);
}

function runLine(line: string, st: State, n: number): void {
  for (const tok of tokens(line)) {
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

/** Whitespace-separated tokens, with `[` and `]` as tokens of their own. */
function tokens(line: string): string[] {
  return line.replace(/[[\]]/g, " $& ").trim().split(/\s+/).filter((t) => t !== "");
}

function token(tok: string, st: State, line: number): void {
  if (tok === "[") { st.array = []; return; }
  if (tok === "]") { st.stack.push(st.array ?? []); st.array = null; return; }
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(tok)) { (st.array ?? st.stack).push(Number(tok)); return; }
  const pops = POPS[tok];
  if (pops === undefined) { st.errors.push(`line ${line}: unknown operator ${tok}`); return; }
  const args = take(tok, pops, st, line);
  if (args !== null) apply(tok, args, st, line);
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
  gsave: (st) => { st.saved.push(st.hasPath); return null; },
  grestore: (st) => restore(st),
};

function apply(op: string, args: Operand[], st: State, line: number): void {
  const problem = EFFECTS[op]?.(st, args) ?? null;
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
