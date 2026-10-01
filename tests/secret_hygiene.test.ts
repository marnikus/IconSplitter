// RULE 20 / prompt §7 — repository hygiene: no API key may be committed.
// The gate reads every tracked file (plus untracked ones, so a secret cannot
// slip in before the first commit) and fails on any key-shaped literal, on a
// hardcoded Authorization header, and on a local secret file that is not
// ignored. The sample key is assembled from parts so this test file itself
// stays clean.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { containsSecret, findSecrets } from "../src/lib/svgsecret";

const SAMPLE = ["rq", "live", "QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");
const TEXT_EXT = /\.(ts|tsx|js|mjs|json|md|html|css|bat|sh|yml|yaml|txt)$/i;

function repoFiles(): string[] {
  const tracked = execSync("git ls-files", { cwd: process.cwd() }).toString().trim();
  const untracked = execSync("git ls-files --others --exclude-standard", { cwd: process.cwd() }).toString().trim();
  return [...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function walk(dir: string, depth = 0): string[] {
  if (depth > 3) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === ".git") return [];
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) return [full];
    return walk(full, depth + 1);
  });
}

describe("secret hygiene", () => {
  it("detects a key-shaped literal (the gate itself works)", () => {
    expect(containsSecret(SAMPLE)).toBe(true);
    expect(containsSecret(`Authorization: Bearer ${SAMPLE}`)).toBe(true);
    expect(findSecrets(`key=${SAMPLE}`)).toEqual([SAMPLE]);
    expect(containsSecret("rq_live_short")).toBe(false);
  });

  it("no tracked or untracked file contains a key-shaped literal", () => {
    const offenders = repoFiles()
      .filter((f) => TEXT_EXT.test(f))
      .flatMap((f) => findSecrets(read(f)).map((s) => `${f}: ${s.slice(0, 8)}…`));
    expect(offenders).toEqual([]);
  });

  it("no file hardcodes an Authorization header value", () => {
    const pattern = /Authorization["'\s:=]+["'`]?\s*Bearer\s+[A-Za-z0-9._-]{8,}/i;
    const offenders = repoFiles().filter((f) => TEXT_EXT.test(f) && pattern.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("ignores the local secret files the key store can create", () => {
    const ignored = read(".gitignore");
    for (const pattern of [".env", "*.key", "*.pem", "secrets.json", "*.local.json"]) {
      expect(ignored).toContain(pattern);
    }
  });

  it("no secret-looking file sits in the working tree", () => {
    const offenders = walk(process.cwd())
      .filter((f) => /\.(env|key|pem|secret|credentials)$/i.test(f));
    expect(offenders).toEqual([]);
  });
});
