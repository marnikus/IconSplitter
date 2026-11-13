// fs_case_collisions.test.ts — a Windows or macOS checkout must still build
// (2026-11-02). The register bar shipped as two files that differ only in case,
// `src/svg/RegisterProgress.tsx` and `src/svg/registerprogress.ts`. Linux resolved
// the import, but on a case-insensitive filesystem `./RegisterProgress` picked up
// `registerprogress.ts`, which has no default export, and the user's build died at
// rollup with "default is not exported". Two guards, both read from the disk.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Generated or vendored trees: never part of the app's module graph. */
const SKIP = new Set([".git", "node_modules", "dist", "coverage", ".cache", ".vite"]);
const ROOTS = ["src", "tools", "tests"];
const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", ".json"];
const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full).replace(/\\/g, "/"));
  }
  return out;
}

/** Pairs that a case-insensitive filesystem would fold into one file. */
function folded(paths: readonly string[]): string[] {
  const groups = new Map<string, string[]>();
  for (const path of paths) groups.set(path.toLowerCase(), [...(groups.get(path.toLowerCase()) ?? []), path]);
  return [...groups.values()].filter((group) => group.length > 1).map((group) => group.join(" ↔ "));
}

/** The `.`-relative specifiers a module really imports, ignoring template text. */
function specsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const found: string[] = [];
  for (const match of source.matchAll(/(?:from|require\(|import\()\s*["'](\.[^"']*)["']/g)) {
    const literal = source.slice(0, match.index);
    if ((literal.match(/`/g)?.length ?? 0) % 2 === 0) found.push(match[1].split("?")[0]);
  }
  return found;
}

/** The file a specifier names on THIS filesystem, matching names exactly. */
function exact(file: string, spec: string): string | null {
  const base = resolve(dirname(file), spec);
  const names = readdirSync(dirname(base));
  const wanted = EXTENSIONS.map((extension) => base.slice(base.lastIndexOf("/") + 1) + extension);
  return names.find((name) => wanted.includes(name)) ?? null;
}

/** What the same specifier would pick up if names were folded, when it differs. */
function foldedHit(file: string, spec: string): string | null {
  const base = resolve(dirname(file), spec).toLowerCase();
  const names = readdirSync(dirname(base));
  const stem = base.slice(base.lastIndexOf("/") + 1);
  const hit = names.find((name) => EXTENSIONS.some((e) => name.toLowerCase() === stem + e));
  return hit === null || hit === undefined ? null : hit;
}

const modules = ROOTS.flatMap((root) => walk(join(ROOT, root)))
  .filter((file) => /\.(tsx?|mjs)$/.test(file));

describe("a case-insensitive checkout", () => {
  it("never holds two paths that differ only in case", () => {
    expect(folded(walk(ROOT))).toEqual([]);
  });

  it("resolves every relative import on a case-sensitive disk", () => {
    const broken = modules.flatMap((file) => specsOf(file)
      .filter((spec) => exact(file, spec) === null)
      .map((spec) => `${file} → ${spec}`));
    expect(broken).toEqual([]);
  });

  it("needs no folded lookup to resolve an import", () => {
    const foldedOnly = modules.flatMap((file) => specsOf(file)
      .filter((spec) => exact(file, spec) === null && foldedHit(file, spec) !== null)
      .map((spec) => `${file} → ${spec}`));
    expect(foldedOnly).toEqual([]);
  });
});
