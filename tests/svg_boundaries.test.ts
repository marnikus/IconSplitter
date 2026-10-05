// svg_boundaries.test.ts — static rules of the confirmation design that no
// behavioural test can see (like secret_hygiene, it reads the sources).
// C-1: ONE builder. Only lib/svgpayload.ts creates a request body or a prompt;
// the runner, the sender and the dialog receive and post the object it made, so
// there is no second place where what the user read and what was sent can drift.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
/** The definitions and the one call site. */
const ALLOWED = new Set(["lib/svgpayload.ts", "lib/svgprompt.ts", "lib/svgrequest.ts"]);
const BUILDERS = /\b(buildChatRequest|batchPrompt|singlePrompt|composePrompt)\s*\(/;

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full.slice(SRC.length + 1).replace(/\\/g, "/")] : [];
  });
}

describe("C-1 one builder", () => {
  it("finds the sources it is supposed to police", () => {
    const files = sources();
    expect(files).toContain("svg/runner.ts");
    expect(files).toContain("svg/send.ts");
    expect(files).toContain("lib/svgpayload.ts");
  });

  it("calls buildChatRequest / composePrompt / batchPrompt / singlePrompt nowhere but lib/svgpayload", () => {
    const offenders = sources()
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => BUILDERS.test(readFileSync(join(SRC, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("keeps the runner and the sender free of any prompt vocabulary", () => {
    for (const f of ["svg/runner.ts", "svg/send.ts"]) {
      const text = readFileSync(join(SRC, f), "utf8");
      expect(text, f).not.toMatch(/svgprompt/);
      expect(text, f).not.toMatch(/\bmanifestLines\b/);
    }
  });
});
