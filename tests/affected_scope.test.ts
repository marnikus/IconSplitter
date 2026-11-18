// @vitest-environment node
// affected_scope.test.ts — the everyday-retest scoping lane (TEST_HARNESS.md §1,
// CODE_VERIFICATION.md): a change reruns exactly the tests that can observe it,
// and EVERYTHING when the change is harness-wide or cannot be resolved. Scoping
// may never drop a test that could see the change; the witnesses below are the
// contract, including the escalations that make it safe.
// @ts-expect-error — a plain .mjs module of the tools, untyped like the rest
import { buildGraph, collectRepo, isTestFile, resolveSpecifier, selectTests, specifiersOf } from "../tools/affected-tests.mjs";
import { describe, expect, it } from "vitest";

/** A tiny repo: two src modules, a helper, three tests, a doc, a config. */
function fixture(): Map<string, string> {
  return new Map(Object.entries({
    "src/lib/leaf.ts": `export const leaf = 1;`,
    "src/lib/mid.ts": `import { leaf } from "./leaf";\nexport const mid = leaf;`,
    "src/ui/panel.tsx": `import { mid } from "../lib/mid";\nexport default mid;`,
    "src/other.ts": `export const other = 2;`,
    "tests/helpers/h.ts": `import { mid } from "../../src/lib/mid";\nexport const h = mid;`,
    "tests/a.test.ts": `import { mid } from "../src/lib/mid";\nit("a", () => mid);`,
    "tests/b.test.tsx": `import { h } from "./helpers/h";\nit("b", () => h);`,
    "tests/c.test.ts": `import other from "../src/other";\nit("c", () => other);`,
    "tests/docs_navigation.test.ts": `const p = "docs/current/README.md";\nit("d", () => p);`,
    "docs/current/README.md": `# router`,
    "vitest.config.ts": `export default {};`,
  }));
}

const select = (changed: string[], sources = fixture()) =>
  selectTests(changed, { sources }) as { all: boolean; reasons: string[]; tests: string[] };

describe("import graph", () => {
  it("reads every specifier form a test or source file uses", () => {
    const src = [
      `import { a } from "./a";`,
      `import type { B } from "../b";`,
      `import * as c from "@/lib/c";`,
      `import "./side-effect";`,
      `const d = await import("../dynamic/d");`,
      `const e = require("../../commonjs/e");`,
      `vi.mock("../../src/batch/store", async () => ({}));`,
      `export { f } from "./reexport/f";`,
    ].join("\n");
    expect(specifiersOf(src).sort()).toEqual([
      "../../commonjs/e", "../../src/batch/store", "../b", "../dynamic/d", "./a", "./reexport/f", "./side-effect", "@/lib/c",
    ].sort());
  });

  it("resolves relative specifiers and the @ alias to repo paths, and drops bare packages", () => {
    const known = new Set(fixture().keys());
    expect(resolveSpecifier("./leaf", "src/lib/mid.ts", known)).toBe("src/lib/leaf.ts");
    expect(resolveSpecifier("../lib/mid", "src/ui/panel.tsx", known)).toBe("src/lib/mid.ts");
    expect(resolveSpecifier("@/lib/mid", "src/ui/panel.tsx", known)).toBe("src/lib/mid.ts");
    expect(resolveSpecifier("./helpers/h", "tests/b.test.tsx", known)).toBe("tests/helpers/h.ts");
    // packages, builtins and paths outside the tree resolve to no edge at all
    expect(resolveSpecifier("react", "tests/a.test.ts", known)).toBeNull();
    expect(resolveSpecifier("node:fs", "tests/a.test.ts", known)).toBeNull();
    expect(resolveSpecifier("../outside/x", "src/a.ts", known)).toBeNull();
  });

  it("maps a module to the tests that can observe it, transitively and through helpers", () => {
    const { reverse } = buildGraph(fixture());
    expect(reverse.get("src/lib/mid.ts")).toEqual(new Set(["src/ui/panel.tsx", "tests/helpers/h.ts", "tests/a.test.ts"]));
    expect(isTestFile("tests/a.test.ts")).toBe(true);
    expect(isTestFile("tests/helpers/h.ts")).toBe(false);
    expect(isTestFile("src/lib/mid.ts")).toBe(false);
  });

  it("terminates on an import cycle", () => {
    const cyclic = new Map(Object.entries({
      "src/x.ts": `import { y } from "./y";\nexport const x = y;`,
      "src/y.ts": `import { x } from "./x";\nexport const y = x;`,
      "tests/cyc.test.ts": `import { x } from "../src/x";\nit("c", () => x);`,
    }));
    expect(select(["src/y.ts"], cyclic).tests).toEqual(["tests/cyc.test.ts"]);
  });
});

