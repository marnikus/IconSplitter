// @vitest-environment node
// Exercise the REAL selected provider: uncalled code must not be reported as covered.
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, expect, it } from "vitest";

let dir: string;
let partial: ReturnType<typeof spawnSync>, complete: ReturnType<typeof spawnSync>;
let partialSummary: { lines: { pct: number }; functions: { pct: number }; branches: { pct: number } };
let completeSummary: typeof partialSummary;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-coverage-'));
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'junction');
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'calc.js'), 'export function choose(v) { if (v) { return 1; } return 2; }\nexport function other() { return 3; }\n');
  writeFileSync(join(dir, 'vitest.config.mjs'), `export default { test: {
    root: ${JSON.stringify(dir)}, environment: 'node', pool: 'threads', maxWorkers: 1,
    include: ['canary.test.js'], coverage: { provider: 'istanbul', include: ['calc.js'],
      reportsDirectory: ${JSON.stringify(join(dir, 'coverage'))}, reporter: ['json-summary'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 } }
  } };`);
  const run = (body: string) => {
    writeFileSync(join(dir, 'canary.test.js'), `import {it,expect} from 'vitest'; import {choose,other} from './calc.js'; it('coverage canary',()=>{${body}});`);
    return spawnSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', join(dir, 'vitest.config.mjs'), '--coverage'], { encoding: 'utf8' });
  };
  partial = run('expect(choose(true)).toBe(1);');
  partialSummary = JSON.parse(readFileSync(join(dir, 'coverage/coverage-summary.json'), 'utf8')).total;
  complete = run('expect(choose(true)).toBe(1); expect(choose(false)).toBe(2); expect(other()).toBe(3);');
  completeSummary = JSON.parse(readFileSync(join(dir, 'coverage/coverage-summary.json'), 'utf8')).total;
}, 15000);
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

it('rejects a real uncovered function and branch at the unchanged 100% canary threshold', () => {
  expect(partial.status, String(partial.stdout) + String(partial.stderr)).toBe(1);
  expect(partialSummary.functions.pct).toBeLessThan(100);
  expect(partialSummary.branches.pct).toBeLessThan(100);
});

it('passes only after every canary function and branch executes', () => {
  expect(complete.status, String(complete.stdout) + String(complete.stderr)).toBe(0);
  expect(completeSummary.lines.pct).toBe(100);
  expect(completeSummary.functions.pct).toBe(100);
  expect(completeSummary.branches.pct).toBe(100);
});
