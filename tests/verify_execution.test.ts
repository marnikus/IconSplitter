// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type Lane = { name: string; cmd: string; args: string[]; executionGroup: string };
const {runVerification, canOverlapVerification} = await import(pathToFileURL(resolve('tools/verify-execution.mjs')).href) as {
  runVerification: (lanes: Lane[], cwd: string, overlap: boolean, signal?: AbortSignal) => Promise<number>;
  canOverlapVerification: (cpus: number, bytes: number) => boolean;
};
let dir: string;
beforeEach(() => {dir = mkdtempSync(join(tmpdir(), 'verify-execution-'));});
afterEach(() => rmSync(dir, {recursive: true, force: true}));
const events = () => readFileSync(join(dir, 'events'), 'utf8').trim().split('\n');
function lane(name: string, group: string, code = 0): Lane {
  const body = `const fs=require('fs');fs.appendFileSync('events','${name}:start\\n');setTimeout(()=>{fs.appendFileSync('events','${name}:end\\n');process.exit(${code});},100);`;
  return {name, executionGroup: group, cmd: process.execPath, args: ['-e', body]};
}
function pairedLane(name: string, peer: string, group: string): Lane {
  const work = lane(name, group);
  work.args = ['-e', `const fs=require('fs');fs.appendFileSync('events','${name}:start\\n');
    const limit=setTimeout(()=>process.exit(2),2000);
    const poll=setInterval(()=>{if(fs.readFileSync('events','utf8').includes('${peer}:start')){
      clearInterval(poll);clearTimeout(limit);fs.appendFileSync('events','${name}:end\\n');}},10);`];
  return work;
}
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return process.platform !== 'linux' || readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0] !== 'Z';
  } catch {return false;}
}
const fixtures = () => [lane('types', 'static'), lane('lint', 'static'), lane('native', 'native'), lane('suite', 'suite'), lane('build', 'static')];

it('only overlaps on hosts with sufficient CPU and constrained memory', () => {
  expect(canOverlapVerification(2, 4 * 1024 ** 3)).toBe(true);
  expect(canOverlapVerification(1, 64 * 1024 ** 3)).toBe(false);
  expect(canOverlapVerification(8, 2 * 1024 ** 3)).toBe(false);
});
it('keeps native alarms alone and serializes static jobs while overlapping the suite', async () => {
  const work = fixtures();
  work[0] = pairedLane('types', 'suite', 'static');
  work[3] = pairedLane('suite', 'types', 'suite');
  expect(await runVerification(work, dir, true)).toBe(0);
  const e = events();
  expect(e.slice(0, 2)).toEqual(['native:start', 'native:end']);
  expect(e.indexOf('types:end')).toBeLessThan(e.indexOf('lint:start'));
  expect(e.indexOf('lint:end')).toBeLessThan(e.indexOf('build:start'));
  expect(Math.max(e.indexOf('types:start'), e.indexOf('suite:start')))
    .toBeLessThan(Math.min(e.indexOf('types:end'), e.indexOf('suite:end')));
  expect(new Set(e).size).toBe(10);
});
it('retains canonical sequential execution when overlap is disabled', async () => {
  expect(await runVerification(fixtures(), dir, false)).toBe(0);
  expect(events()).toEqual(['types:start','types:end','lint:start','lint:end','native:start','native:end','suite:start','suite:end','build:start','build:end']);
});
it('propagates each failure but still executes the remaining gates', async () => {
  const work = fixtures(); work[0] = lane('types', 'static', 3); work[3] = lane('suite', 'suite', 4);
  expect(await runVerification(work, dir, true)).toBe(2);
  expect(events()).toContain('build:end');
});
it('treats an executable start error as a failure and never silently drops an unknown group', async () => {
  expect(await runVerification([{...lane('broken', 'static'),cmd:join(dir,'missing')}], dir, true)).toBe(1);
  await expect(runVerification([lane('unknown', 'typo')], dir, true)).rejects.toThrow('refusing to omit');
});
it('does not launch work after cancellation', async () => {
  const controller = new AbortController();controller.abort();
  expect(await runVerification(fixtures(), dir, true, controller.signal)).toBe(5);
});
it('terminates an active child and its grandchild on cancellation', async () => {
  const controller = new AbortController();
  const work = lane('long', 'suite');
  work.args = ['-e', `const child=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});
    require('fs').writeFileSync('grandchild',String(child.pid));setInterval(()=>{},1000);`];
  const result = runVerification([work], dir, true, controller.signal);
  let pid = 0;
  try {
    await vi.waitFor(() => {pid = Number(readFileSync(join(dir, 'grandchild'), 'utf8'));expect(pid).toBeGreaterThan(0);});
    controller.abort();
    expect(await result).toBe(1);
    await vi.waitFor(() => expect(isRunning(pid)).toBe(false));
  } finally {
    controller.abort();
    if (pid && isRunning(pid)) process.kill(pid, 'SIGKILL');
  }
});