describe("scoping a change", () => {
  it("selects only the tests that can observe the edited module", () => {
    const out = select(["src/lib/leaf.ts"]);
    expect(out.all).toBe(false);
    expect(out.tests.sort()).toEqual(["tests/a.test.ts", "tests/b.test.tsx"]);
    expect(out.tests).not.toContain("tests/c.test.ts");
  });

  it("selects the edited test itself, and nothing else", () => {
    expect(select(["tests/c.test.ts"]).tests).toEqual(["tests/c.test.ts"]);
  });

  it("selects every dependent of an edited helper", () => {
    expect(select(["tests/helpers/h.ts"]).tests).toEqual(["tests/b.test.tsx"]);
  });

  it("keeps an unrelated change to one unrelated test", () => {
    expect(select(["src/other.ts"]).tests).toEqual(["tests/c.test.ts"]);
  });
});

describe("escalation — never scope away a test that could see the change", () => {
  it("runs everything for a harness-wide change", () => {
    for (const changed of ["vitest.config.ts", "tests/setup/dom.ts", "package.json", "tsconfig.json", "vite.config.ts", "tools/quality.mjs"]) {
      const out = select([changed, "src/lib/leaf.ts"]);
      expect(out.all, changed).toBe(true);
      expect(out.reasons.join(" "), changed).toContain(changed);
    }
  });

  it("runs everything for a change outside the graph's known roots", () => {
    const out = select(["index.html"]);
    expect(out.all).toBe(true);
  });

  it("runs everything when a changed file is gone from the tree (a deletion rewires importers)", () => {
    const out = select(["src/lib/deleted.ts"]);
    expect(out.all).toBe(true);
    expect(out.reasons.join(" ")).toMatch(/delet|missing/i);
  });

  it("routes a docs change to the tests that read docs", () => {
    const out = select(["docs/current/README.md"]);
    expect(out.all).toBe(false);
    expect(out.tests).toEqual(["tests/docs_navigation.test.ts"]);
  });

  it("runs everything when nothing is changed but the base cannot be resolved", () => {
    const out = selectTests([], { sources: fixture(), unresolvedBase: true }) as { all: boolean };
    expect(out.all).toBe(true);
  });
});

describe("the real repository graph", () => {
  it("scopes a leaf library edit to a proper, non-empty subset of the suite", () => {
    const repo = collectRepo();
    const out = selectTests(["src/lib/svgfile.ts"], { sources: repo.sources }) as { all: boolean; tests: string[] };
    const allTests = [...repo.sources.keys()].filter(isTestFile);
    expect(out.all).toBe(false);
    expect(out.tests.length).toBeGreaterThan(3);
    expect(out.tests.length).toBeLessThan(allTests.length / 2);
    expect(allTests.length).toBeGreaterThan(400);
    expect(out.tests.every(isTestFile)).toBe(true);
  });

  it("scopes a harness-wide edit to the whole suite", () => {
    const repo = collectRepo();
    const out = selectTests(["vitest.config.ts"], { sources: repo.sources }) as { all: boolean };
    expect(out.all).toBe(true);
  });
});
