// equivalence.mjs — the measurement behind §3 of ../design.md (2026-10-12).
//
// RESEARCH ARTIFACT. Never imported by src/ or tests/: it exists so the design's
// two load-bearing claims can be re-run by a reviewer, and so P1 rebuilds the
// production module under TDD from a verified reference.
//
//   node --experimental-strip-types docs/archive/2026-10-12-batch-preview-splits/prototype/equivalence.mjs [--seeds N] [--bench]
//
//   * `detect` (src/lib/detect.ts, unmodified) against a prototype whose radius
//     series is computed in ONE union-find sweep instead of rMax dilate+label runs.
//   * Prints: series identity, full detect identity (boxes/usedFrac/autoFrac)
//     and the speed-up table.
//
// Expected (2026-10-12, Node v22.22.3): 48/48 series identical, 288/288 detect
// identical, 4.3x - 8.0x faster.

import { detect } from "../../../../src/lib/detect.ts";
import { detectProto } from "./fast.mjs";
import { build } from "./cases.mjs";

const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};
const SEEDS = arg("--seeds", 48);
const BENCH = process.argv.includes("--bench");

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

let checked = 0, resultBad = 0, seriesBad = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const an = build(seed);
  const rnd = rng(seed * 104729);
  const oldSeries = detectProto(an, null, false).series;
  const newSeries = detectProto(an, null, true).series;
  if (JSON.stringify(oldSeries) !== JSON.stringify(newSeries)) seriesBad++;
  for (const fr of [null, 0, 0.0025, 0.05, 0.15, +(rnd() * 0.15).toFixed(5)]) {
    const want = detect(an, fr);
    const got = detectProto(an, fr, true);
    checked++;
    const ok = want.usedFrac === got.usedFrac && want.autoFrac === got.autoFrac
      && JSON.stringify(want.boxes) === JSON.stringify(got.boxes);
    if (!ok) {
      resultBad++;
      if (resultBad === 1) {
        console.log("MISMATCH seed", seed, "frac", fr);
        console.log("  want", JSON.stringify(want).slice(0, 300));
        console.log("  got ", JSON.stringify(got).slice(0, 300));
      }
    }
  }
}
console.log(`series identical: ${SEEDS - seriesBad}/${SEEDS}`);
console.log(`detect identical: ${checked - resultBad}/${checked} (boxes, usedFrac, autoFrac)`);

if (BENCH) {
  function sheet(side, icons, inkR) {
    const mask = new Uint8Array(side * side);
    const cols = Math.ceil(Math.sqrt(icons));
    for (let i = 0; i < icons; i++) {
      const cx = Math.floor(((i % cols) + 1) * side / (cols + 1));
      const cy = Math.floor((Math.floor(i / cols) + 1) * side / (cols + 1));
      for (let j = -inkR; j <= inkR; j++) for (let k = -inkR; k <= inkR; k++) {
        const x = cx + k, y = cy + j;
        if (x >= 0 && y >= 0 && x < side && y < side && Math.hypot(k, j) <= inkR) mask[y * side + x] = 1;
      }
    }
    return { w: side, h: side, scale: 1, mask, bg: [255, 255, 255], ink: [0, 0, 0], inkDiff: 255, threshold: 60 };
  }
  const time = (fn, reps = 5) => { fn(); const t0 = performance.now(); for (let i = 0; i < reps; i++) fn(); return (performance.now() - t0) / reps; };
  console.log("\nsheet | old detect(auto) | new detect(auto) | speed-up");
  for (const [side, icons, inkR] of [[512, 1, 40], [1024, 1, 90], [1024, 4, 60], [2048, 12, 70], [4000, 40, 90]]) {
    const an = sheet(side, icons, inkR);
    const oldMs = time(() => detect(an, null));
    const newMs = time(() => detectProto(an, null, true), 8);
    console.log(`${side}^2 / ${icons} icon(s) | ${oldMs.toFixed(0)} ms | ${newMs.toFixed(0)} ms | ${(oldMs / newMs).toFixed(1)}x`);
  }
}
