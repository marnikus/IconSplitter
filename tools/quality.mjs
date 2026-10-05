#!/usr/bin/env node
// RULE 16 gate (AGENT_RULES.md) — TypeScript adaptation of the sister
// project's tools/verify_quality.py. Hard fail lines on new code plus a
// per-file baseline ratchet: legacy may stay at its recorded maximum, but
// any growth fails even with --allow-legacy.
//
//   node tools/quality.mjs                          # full gate
//   node tools/quality.mjs --changed --allow-legacy # changed files only
//   node tools/quality.mjs --write-baseline         # integrator only
//   node tools/quality.mjs --json

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import ts from "typescript";

const ROOT = new URL("..", import.meta.url).pathname;
const BASELINE_PATH = new URL("quality_baseline.json", import.meta.url).pathname;

// §16.1 / §16.2 frozen fail lines
const LIMITS = { funcLoc: 30, params: 4, cc: 10, nesting: 4, fileWarn: 300, fileFail: 500 };
const ANTI_GAME = /(?:^|[a-z])(?:_part|Part|_chunk|Chunk|_step|Step)\d*$/;

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const writeBaseline = args.includes("--write-baseline");
const allowLegacy = args.includes("--allow-legacy");
const changedOnly = args.includes("--changed");

const say = (...a) => !jsonOut && console.log(...a);

function srcFiles() {
  const out = execSync('find src -type f \\( -name "*.ts" -o -name "*.tsx" \\)', { cwd: ROOT }).toString();
  return out.trim().split("\n").filter(Boolean).sort();
}

// git's empty tree: the honest base when no commit to compare against exists.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** Best comparison point: merge-base, then HEAD~1, else the empty tree. */
function diffBase() {
  for (const cmd of ["git merge-base origin/main HEAD", "git rev-parse HEAD~1"]) {
    try {
      return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch { /* try the next base */ }
  }
  return EMPTY_TREE; // single-commit checkout: gate every tracked file
}

function changedFiles() {
  const diff = execSync(`git diff --name-only ${diffBase()}`, { cwd: ROOT }).toString().trim();
  const unstaged = execSync("git diff --name-only HEAD", { cwd: ROOT }).toString().trim();
  // Untracked files never appear in git diff — detect them explicitly,
  // so a brand-new over-line file cannot slip past --changed.
  const untracked = execSync("git ls-files --others --exclude-standard", { cwd: ROOT }).toString().trim();
  const set = new Set([...diff.split("\n"), ...unstaged.split("\n"), ...untracked.split("\n")].filter(Boolean));
  return srcFiles().filter((f) => set.has(f));
}

function forEachFn(node, visit) {
  const fnLike =
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node);
  if (fnLike) visit(node); // nested fns are visited below and scored separately
  ts.forEachChild(node, (c) => forEachFn(c, visit));
}

function complexity(node) {
  let cc = 1, nest = 0, maxNest = 0;
  const blockish = (n) =>
    ts.isIfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) ||
    ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isTryStatement(n);
  const fnLike = (n) =>
    ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) ||
    ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);
  const walk = (n, elseIf) => {
    if (fnLike(n)) return; // nested functions are scored on their own
    if (ts.isBinaryExpression(n) && ["&&", "||", "??"].includes(n.operatorToken.getText())) cc++;
    if (ts.isConditionalExpression(n) || ts.isCaseClause(n) || ts.isCatchClause(n)) cc++;
    if (ts.isIfStatement(n)) cc++;
    if (ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) ||
        ts.isWhileStatement(n) || ts.isDoStatement(n)) cc++;
    const addDepth = blockish(n) && !elseIf;
    if (addDepth) { nest++; maxNest = Math.max(maxNest, nest); }
    ts.forEachChild(n, (c) => walk(c, ts.isIfStatement(n) && c === n.elseStatement && ts.isIfStatement(c)));
    if (addDepth) nest--;
  };
  if (node.body) walk(node.body, false);
  return { cc, maxNest };
}

function fnName(node, sf) {
  if (node.name) return node.name.getText(sf);
  const p = node.parent;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.getText(sf);
  if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.getText(sf);
  return "(anonymous)";
}

