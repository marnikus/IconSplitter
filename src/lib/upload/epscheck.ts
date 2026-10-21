// epscheck.ts — is the built-in EPS an executable program? (I-61, 2026-10-09)
// An EPS is PostScript: if one instruction is invalid the interpreter stops
// before it reaches the artwork. The report that made this file: the uprighting
// CTM was written as bare numbers (`0.75 0 0 -0.75 0 750 concat`), `concat`
// takes ONE array, Illustrator raised /typecheck and opened nothing. This is an
// operand-stack model of the writer's OWN operator subset: numbers, `[…]`
// arrays, `<< … >>` shading dictionaries, and the operators `lib/upload/eps`
// emits — each pops what PostScript documents and leaves what PostScript leaves.
// A converter's PostScript (Inkscape/cairo: procedures, custom dicts) is outside
// its vocabulary and is NOT checked by it (`verifyEpsDocument` stays neutral).

type Kind = "number" | "array" | "dict";
type DictVal = { kind: "dict" } | { kind: "lit" };
type Operand = number | Operand[] | DictVal;
interface Frame { kind: "array" | "dict"; items: Operand[] }

/** What each operator pops, in stack order (last entry = top of stack). */
const POPS: Record<string, Kind[]> = {
  newpath: [], closepath: [], fill: [], stroke: [], gsave: [], grestore: [],
  clip: [], strokepath: [], shfill: ["dict"],
  moveto: ["number", "number"], lineto: ["number", "number"],
  curveto: ["number", "number", "number", "number", "number", "number"],
  concat: ["array"], setrgbcolor: ["number", "number", "number"],
  setlinewidth: ["number"], setdash: ["array", "number"],
  setlinecap: ["number"], setlinejoin: ["number"], setmiterlimit: ["number"],
};

interface State {
  stack: Operand[];
  open: Frame[];
  /** The current path has a current point (a `moveto` happened, nothing consumed it since). */
  hasPath: boolean;
  saved: boolean[];
  errors: string[];
}

export function checkPostScript(program: string): string[] {
  const st: State = { stack: [], open: [], hasPath: false, saved: [], errors: [] };
  const lines = program.split("\n");
  for (let i = 0; i < lines.length && st.errors.length === 0; i++) {
    if (!lines[i].startsWith("%")) runLine(lines[i], st, i + 1);
  }
  return st.errors.length > 0 ? st.errors : atEnd(st);
}

function runLine(line: string, st: State, n: number): void {
  for (const tok of tokens(line)) {
    token(tok, st, n);
    if (st.errors.length > 0) return;
  }
}

function atEnd(st: State): string[] {
  const top = st.open[st.open.length - 1];
  if (top !== undefined) return [top.kind === "dict" ? "end: a dictionary is never closed" : "end: an array is never closed"];
  if (st.stack.length > 0) return [`end: ${plural(st.stack.length, "operand")} left on the stack`];
  if (st.saved.length > 0) return [`end: ${plural(st.saved.length, "gsave")} not restored`];
  return [];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function tokens(line: string): string[] {
  return line.replace(/<<|>>|[[\]]/g, " $& ").trim().split(/\s+/).filter((t) => t !== "");
}

function pushVal(st: State, val: Operand): void {
  const top = st.open[st.open.length - 1];
  (top === undefined ? st.stack : top.items).push(val);
}

function inDict(st: State): boolean {
  return st.open.some((f) => f.kind === "dict");
}

function dictToken(tok: string, st: State): boolean {
  return inDict(st) && (tok.startsWith("/") || tok === "true" || tok === "false");
}

function delimiter(tok: string, st: State, line: number): boolean {
  if (tok === "[") { st.open.push({ kind: "array", items: [] }); return true; }
  if (tok === "<<") { st.open.push({ kind: "dict", items: [] }); return true; }
  if (tok === "]" || tok === ">>") { closeFrame(tok, st, line); return true; }
  return false;
}

function token(tok: string, st: State, line: number): void {
  if (delimiter(tok, st, line)) return;
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(tok)) { pushVal(st, Number(tok)); return; }
  if (dictToken(tok, st)) { pushVal(st, { kind: "lit" }); return; }
  if (st.open.length > 0) { st.errors.push(`line ${line}: unknown token ${tok}`); return; }
  const pops = POPS[tok];
  if (pops === undefined) { st.errors.push(`line ${line}: unknown operator ${tok}`); return; }
  const args = take(tok, pops, st, line);
  if (args !== null) apply(tok, args, st, line);
}

function closeFrame(tok: "]" | ">>", st: State, line: number): void {
  const expected = tok === "]" ? "array" : "dict";
  const top = st.open.pop();
  if (top === undefined || top.kind !== expected) { st.errors.push(`line ${line}: unmatched ${tok}`); return; }
  if (expected === "dict" && top.items.length % 2 !== 0) { st.errors.push(`line ${line}: uneven dictionary entries`); return; }
  pushVal(st, expected === "array" ? top.items : { kind: "dict" });
}

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

const EFFECTS: Record<string, (st: State, args: Operand[]) => string | null> = {
  concat: (_st, args) => ((args[0] as Operand[]).length === 6 ? null : `concat expects an array of 6 numbers, found ${(args[0] as Operand[]).length}`),
  newpath: (st) => { st.hasPath = false; return null; },
  moveto: (st) => { st.hasPath = true; return null; },
  lineto: (st) => (st.hasPath ? null : "lineto has no current point"),
  curveto: (st) => (st.hasPath ? null : "curveto has no current point"),
  clip: (st) => (st.hasPath ? null : "clip has no current path"),
  strokepath: (st) => (st.hasPath ? null : "strokepath has no current path"),
  fill: (st) => paint("fill", st),
  stroke: (st) => paint("stroke", st),
  gsave: (st) => { st.saved.push(st.hasPath); return null; },
  grestore: (st) => restore(st),
};

function apply(op: string, args: Operand[], st: State, line: number): void {
  const problem = EFFECTS[op]?.(st, args) ?? null;
  if (problem !== null) st.errors.push(`line ${line}: ${problem}`);
}

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
  return Array.isArray(v) ? "array" : "dict";
}

function article(kind: Kind): string {
  if (kind === "array") return "an array";
  return kind === "dict" ? "a dict" : "a number";
}
