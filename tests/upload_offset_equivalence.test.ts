// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { offsetSeg } from '../src/lib/upload/geom/expand/offset';
import * as pen from '../src/lib/upload/geom/expand/pen';
import hashes from './assets/geometry_offset_reference.json';
import { offsetCases } from './helpers/offsetcases';

afterEach(() => vi.restoreAllMocks());
it('retains bit-for-bit original281edd6 segment output for36 adversarial/seeded offsets', () => {
  for (const [i, {curve, distance}] of offsetCases().entries()) {
    const output = createHash('sha256').update(JSON.stringify(offsetSeg(curve, distance))).digest('hex');
    expect(output, `reference case ${i}`).toBe(hashes[i]);
  }
});

it('does not allocate imported point/vector results for every golden-search iteration', () => {
  const calls = vi.spyOn(pen, 'pointAt'); // observational call-through: real math still runs
  const {curve, distance} = offsetCases()[0];
  const result = offsetSeg(curve, distance);
  expect(createHash('sha256').update(JSON.stringify(result)).digest('hex')).toBe(hashes[0]);
  expect(calls.mock.calls.length).toBeLessThan(100);
});
