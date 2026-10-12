#!/usr/bin/env node
// tools/bench_detect.mjs — the measurement behind
// docs/archive/2026-10-12-batch-preview-splits/design.md (§3) and its numbers.md.
//
// Research tool, NOT part of the verify lanes: it reports wall-clock milliseconds
// for the real `src/lib/detect.ts` on synthetic sheets, so the design's "what
// does one Batch row cost" question is answered by a number the repo can re-run
// instead of an estimate. Run it before and after a detector change and compare.
//
//   node tools/bench_detect.mjs                 # default sheets
//   node tools/bench_detect.mjs --reps 8        # more reps, steadier numbers
//   node --experimental-strip-types tools/bench_detect.mjs   # Node 22.12–22.17
//
// Node ≥ 22.18 imports the TypeScript source directly; older 22.x needs the flag
// (the hint below says so when the import fails).

import { register } from "node:module";

// The app's source imports `./mergeseries` without an extension (vite/vitest
// resolve that); register the hook below so plain Node can too.
register(new URL("./tsimport.mjs", import.meta.url).href);

const REPS = readReps();
// Sheet side, icon count, ink radius — the shapes Batch actually sees: one icon
// per AI-generated image (512², 1024²) up to dense sheets (4000²).
const SHEETS = [
  [512, 1, 40],
  [1024, 1, 90],
  [1024, 4, 60],
  [2048, 12, 70],
  [4000, 40, 90],
];

function readReps() {
  const i = process.argv.indexOf("--reps");
  const v = i >= 0 ? Number(process.argv[i + 1]) : 5;
  return Number.isFinite(v) && v > 0 ? Math.min(50, Math.round(v)) : 5;
}

/** A sheet of `icons` filled discs, as the Analysis the detector consumes. */
function sheet(side, icons, inkRadius) {
  const mask = new Uint8Array(side * side);
  const cols = Math.ceil(Math.sqrt(icons));
  for (let i = 0; i < icons; i++) {
    const cx = Math.floor((((i % cols) + 1) * side) / (cols + 1));
    const cy = Math.floor(((Math.floor(i / cols) + 1) * side) / (cols + 1));
    for (let dy = -inkRadius; dy <= inkRadius; dy++) {
      for (let dx = -inkRadius; dx <= inkRadius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= side || y >= side) continue;
        if (Math.hypot(dx, dy) <= inkRadius) mask[y * side + x] = 1;
      }
    }
  }
  return { w: side, h: side, scale: 1, mask, bg: [255, 255, 255], ink: [0, 0, 0], inkDiff: 255, threshold: 60 };
}

/** Average ms per call after one warm-up; the JIT would otherwise price the first call. */
function ms(fn, reps) {
  const first = fn();
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) fn();
  return { ms: (performance.now() - t0) / reps, out: first };
}

async function main() {
  let detect;
  try {
    ({ detect } = await import("../src/lib/detect.ts"));
  } catch (e) {
    console.error(`Could not import src/lib/detect.ts: ${e.message}`);
    console.error("Node >= 22.18 strips types by itself; 22.12–22.17 need: node --experimental-strip-types tools/bench_detect.mjs");
    process.exit(1);
  }
  console.log(`node ${process.version} · ${REPS} reps · detect(auto) vs detect(manual 0.05) · grid = longest/ceil(longest/400)`);
  console.log("\nsheet | icons | grid | auto | manual | per 1000 rows (auto)");
  for (const [side, icons, inkRadius] of SHEETS) {
    const an = sheet(side, icons, inkRadius);
    const f = Math.max(1, Math.ceil(side / 400));
    const auto = ms(() => detect(an, null), REPS);
    const manual = ms(() => detect(an, 0.05), REPS);
    const grid = Math.ceil(side / f);
    console.log(
      `${side}² | ${icons} | ${grid}² | ${auto.ms.toFixed(0)} ms | ${manual.ms.toFixed(0)} ms | `
      + `${((auto.ms * 1000) / 1000).toFixed(0)} s  (boxes auto/manual: ${auto.out.boxes.length}/${manual.out.boxes.length})`,
    );
  }
  console.log("\nanalyze() is not measured here — it needs a canvas (downscale + getImageData);");
  console.log("measure it in a browser if the design's per-row budget must include it.");
}

await main();
