// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, expect, it } from "vitest";

let dir: string;
const cli = (...args: string[]) => spawnSync(process.execPath, ['tools/harness-benchmark.mjs', ...args], { encoding: 'utf8' });
const sample = (seconds: number, exitCode = 0) => ({ schema: 1, seconds, exitCode, environment: { node: 'same', platform: 'same', arch: 'same', cpus: 2, cpuModel: 'same', memoryBytes: 4096, kernel: 'same', host: 'same' } });
function save(name: string, value: unknown) { const path = join(dir, name); writeFileSync(path, JSON.stringify(value)); return path; }
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'harness-benchmark-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it('records a real command wall time and propagates nonzero exits instead of blessing failed tests', () => {
  const output = join(dir, 'run.json');
  const run = cli('--output', output, '--label', 'failing probe', '--', process.execPath, '-e', 'process.exit(33)');
  expect(run.status).toBe(33);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  expect(report).toMatchObject({ schema: 1, exitCode: 33, label: 'failing probe' });
  expect(report.seconds).toBeGreaterThan(0);
  expect(report.environment.cpus).toBeGreaterThan(0);
});

it('accepts exactly 60% reduction and rejects a miss using the median of repeated candidate runs', () => {
  const before = save('before.json', sample(100));
  const at = save('at.json', sample(40));
  expect(cli('--compare', before, at).status).toBe(0);
  const miss = save('miss.json', sample(40.1));
  expect(cli('--compare', before, miss).status).toBe(1);
  expect(JSON.parse(cli('--compare', before, at, save('faster.json', sample(20)), save('slower.json', sample(80))).stdout)).toMatchObject({ passed: true, afterSeconds: 40, reductionPct: 60 });
});

it('rejects failed, malformed, zero-duration or different-machine evidence', () => {
  const before = save('before.json', sample(100));
  for (const [name, value] of [
    ['failed', sample(1, 1)], ['zero', sample(0)], ['invalid', {}],
    ['different', { ...sample(1), environment: { ...sample(1).environment, cpus: 16 } }],
  ] as const) expect(cli('--compare', before, save(`${name}.json`, value)).status, name).toBe(1);
  expect(cli('--compare', save('failed-before.json', sample(100, 1)), save('after.json', sample(1))).status).toBe(1);
});

it('records enough machine identity to reject different hardware and invalid CPU evidence', () => {
  const output = join(dir, 'real.json');
  expect(cli('--output', output, '--', process.execPath, '-e', 'process.exit(0)').status).toBe(0);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  expect(report.environment.cpuModel).toBeTypeOf('string');
  expect(report.environment.memoryBytes).toBeGreaterThan(0);
  expect(report.environment.kernel).toBeTypeOf('string');
  expect(report.environment.host).toBeTypeOf('string');
  const invalid = sample(30); invalid.environment.cpus = -1;
  expect(cli('--compare', save('before.json', sample(100)), save('invalid.json', invalid)).status).toBe(1);
  const other = sample(30); other.environment.cpuModel = 'different';
  expect(cli('--compare', save('before.json', sample(100)), save('other.json', other)).status).toBe(1);
});

it('supports a requested additional 50% reduction without changing the default 60% target', () => {
  const before = save('before.json', sample(100));
  const at = save('at50.json', sample(50));
  expect(cli('--compare', before, at).status).toBe(1); // default remains 60%
  const exact = cli('--compare', before, at, '--required-reduction', '50');
  expect(exact.status, exact.stderr).toBe(0);
  expect(JSON.parse(exact.stdout)).toMatchObject({ passed: true, requiredReductionPct: 50, reductionPct: 50 });
  expect(cli('--compare', before, save('miss50.json', sample(50.01)), '--required-reduction', '50').status).toBe(1);
  const median = cli('--compare', '--required-reduction', '50', before, at,
    save('faster50.json', sample(20)), save('slower50.json', sample(80)));
  expect(median.status, median.stderr).toBe(0);
  expect(JSON.parse(median.stdout)).toMatchObject({ afterSeconds: 50, passed: true });
});

it('rejects missing, nonnumeric and out-of-range reduction targets with a diagnostic', () => {
  const before = save('before.json', sample(100));
  const after = save('after.json', sample(1));
  for (const value of ['', 'no', 'NaN', 'Infinity', '-1', '0', '100', '101']) {
    const result = cli('--compare', before, after, '--required-reduction', value);
    expect(result.status, value).toBe(1);
    expect(result.stderr, value).toMatch(/reduction.*between 0 and 100/i);
  }
  const missing = cli('--compare', before, after, '--required-reduction');
  expect(missing.status).toBe(1);
  expect(missing.stderr).toMatch(/reduction.*between 0 and 100/i);
});
