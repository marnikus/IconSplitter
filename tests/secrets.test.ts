// secrets.test.ts — secret hygiene: the key is masked for display and redacted
// from any text that could reach logs, reports, exports or the screen.
import { describe, expect, it } from "vitest";
import { maskKey, redact } from "../src/lib/secrets";

describe("maskKey", () => {
  it("keeps a recognisable prefix and the last four characters only", () => {
    const m = maskKey("rq_live_abcdef1234A2F");
    expect(m).toContain("••••");
    expect(m).toContain("A2F");
    expect(m).not.toContain("abcdef1234");
  });

  it("short or empty keys mask completely", () => {
    expect(maskKey("")).toBe("");
    expect(maskKey("short")).not.toContain("short");
    expect(maskKey("short")).toContain("•");
  });
});

describe("redact", () => {
  it("removes every occurrence of the key from text", () => {
    const key = "rq_live_secret123";
    const out = redact(`error with ${key} inside and again ${key}`, key);
    expect(out).not.toContain(key);
    expect(out).toContain("error with");
  });

  it("leaves text untouched when the key is absent or empty", () => {
    expect(redact("no secrets here", "")).toBe("no secrets here");
    expect(redact("no secrets here", "xyz")).toBe("no secrets here");
  });
});
