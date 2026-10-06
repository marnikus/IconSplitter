// pairpreferred.test.ts — the user's choice of version (I-54): it changes the
// one field it owns, it survives a round trip through the pair file, and every
// shape a choice might arrive in that is not a real version number falls back to
// "nobody chose" instead of breaking the file. TDD for the module pairmeta.ts
// delegates the choice to, so the record shape stays the only thing it owns.
import { describe, expect, it } from "vitest";
import { readPreferred, withPreferred } from "../src/lib/pairpreferred";

describe("the preferred version", () => {
  it("changes one field and nothing else", () => {
    const before = { id: "pair_a", preferred: null as number | null, versions: [1, 2], decision: "approved" as const };
    const after = withPreferred(before, 1);
    expect(after.preferred).toBe(1);
    expect(after.versions).toEqual(before.versions);
    expect(after.decision).toBe("approved");
    expect(before.preferred).toBeNull(); // a pure function never edits its input
  });

  it("accepts only a real version number and refuses the rest", () => {
    expect(readPreferred(3)).toBe(3);
    for (const bad of [undefined, null, 0, -1, 1.5, "2", {}, [], true]) {
      expect(readPreferred(bad)).toBeNull(); // nonsense = no choice, never a broken file
    }
  });
});
