// buildstamp.test.ts — the page can say which build it runs (2026-11-08).
// The helper serves the built dist and can rebuild it underneath an open tab, so
// "I tested the fix" is only meaningful with the build named.
import { describe, expect, it } from "vitest";
import { readBuildStamp } from "../src/lib/buildstamp";

function stampPage(content: string | null): void {
  document.head.innerHTML = content === null ? "" : `<meta name="iconsplitter-src-hash" content="${content}">`;
}

describe("the build stamp", () => {
  it("reads the fingerprint vite.config.ts stamped into the page", () => {
    stampPage("9f13ab77c0d1e2f3");
    expect(readBuildStamp()).toBe("9f13ab77");
  });

  it("says dev when the page carries no stamp (hot server, test run)", () => {
    stampPage(null);
    expect(readBuildStamp()).toBe("dev");
  });

  it("survives an empty content attribute", () => {
    stampPage("");
    expect(readBuildStamp()).toBe("dev");
  });
});