function measureFile(rel) {
  const text = readFileSync(ROOT + rel, "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true,
    rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const loc = (n) => sf.getLineAndCharacterOfPosition(n.getEnd()).line -
    sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const fns = [];
  forEachFn(sf, (node) => {
    const { cc, maxNest } = complexity(node);
    fns.push({ name: fnName(node, sf), loc: loc(node), params: node.parameters.length, cc, nesting: maxNest });
  });
  const max = (k) => fns.reduce((m, f) => Math.max(m, f[k]), 0);
  return { file: rel, fileLines: text.split("\n").length, funcCount: fns.length, fns,
    maxima: { max_func_loc: max("loc"), max_params: max("params"), max_cc: max("cc"), max_nest: max("nesting") } };
}

function gateOne(m, baseline) {
  const base = baseline[m.file]; // undefined => new file, must meet hard lines
  const failures = [], legacy = [];
  // legacy = recorded in baseline AND not grown; --allow-legacy downgrades to warn
  const lane = (grown) => (grown || !allowLegacy ? failures : legacy);

  for (const f of m.fns) {
    if (ANTI_GAME.test(f.name)) { failures.push(`${f.name}: anti-gaming name (partN helper)`); continue; }
    const over =
      f.loc > LIMITS.funcLoc || f.params > LIMITS.params || f.cc > LIMITS.cc || f.nesting > LIMITS.nesting;
    if (!over) continue;
    const detail = `${f.name} (loc ${f.loc}/${LIMITS.funcLoc}, params ${f.params}/${LIMITS.params}, cc ${f.cc}/${LIMITS.cc}, nest ${f.nesting}/${LIMITS.nesting})`;
    if (!base) { failures.push(detail); continue; }
    // A new over-line function, or any metric grown vs the recorded offender, fails.
    const rec = base.funcs?.[f.name];
    const grown = !rec || f.loc > rec.loc || f.params > rec.params || f.cc > rec.cc || f.nesting > rec.nesting;
    lane(grown).push(grown ? `${detail} [new/grown vs baseline]` : detail);
  }
  // Ratchet: file growth above the recorded value fails outright.
  if (m.fileLines > LIMITS.fileWarn) {
    if (!base) failures.push(`new file ${m.fileLines} lines > ${LIMITS.fileWarn}`);
    else if (m.fileLines > base.file_lines)
      failures.push(`ratchet growth: file_lines ${base.file_lines} -> ${m.fileLines}`);
    else lane(false).push(`file ${m.fileLines} lines > ${LIMITS.fileWarn} (held)`);
  }
  return { ...m, failures, legacy };
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : {};
const files = changedOnly ? changedFiles() : srcFiles();
if (changedOnly) say(`Changed files vs merge-base: ${files.length ? files.join(", ") : "(none)"}`);

const results = files.map((f) => gateOne(measureFile(f), baseline));
const failed = results.filter((r) => r.failures.length);
for (const r of results) {
  const tag = r.failures.length ? "FAIL" : r.legacy.length ? "LEGACY" : "OK";
  say(`[${tag}] ${r.file} — ${r.funcCount} fns, ${r.fileLines} lines`);
  r.failures.forEach((x) => say(`   ✗ ${x}`));
  r.legacy.forEach((x) => say(`   ⚠ legacy: ${x}`));
}
if (jsonOut) console.log(JSON.stringify(results, null, 2));

if (writeBaseline) {
  const out = {};
  for (const r of srcFiles().map((f) => measureFile(f))) {
    const funcs = {};
    for (const f of r.fns) {
      const prev = funcs[f.name];
      funcs[f.name] = {
        loc: Math.max(f.loc, prev?.loc ?? 0),
        params: Math.max(f.params, prev?.params ?? 0),
        cc: Math.max(f.cc, prev?.cc ?? 0),
        nesting: Math.max(f.nesting, prev?.nesting ?? 0),
      };
    }
    out[r.file] = { file_lines: r.fileLines, func_count: r.funcCount, funcs };
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + "\n");
  say(`Baseline written: ${BASELINE_PATH}`);
}

say(failed.length ? `\nGATE FAILED — ${failed.length} file(s). Fix in RULE 19 order (nesting → CC → cognitive → size).`
  : "\nGATE PASSED");
process.exit(failed.length ? 1 : 0);
