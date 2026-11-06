// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ESLint } from "eslint";
import { afterEach, beforeEach, expect, it } from "vitest";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'harness-static-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it('content-based lint caching catches edits even with the original timestamp restored', async () => {
  const file = join(dir, 'sample.js');
  writeFileSync(file, 'const value = 1;');
  const stamp = statSync(file);
  const lint = () => new ESLint({ cwd: dir, overrideConfigFile: true, overrideConfig: { rules: { 'no-undef': 'error' } },
    cache: true, cacheStrategy: 'content', cacheLocation: join(dir, 'lint.cache') }).lintFiles([file]);
  expect((await lint())[0].errorCount).toBe(0);
  writeFileSync(file, 'unknown();'); utimesSync(file, stamp.atime, stamp.mtime);
  expect((await lint())[0].errorCount).toBe(1);
  writeFileSync(file, 'const value = 2;'); utimesSync(file, stamp.atime, stamp.mtime);
  expect((await lint())[0].errorCount).toBe(0);
});

it('incremental no-emit typechecking catches a new error instead of reusing cached success', () => {
  const file = join(dir, 'sample.ts');
  writeFileSync(file, 'export const value: number = 1;');
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], skipLibCheck: true }, files: ['sample.ts'] }));
  const check = () => spawnSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--project', join(dir, 'tsconfig.json'),
    '--noEmit', '--incremental', '--tsBuildInfoFile', join(dir, 'types.tsbuildinfo')], { encoding: 'utf8' });
  expect(check().status).toBe(0);
  expect(readFileSync(join(dir, 'types.tsbuildinfo'), 'utf8').length).toBeGreaterThan(0);
  writeFileSync(file, 'export const value: number = "wrong";');
  const failed = check();
  expect(failed.status).not.toBe(0);
  expect(failed.stdout).toContain('TS2322');
}, 10000);
