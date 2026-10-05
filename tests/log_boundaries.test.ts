// log_boundaries.test.ts — the layering rules of the global log (modules.md §1),
// enforced statically like secret_hygiene: they are properties of the import
// graph and of words in files, which no behavioural test can see.
//   • src/lib/log*.ts is pure: it imports only siblings in src/lib (RULE 1/3).
//   • src/log/** imports only ../lib, ../state/safestorage, react or a sibling.
//   • features reach the log through log/logger and log/secrets ONLY; the shell
//     alone starts it (state/boot) and mounts the dock (ui/Workbench).
//   • the runner and the sender stay log-free: they emit events, a tap logs them.
//   • nothing in the log may name the key, its storage or its header — the log
//     is not given the key, so it cannot leak it (RULE 20, L-1).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (full: string): string => full.slice(SRC.length + 1).replace(/\\/g, "/");
const read = (r: string): string => readFileSync(join(SRC, r), "utf8");
const isCode = (r: string): boolean => /\.(ts|tsx)$/.test(r);

/** Every module specifier a file imports, re-exports from, or imports for its side effect. */
function importsOf(text: string): string[] {
  const code = withoutComments(text);
  const named = [...code.matchAll(/(?:import|export)\s[^"';]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  const bare = [...code.matchAll(/import\s+["']([^"']+)["']/g)].map((m) => m[1]);
  return [...named, ...bare];
}

const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const all = walk(SRC).map(rel).filter(isCode);
const libLog = all.filter((f) => /^lib\/log[a-z]*\.ts$/.test(f));
const logDir = all.filter((f) => f.startsWith("log/"));

describe("the log's pure layer (src/lib/log*.ts)", () => {
  it("finds the files it polices", () => {
    expect(libLog).toEqual(expect.arrayContaining(["lib/logentry.ts", "lib/logredact.ts", "lib/logbuffer.ts", "lib/logformat.ts", "lib/logscroll.ts", "lib/logprefs.ts"]));
  });

  it("imports only siblings in src/lib — no react, no state, no DOM, no other layer", () => {
    for (const f of libLog) {
      for (const spec of importsOf(read(f))) expect(spec, `${f} imports ${spec}`).toMatch(/^\.\/[a-z0-9]+$/);
    }
  });

  it("touches no browser, storage or clock global — it is a function of its arguments", () => {
    const impure = /(?<![.\w])(?:window|document|navigator)\.|\b(?:localStorage|sessionStorage)\b|\bDate\.now\b|\bnew Date\(\)/;
    for (const f of libLog) expect(withoutComments(read(f)), f).not.toMatch(impure);
  });
});

describe("src/log is its own layer", () => {
  it("finds the files it polices", () => {
    expect(logDir).toEqual(expect.arrayContaining(["log/logstore.ts", "log/logstorage.ts", "log/logger.ts", "log/secrets.ts", "log/boot.ts", "log/session.ts"]));
  });

  it("imports only ../lib/*, ../state/safestorage, react or a sibling", () => {
    const allowed = /^(\.\/[A-Za-z]+(\.css)?|\.\.\/lib\/[a-z]+|\.\.\/state\/safestorage|react|react\/jsx-runtime)$/;
    for (const f of logDir) {
      for (const spec of importsOf(read(f))) expect(spec, `${f} imports ${spec}`).toMatch(allowed);
    }
  });

  it("is reached from outside only through logger and secrets — except the shell's boot and dock", () => {
    const shell: Record<string, RegExp> = { "state/boot.ts": /log\/boot$/, "ui/Workbench.tsx": /log\/LogDock$/ };
    const feature = /(^|\/)log\/(logger|secrets)$/;
    for (const f of all.filter((x) => !x.startsWith("log/"))) {
      for (const spec of importsOf(read(f)).filter((x) => /(^|\/)log\//.test(x))) {
        expect(feature.test(spec) || shell[f]?.test(spec) === true, `${f} imports ${spec}`).toBe(true);
      }
    }
  });

  it("keeps the runner and the sender free of the log (D8)", () => {
    for (const f of ["svg/runner.ts", "svg/send.ts"]) {
      for (const spec of importsOf(read(f))) expect(spec, `${f} imports ${spec}`).not.toMatch(/(^|\/)log\//);
    }
  });
});

describe("nothing in the log can see the key", () => {
  const policed = [...libLog, ...logDir];

  it("never names authHeader, keystore or apiKey", () => {
    for (const f of policed) expect(read(f), f).not.toMatch(/\b(authHeader|keystore|apiKey)\b/);
  });

  it("never imports the key's storage or the provider adapter", () => {
    for (const f of policed) {
      for (const spec of importsOf(read(f))) expect(spec, `${f} imports ${spec}`).not.toMatch(/keystore|svgrequest|batch\/store/);
    }
  });
});
