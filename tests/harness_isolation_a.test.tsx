import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { isolatedCounter } from "./helpers/harnessisolation";
import { settle } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let cleanups = 0;
const cleanup = vi.fn(() => { cleanups++; });
function Probe() { useEffect(() => () => cleanup(), []); return <span>tracked root</span>; }

it('starts in a fresh realm/module/storage and leaves a tracked root deliberately mounted', async () => {
  expect(Reflect.get(globalThis, Symbol.for('iconSplitter.test.domSetup'))).toBe(true);
  expect(Reflect.get(globalThis, Symbol.for('iconSplitter.test.isolation'))).toBeUndefined();
  expect(isolatedCounter.value).toBe(0);
  expect(localStorage.getItem('harness-isolation')).toBeNull();
  Reflect.set(globalThis, Symbol.for('iconSplitter.test.isolation'), 'a');
  isolatedCounter.value++;
  localStorage.setItem('harness-isolation', 'a');
  const host = document.createElement('div'); document.body.appendChild(host);
  await act(async () => createRoot(host).render(<Probe />));
  expect(host.textContent).toBe('tracked root');
});

it('unmounts leaked roots, clears the body, and keeps bounded timer settling working', async () => {
  expect(cleanups).toBe(1);
  expect(document.body.childElementCount).toBe(0);
  expect(isolatedCounter.value).toBe(1); // state is retained within this file, not across files
  let fired = false;
  setTimeout(() => { fired = true; }, 20);
  await settle(25);
  expect(fired).toBe(true);
});
