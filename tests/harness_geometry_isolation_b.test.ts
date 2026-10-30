// @vitest-environment node
import { expect, it } from "vitest";

it('runs in the real Node realm without leaking global state between geometry files', () => {
  expect(Buffer.from([1, 2])).toBeInstanceOf(Uint8Array);
  expect(typeof document).toBe('undefined');
  const marker = Symbol.for('iconSplitter.test.geometryLeak');
  expect(Reflect.get(globalThis, marker)).toBeUndefined();
  Reflect.set(globalThis, marker, 'poison left deliberately for the other file');
});
