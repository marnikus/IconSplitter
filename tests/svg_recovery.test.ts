// svg_recovery.test.ts — what a restart is allowed to claim (prompt 2026-10-05,
// D6). A row whose request never reported an outcome must come back as UNKNOWN
// with its request id — never as "failed" (the provider may still be working
// and may still charge it) and never silently resent.
import { describe, expect, it } from "vitest";
import { markUnknown, unknownNote } from "../src/svg/recovery";
import type { InflightRequest } from "../src/svg/journal";
import { toRow } from "../src/svg/rowmodel";
import type { SvgRow } from "../src/svg/types";
import type { SvgSource } from "../src/svg/sources";

function source(id: string): SvgSource {
  return {
    id, name: `${id}.png`, stem: `${id}_AI`, relPath: `architecture/${id}_AI.png`,
    dirPath: "architecture", fingerprint: "20:3100",
  };
}

const ENTRY: InflightRequest = {
  runId: "run_past_1", batchId: "batch_1_2", index: 1,
  sourceIds: ["a", "b"], sourceNames: ["a_AI.png", "b_AI.png"],
  model: "openai/gpt-6.1-sol", startedAt: new Date(Date.now() - 90_000).toISOString(),
  requestId: "req_stalled_9",
};

const rows = (): SvgRow[] => [toRow(source("a"), null, false), toRow(source("z"), null, false)];

describe("markUnknown — a restart never turns an unanswered request into a failure", () => {
  it("marks exactly the journal'd sources as unknown, with the id in the reason", () => {
    const painted = markUnknown(rows(), [ENTRY]);
    expect(painted[0].status).toBe("unknown");
    expect(painted[0].error).toContain("req_stalled_9");
    expect(painted[0].error).toContain("not been resent");
    // a source the journal does not name is untouched
    expect(painted[1].status).toBe("not-generated");
    expect(painted[1].error).toBeNull();
    // the sources themselves are never copied away or lost
    expect(painted.map((r) => r.source.id)).toEqual(["a", "z"]);
  });

  it("says no request id when the provider never gave one", () => {
    const note = unknownNote({ ...ENTRY, requestId: null });
    expect(note).toContain("no request id");
    expect(note).toContain("outcome unknown");
    expect(note).not.toContain("null");
  });
});
