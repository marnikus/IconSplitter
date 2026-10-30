import type { Seg } from "../../src/lib/upload/geom/expand/pen";

export function offsetCases(): { curve: Seg; distance: number }[] {
  let state = 43040;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const cases: { curve: Seg; distance: number }[] = [
    { curve: { kind: 'C', p0: [0, 0], p1: [0, 10], p2: [10, 10], p3: [10, 0] }, distance: 2 },
    { curve: { kind: 'C', p0: [0, 0], p1: [100, 100], p2: [-100, 100], p3: [0, 0] }, distance: -50 },
    { curve: { kind: 'C', p0: [1, 2], p1: [1, 2], p2: [5, 6], p3: [8, 4] }, distance: 0 },
    { curve: { kind: 'C', p0: [1e12, 1e12], p1: [1e12, 1e12 + 100], p2: [1e12 + 100, 1e12], p3: [1e12 + 100, 1e12 + 100] }, distance: 0.01 },
  ];
  for (let i = 0; i < 32; i++) {
    const point = (): [number, number] => [(next() - 0.5) * 1000, (next() - 0.5) * 1000];
    cases.push({ curve: { kind: 'C', p0: point(), p1: point(), p2: point(), p3: point() }, distance: (next() - 0.5) * 100 });
  }
  return cases;
}
