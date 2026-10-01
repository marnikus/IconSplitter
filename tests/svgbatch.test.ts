// svgbatch.test.ts — mapping one batch response back onto its sources:
// valid outputs saved, invalid kept out, missing never shifted (spec §8).
import { describe, expect, it } from "vitest";
import { batchOutcomes } from "../src/lib/svgbatch";
import { extractSvgs, matchSvgs } from "../src/lib/svgextract";
import { makeBatches } from "../src/lib/svgmanifest";
import { validateSvg } from "../src/lib/svgvalidate";

const src = (name: string) => ({ id: name, name, relPath: "", fingerprint: `fp-${name}` });
const good = (title: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><title>${title}</title><g><path d="M1 1h2"/></g><g><path d="M1 1h2"/></g><g><path d="M1 1h2"/></g><g><path d="M1 1h2"/></g></svg>`;
const broken = (title: string) => `<svg xmlns="http://www.w3.org/2000/svg"><title>${title}</title></svg>`;

function outcomes(raw: string) {
  const [batch] = makeBatches([src("one"), src("two"), src("three")], 3);
  const match = matchSvgs(batch.items, extractSvgs(raw));
  return { batch, list: batchOutcomes(batch, match, validateSvg) };
}

describe("batchOutcomes", () => {
  it("saves valid svgs with their validation, in manifest positions", () => {
    const { list } = outcomes(good("one") + good("two") + good("three"));
    expect(list.every((o) => o.kind === "saved")).toBe(true);
    expect(list.find((o) => o.sourceId === "two")?.validation?.iconClusters).toBe(4);
  });

  it("invalid output is kept out of saved results with a safe reason", () => {
    const { list } = outcomes(good("one") + broken("two"));
    const two = list.find((o) => o.sourceId === "two")!;
    expect(two.kind).toBe("invalid");
    expect(two.svg).toBeNull();
    expect(two.reasons.join(" ")).toContain("viewBox");
    const three = list.find((o) => o.sourceId === "three")!;
    expect(three.kind).toBe("missing");
  });

  it("partial success: the valid half survives beside the failed half", () => {
    const { list } = outcomes(good("one") + broken("two"));
    const one = list.find((o) => o.sourceId === "one")!;
    expect(one.kind).toBe("saved");
    expect(one.svg).toContain("<svg");
  });

  it("summarises counts for the batch banner", () => {
    const { list } = outcomes(good("one") + broken("two"));
    const counts = { saved: 0, invalid: 0, missing: 0, unmapped: 0 };
    for (const o of list) counts[o.kind]++;
    expect(counts).toEqual({ saved: 1, invalid: 1, missing: 1, unmapped: 0 });
  });
});
