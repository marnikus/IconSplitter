// psrun.ts — executes the built-in EPS writer's PostScript subset far enough to
// answer two questions a test cares about: does the program run (the subset
// stack checker, the same one production uses), and where does it paint
// (every path point, Bézier control points included, mapped through the CTM
// and widened by half the line width when stroked). Used to assert that the
// whole painted picture lies inside the declared %%HiResBoundingBox.
import { checkPostScript } from "../../src/lib/upload/epscheck";

export interface PsRun {
  errors: string[];
  /** The painted extent in points, or null when nothing was painted. */
  painted: { llx: number; lly: number; urx: number; ury: number } | null;
}

interface Pt { x: number; y: number }
type Ctm = [number, number, number, number, number, number];

export function runPostScript(eps: string): PsRun {
  const errors = checkPostScript(eps);
  const run = new Painter();
  for (const line of eps.split("\n")) {
    if (line.startsWith("%")) continue;
    run.line(line);
  }
  return { errors, painted: run.painted };
}

class Painter {
  painted: PsRun["painted"] = null;
  private ctm: Ctm = [1, 0, 0, 1, 0, 0];
  private saved: Ctm[] = [];
  private path: Pt[] = [];
  private stack: (number | number[])[] = [];
  private lineWidth = 1;
  private array: number[] | null = null;

  line(text: string): void {
    for (const tok of text.replace(/[[\]]/g, " $& ").trim().split(/\s+/).filter((t) => t !== "")) this.token(tok);
  }

  private token(tok: string): void {
    if (tok === "[") { this.array = []; return; }
    if (tok === "]") { this.stack.push(this.array ?? []); this.array = null; return; }
    if (/^-?\d/.test(tok)) { (this.array ?? this.stack).push(Number(tok)); return; }
    this.operator(tok);
  }

  private nums(n: number): number[] {
    return this.stack.splice(-n, n).map((v) => (typeof v === "number" ? v : 0));
  }

  private operator(op: string): void {
    if (op === "gsave") this.saved.push([...this.ctm]);
    else if (op === "grestore") this.ctm = this.saved.pop() ?? this.ctm;
    else if (op === "concat") this.ctm = multiply(this.ctm, (this.stack.pop() as number[]) as Ctm);
    else if (op === "newpath") this.path = [];
    else if (op === "moveto" || op === "lineto") this.path.push(this.point(this.nums(2)));
    else if (op === "curveto") { const n = this.nums(6); for (let i = 0; i < 6; i += 2) this.path.push(this.point(n.slice(i, i + 2))); }
    else if (op === "setlinewidth") this.lineWidth = this.nums(1)[0];
    else if (op === "setrgbcolor") this.nums(3);
    else if (op === "setdash") { this.stack.pop(); this.stack.pop(); }
    else if (op === "setlinecap" || op === "setlinejoin" || op === "setmiterlimit") this.nums(1);
    else if (op === "fill") this.paint(0);
    else if (op === "stroke") this.paint((this.lineWidth / 2) * Math.hypot(this.ctm[0], this.ctm[1]));
  }

  private point([x, y]: number[]): Pt {
    const [a, b, c, d, e, f] = this.ctm;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  }

  private paint(halfWidth: number): void {
    for (const p of this.path) {
      const box = { llx: p.x - halfWidth, lly: p.y - halfWidth, urx: p.x + halfWidth, ury: p.y + halfWidth };
      this.painted = this.painted === null ? box : {
        llx: Math.min(this.painted.llx, box.llx), lly: Math.min(this.painted.lly, box.lly),
        urx: Math.max(this.painted.urx, box.urx), ury: Math.max(this.painted.ury, box.ury),
      };
    }
    this.path = [];
  }
}

/** `m` applied before the current CTM — what PostScript `concat` does. */
function multiply(ctm: Ctm, m: Ctm): Ctm {
  const [a, b, c, d, e, f] = ctm;
  const [A, B, C, D, E, F] = m;
  return [A * a + B * c, A * b + B * d, C * a + D * c, C * b + D * d, E * a + F * c + e, E * b + F * d + f];
}

/** The declared %%HiResBoundingBox of a document. */
export function hiResBox(eps: string): { llx: number; lly: number; urx: number; ury: number } {
  const m = /^%%HiResBoundingBox:\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/m.exec(eps);
  if (m === null) throw new Error("no %%HiResBoundingBox");
  return { llx: +m[1], lly: +m[2], urx: +m[3], ury: +m[4] };
}
