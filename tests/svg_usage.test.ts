import { describe, expect, it } from "vitest";
import { summarizeSvgUsage } from "../src/svg/usage";
import { sourceRowFixture } from "./helpers/svgfixtures";

describe("Requesty usage accounting", () => {
  it("deduplicates per-source copies of one shared batch and never apportions cost", () => {
    const first = sourceRowFixture();
    const second = sourceRowFixture({ sourceId: "svg_second", pairId: "pair-second", relativePath: "folder/second_AI.png",
      filename: "second_AI.png", requests: first.requests.map((request) => ({ ...request, positionId: 2 })) });
    expect(summarizeSvgUsage([first, second])).toEqual({ requestCount: 1, inputTokens: 120, outputTokens: 40,
      totalTokens: 160, actualCostUsd: 0.0012, unpricedRequests: 0, unknownRequests: 0 });
  });

  it("reports unavailable values rather than estimating when Requesty omits fields", () => {
    const row = sourceRowFixture({ requests: [{ ...sourceRowFixture().requests[0],
      usage: { inputTokens: null, outputTokens: 12, totalTokens: null, actualCostUsd: null }, status: "unknown" }] });
    expect(summarizeSvgUsage([row])).toEqual({ requestCount: 1, inputTokens: null, outputTokens: 12,
      totalTokens: null, actualCostUsd: null, unpricedRequests: 1, unknownRequests: 1 });
  });

  it("returns zero totals for a folder with no generation requests", () => {
    expect(summarizeSvgUsage([sourceRowFixture({ requests: [] })])).toEqual({ requestCount: 0,
      inputTokens: 0, outputTokens: 0, totalTokens: 0, actualCostUsd: null, unpricedRequests: 0, unknownRequests: 0 });
  });
});
