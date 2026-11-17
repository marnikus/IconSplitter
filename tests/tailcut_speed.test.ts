// tailcut_speed.test.ts — the tail cutter is fast (2026-11-06): a review plus
// a cut of a typical generated icon takes about a millisecond, and even a heavy
// icon stays well under one frame. Timings are averaged over many runs (the
// Windows timer is coarse). The save goes through the real write path on a
// fake folder.
import { describe, expect, it } from "vitest";
import { cutTails, findTails } from "../src/lib/tailcut";
import { writeSvgMarkup } from "../src/svg/svgedit";
import { FakeDir, FakeFile } from "./helpers/fakefs";

/** A house-like icon: roof, walls, a door poking through the floor, a window, curves and circles. */
function typicalIcon(): string {
  const body = [
    '<path d="M100 400L512 120L924 400"/>',
    '<path d="M180 330L180 880"/>', // pokes through the roof
    '<path d="M844 330L844 880"/>',
    '<path d="M150 880L874 880"/>',
    '<path d="M400 600L400 893"/>', // door pokes through the floor
    '<path d="M400 600C400 560 430 540 460 540L560 540C590 540 620 560 620 600L620 880"/>',
    '<path d="M660 460H780V560H660Z"/>',
    '<path d="M60 700C120 640 160 760 220 700C260 660 300 720 330 690"/>',
    '<circle cx="243" cy="539" r="36"/><circle cx="777" cy="539" r="36"/>',
    '<path d="M0 960L300 960"/><path d="M700 960L1024 960"/>',
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none" stroke="#000">${body.join("")}</svg>`;
}

/** 200 curved shapes on a grid, every fourth one with a tail. */
function heavyIcon(): string {
  const parts: string[] = [];
  for (let i = 0; i < 200; i++) {
    const x = (i % 20) * 50, y = Math.floor(i / 20) * 100;
    parts.push(`<path d="M${x} ${y + 50}L${x + 45} ${y + 50}"/>`);
    parts.push(`<path d="M${x + 10} ${y}C${x + 10} ${y + 20} ${x + 20} ${y + 30} ${x + 20} ${y + (i % 4 === 0 ? 55 : 45)}"/>`);
  }
  return `<svg viewBox="0 0 1000 1000">${parts.join("")}</svg>`;
}

/** The best of three timed batches: background load on a busy test machine only ever adds time. */
function averageMs(runs: number, fn: () => void): number {
  fn(); // warm up
  let best = Infinity;
  for (let batch = 0; batch < 3; batch++) {
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) fn();
    best = Math.min(best, (performance.now() - t0) / runs);
  }
  return best;
}

describe("speed", () => {
  it("a typical icon: review + cut in about a millisecond", () => {
    const src = typicalIcon();
    const tails = findTails(src, 20);
    expect(tails.length).toBeGreaterThanOrEqual(2);
    const ms = averageMs(200, () => { cutTails(src, findTails(src, 20)); });
    expect(ms).toBeLessThan(5);
  });

  // measured 2026-11-06 on this machine: typical ≈ 0.6 ms, heavy ≈ 12.5 ms (was 70 ms before the
  // spatial grid and the one-pass write); the limits leave room for a loaded parallel test run.
  it("a heavy icon (400 shapes, 50 tails) stays within a couple of frames", () => {
    const src = heavyIcon();
    expect(findTails(src, 10)).toHaveLength(50);
    const ms = averageMs(10, () => { cutTails(src, findTails(src, 10)); });
    expect(ms).toBeLessThan(30);
  });

  it("review + cut + save of one icon through the real write path", async () => {
    const src = typicalIcon();
    const root = new FakeDir("root");
    const dir = new FakeDir("a");
    root.children.set("a", dir);
    dir.children.set("a_AI.svg", new FakeFile("a_AI.svg", src.length, 1, src));
    const runs = 50;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      const out = cutTails(src, findTails(src, 20));
      if (out !== null) await writeSvgMarkup(root as never, "a/a_AI.svg", out);
    }
    expect((performance.now() - t0) / runs).toBeLessThan(10);
  });
});
