// RULE 4/8 — an EPS is an executable PostScript program: if one instruction is
// invalid the interpreter stops before it reaches the artwork (the 2026-10-09
// report: `-0.75 0 0 -0.75 0 750 concat` raised /typecheck in Illustrator —
// `concat` takes ONE array). `checkPostScript` runs the built-in writer's own
// operator subset through an operand-stack model, so that class of error is
// caught by the writer's gate and by the commit gate, without Ghostscript.
import { describe, expect, it } from "vitest";
import { checkPostScript } from "../src/lib/upload/epscheck";

describe("checkPostScript — operand arity and types", () => {
  it("names the reported mistake: concat without the array", () => {
    expect(checkPostScript("0.75 0 0 -0.75 0 750 concat")).toEqual(["line 1: concat expects an array, found number"]);
    expect(checkPostScript("[0.75 0 0 -0.75 0 750] concat")).toEqual([]);
  });

  it("requires six numbers in the matrix", () => {
    expect(checkPostScript("[1 0 0 1 0] concat")).toEqual(["line 1: concat expects an array of 6 numbers, found 5"]);
  });

  it("checks every painting operator's operands", () => {
    expect(checkPostScript("1 0 setrgbcolor")).toEqual(["line 1: setrgbcolor expects 3 operands, found 2"]);
    expect(checkPostScript("[4 2] setdash")).toEqual(["line 1: setdash expects 2 operands, found 1"]);
    expect(checkPostScript("4 [2] setdash")).toEqual(["line 1: setdash expects an array, found number"]);
    expect(checkPostScript("newpath 1 moveto")).toEqual(["line 1: moveto expects 2 operands, found 1"]);
    expect(checkPostScript("newpath 0 0 moveto 1 2 3 4 5 curveto")).toEqual(["line 1: curveto expects 6 operands, found 5"]);
    expect(checkPostScript("[1] setlinewidth")).toEqual(["line 1: setlinewidth expects a number, found array"]);
  });

  it("knows a path must exist before it is painted or extended", () => {
    expect(checkPostScript("newpath 0 0 moveto 1 1 lineto 0 0 0 setrgbcolor fill 0 0 0 setrgbcolor 1 setlinewidth stroke"))
      .toEqual(["line 1: stroke has no current path"]); // fill consumed it — the second 2026-10-09 defect
    expect(checkPostScript("newpath 0 0 moveto 1 1 lineto gsave 0 0 0 setrgbcolor fill grestore 1 setlinewidth stroke")).toEqual([]);
    expect(checkPostScript("newpath 1 1 lineto")).toEqual(["line 1: lineto has no current point"]);
    expect(checkPostScript("newpath closepath")).toEqual([]); // a no-op in PostScript, not an error
  });

  it("balances gsave/grestore and wants an empty stack at the end (one finding per run, like the interpreter)", () => {
    expect(checkPostScript("gsave\ngsave\ngrestore")).toEqual(["end: 1 gsave not restored"]);
    expect(checkPostScript("grestore")).toEqual(["line 1: grestore without gsave"]);
    expect(checkPostScript("1 2\n3")).toEqual(["end: 3 operands left on the stack"]);
    expect(checkPostScript("[1 2")).toEqual(["end: an array is never closed"]);
  });

  it("refuses anything outside the writer's subset, and skips DSC comments", () => {
    expect(checkPostScript("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 1 1\nshowpage\n%%EOF"))
      .toEqual(["line 3: unknown operator showpage"]);
    expect(checkPostScript("/x 1 def")).toEqual(["line 1: unknown operator /x"]); // stops where PostScript stops
  });

  it("reports the line number inside a multi-line program", () => {
    const program = "gsave\n[1 0 0 1 0 0] concat\nnewpath 0 0 moveto 2 2 lineto 0 0 0 setrgbcolor fill\ngrestore\n1 0 0 setrgbcolor stroke";
    expect(checkPostScript(program)).toEqual(["line 5: stroke has no current path"]);
  });
});
