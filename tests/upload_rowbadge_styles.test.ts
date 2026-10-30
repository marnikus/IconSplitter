// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("scopes the extra badge-filter columns to Upload, not Generate SVG", () => {
  const css = readFileSync("src/index.css", "utf8");
  const shared = [...css.matchAll(/(?:^|\n)\s*\.svg-filters\s*\{([^}]+)\}/g)].map((m) => m[1]);
  expect(shared).toHaveLength(2);
  expect(shared[0]).toContain("grid-template-columns: 150px 140px 165px 150px 1fr auto;");
  expect(shared[1]).toContain("grid-template-columns: 132px 126px 148px 136px 1fr auto;");
  const upload = [...css.matchAll(/\.up \.svg-filters\s*\{([^}]+)\}/g)].map((m) => m[1]);
  expect(upload).toHaveLength(2); // desktop and existing responsive breakpoint
  for (const rule of upload) expect(rule).toContain("grid-template-columns:");
});
