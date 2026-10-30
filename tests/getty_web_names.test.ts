// The names a random batch travels under: Getty lists a batch by file name, so
// the rank in front of a name — not the order of the request — is what decides
// who sits next to whom on the page.

import { describe, expect, it } from "vitest";
import {
  realNameOf, stagedFileName, stagedRanks, withRealNames,
} from "../src/lib/stockupload/gettywebnames";

const NAMES = ["snow_01.jpg", "snow_02.jpg", "wheel_01.jpg", "wheel_02.jpg"];

function byRank(names: readonly string[], ranks: readonly number[]): string[] {
  return names
    .map((name, index) => ({ name, rank: ranks[index] }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.name);
}

describe("staged names of a random batch", () => {
  it("puts a zero-padded rank in front of the real name, never a path", () => {
    expect(stagedFileName(7, "icon-snowflake_2_01.jpg")).toBe("0007-icon-snowflake_2_01.jpg");
    expect(stagedFileName(12, "sub/dir/star.eps")).toBe("0012-star.eps");
    expect(realNameOf("0012-star.eps")).toBe("star.eps");
    expect(realNameOf("star.eps")).toBe("star.eps");
  });

  it("gives every icon one rank, so a JPEG and its EPS stay one card", () => {
    const ranks = stagedRanks(NAMES, () => 0);
    expect([...ranks].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("sorts the two sizes of one picture apart, which the page cannot undo", () => {
    const ranks = stagedRanks(NAMES, () => 0);
    // Sorted by name — what Getty shows — the snowflakes are two cards apart.
    expect(byRank(NAMES, ranks)).toEqual(["snow_02.jpg", "wheel_01.jpg", "snow_01.jpg", "wheel_02.jpg"]);
  });

  it("keeps a batch of one picture in place: there is nothing to spread to", () => {
    const only = ["snow_01.jpg", "snow_02.jpg"];
    expect(byRank(only, stagedRanks(only, () => 0.5))).toEqual(only);
  });
});

describe("Getty's answer read back by the real names", () => {
  const answer = {
    ok: true as const,
    batchId: "b",
    accepted: ["0001-snow_01.jpg"],
    failed: [{ name: "0002-wheel_01.jpg", id: "2302731586" }],
    notReady: ["0003-snow_02.jpg"],
    seen: ["0004-wheel_02.eps"],
    completed: false,
    completion: null,
    metadata: [],
  };

  it("restores every list, so an accepted card is not a failed icon", () => {
    const back = withRealNames(answer);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.accepted).toEqual(["snow_01.jpg"]);
    expect(back.failed).toEqual([{ name: "wheel_01.jpg", id: "2302731586" }]);
    expect(back.notReady).toEqual(["snow_02.jpg"]);
    expect(back.seen).toEqual(["wheel_02.eps"]);
  });

  it("restores a failed answer too, without inventing a batch id", () => {
    const back = withRealNames({ ok: false, code: "page", reason: "no answer", accepted: ["0001-snow_01.jpg"] });
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.reason).toBe("no answer");
    expect(back.accepted).toEqual(["snow_01.jpg"]);
  });
});
