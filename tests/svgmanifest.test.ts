// svgmanifest.test.ts — deterministic batching, ordered manifest text and the
// composed request prompt (batch spec §2/§5).
import { describe, expect, it } from "vitest";
import { composePrompt, makeBatches, manifestText, svgFileName } from "../src/lib/svgmanifest";
import type { BatchSource } from "../src/lib/svgmanifest";

const src = (name: string, relPath: string): BatchSource => ({
  id: `${relPath}/${name}`, name, relPath, fingerprint: `fp-${name}`,
});

const sources = [
  src("b_AI.png", "coastal"),
  src("a_AI.png", "winter"),
  src("c_AI.png", "coastal"),
  src("d_AI.png", "harbor"),
  src("e_AI.png", "harbor"),
];

describe("makeBatches", () => {
  it("sorts deterministically and chunks by perRequest", () => {
    const batches = makeBatches(sources, 2);
    expect(batches).toHaveLength(3);
    expect(batches[0].items.map((i) => i.name)).toEqual(["b_AI.png", "c_AI.png"]);
    expect(batches[2].items.map((i) => i.name)).toEqual(["a_AI.png"]);
  });

  it("positions start at 1 per batch and carry the stable identity", () => {
    const [first] = makeBatches(sources, 4);
    expect(first.items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(first.items[0].id).toContain("coastal/b_AI.png");
    expect(first.items[0].fingerprint).toBe("fp-b_AI.png");
    expect(first.grid.cols).toBe(2);
  });

  it("clamps perRequest into 1..9", () => {
    expect(makeBatches(sources, 0)[0].items).toHaveLength(5); // falls back to max
    expect(makeBatches(sources, 99)).toHaveLength(1);
  });
});

describe("manifestText / composePrompt", () => {
  it("numbers the manifest in position order", () => {
    const [b] = makeBatches(sources, 3);
    expect(manifestText(b)).toBe("1 — b_AI.png\n2 — c_AI.png\n3 — d_AI.png");
  });

  it("puts the contract header, manifest, then the user prompt", () => {
    const [b] = makeBatches(sources, 2);
    const prompt = composePrompt(b, "My quality rules.");
    const manifestAt = prompt.indexOf("1 — b_AI.png");
    const userAt = prompt.indexOf("My quality rules.");
    expect(manifestAt).toBeGreaterThan(0);
    expect(userAt).toBeGreaterThan(manifestAt);
    expect(prompt).toMatch(/same numeric order/i);
    expect(prompt).toMatch(/title/i);
  });
});

describe("svgFileName", () => {
  it("maps an AI image to the versioned svg name", () => {
    expect(svgFileName("fog_AI.png", 1)).toBe("fog_AI.v1.svg");
    expect(svgFileName("fog_AI.png", 3)).toBe("fog_AI.v3.svg");
  });
});
