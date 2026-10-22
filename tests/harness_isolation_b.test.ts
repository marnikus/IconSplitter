import { expect, it } from "vitest";
import { isolatedCounter } from "./helpers/harnessisolation";

it('gets its own realm/module/storage regardless of the other canary file order', () => {
  expect(Reflect.get(globalThis, Symbol.for('iconSplitter.test.domSetup'))).toBe(true);
  expect(Reflect.get(globalThis, Symbol.for('iconSplitter.test.isolation'))).toBeUndefined();
  expect(isolatedCounter.value).toBe(0);
  expect(localStorage.getItem('harness-isolation')).toBeNull();
  Reflect.set(globalThis, Symbol.for('iconSplitter.test.isolation'), 'b');
  isolatedCounter.value++;
  localStorage.setItem('harness-isolation', 'b');
});
