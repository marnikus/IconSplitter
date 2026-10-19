import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const doc = (path: string) => readFileSync(resolve(root, path), "utf8");
const current = resolve(root, "docs/current");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "QUALITY_RECHECK.md") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? pages(path) : path.endsWith(".md") ? [path] : [];
  });
}

function anchors(markdown: string): Set<string> {
  const found = new Set<string>();
  for (const match of markdown.matchAll(/<a\s+id="([^"]+)"\s*\/?>/g)) found.add(match[1]);
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const label = match[1].replace(/<[^>]*>/g, "").replace(/[`*_]/g, "").toLowerCase();
    found.add(label.replace(/[^\p{L}\p{N} -]/gu, "").trim().replace(/\s+/g, "-"));
  }
  return found;
}

function localLinks(path: string, markdown: string): string[] {
  const errors: string[] = [];
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split(' "')[0];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const [name, fragment] = target.split("#");
    const dest = resolve(dirname(path), decodeURIComponent(name));
    if (!existsSync(dest)) { errors.push(`${relative(root, path)} → ${target}`); continue; }
    const repoPath = relative(root, dest).replaceAll("\\", "/");
    const excluded = repoPath.startsWith("docs/archive/") || repoPath === "docs/current/QUALITY_RECHECK.md"
      || repoPath.startsWith("dist/") || /^design\/.*\.html$/.test(repoPath);
    if (fragment && !excluded && !anchors(readFileSync(dest, "utf8")).has(decodeURIComponent(fragment))) {
      errors.push(`${relative(root, path)} → ${target}`);
    }
  }
  return errors;
}

describe("agent documentation routes", () => {
  it("starts at a small, task-based root with an existing current-doc router", () => {
    const bootstrap = doc("AGENTS.md");
    expect(Buffer.byteLength(bootstrap)).toBeLessThan(6_000);
    expect(bootstrap).toContain("docs/current/README.md");
    const route = doc("docs/current/README.md");
    for (const tab of ["sheets", "batch", "selection", "svg-generation", "svg-image-edits", "upload"]) {
      expect(route).toContain(`sor/${tab}`);
      expect(route).toContain(`selectors/${tab}`);
    }
  });

  it("keeps local file/heading links valid without loading the ledger or archives", () => {
    const files = [resolve(root, "AGENTS.md"), resolve(root, "README.md"), resolve(root, "docs/README.md"),
      resolve(root, "design/README.md"), ...pages(current)];
    const broken = files.flatMap((path) => localLinks(path, readFileSync(path, "utf8")));
    expect(broken).toEqual([]);
  });

  it("gives stable rule and invariant IDs one canonical definition each", () => {
    const rules = pages(resolve(current, "rules")).flatMap((path) => [...readFileSync(path, "utf8").matchAll(/^## RULE (\d+)\b/gm)].map((x) => Number(x[1])));
    expect(rules.sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    const ids = pages(resolve(current, "sor/invariants")).flatMap((path) => [...readFileSync(path, "utf8").matchAll(/<a id="(i-\d+)"\s*\/?>/g)].map((x) => x[1]));
    expect(ids.length).toBeGreaterThan(50);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("i-72");
  });
});
