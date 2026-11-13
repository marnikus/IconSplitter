// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it('keeps pure Node bootstrap free of DOM/React setup', () => {
  expect(typeof document).toBe('undefined');
  expect(Reflect.get(globalThis, Symbol.for('iconSplitter.test.domSetup'))).toBeUndefined();
  const setup = readFileSync('tests/setup/harness.ts', 'utf8');
  expect(setup).not.toMatch(/from ["']react|from ["'].*quiet/);
});
