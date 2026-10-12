// detect_equivalence.test.ts — the gate that lets the merge-radius series be
// rewritten (design D1/P1): the shipped `detect` must produce the SAME boxes,
// usedFrac and autoFrac as the frozen pre-change implementation, on real masks.
//
// RULE 8: no mocks. Synthetic masks go in, box coordinates come out, and the
// oracle in tests/helpers/detect_oracle.ts is a verbatim copy of the detector as
// it was before the change — so a regression in the sweep fails here.
//
// Cost note: every comparison runs the full auto-radius search twice, so the
// masks stay small (<= 200 px side) and the timeout is raised on purpose. The
// budget was measured at ~7 s for the whole file (2026-10-12).

import { describe, expect, it } from "vitest";
import { detect, type Analysis, type Box } from "../src/lib/detect";
import { detectOracle } from "./helpers/detect_oracle";

type Ink = (x: number, y: number) => boolean;

function analysis(w: number, h: number, ink: Ink, scale = 1): Analysis {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) mask[y * w + x] = 1;
  return { w, h, scale, mask, bg: [255, 255, 255], ink: [0, 0, 0], inkDiff: 255, threshold: 60 };
}

/** A filled disc — the shape an AI icon's stroke work leaves behind. */
function disc(cx: number, cy: number, r: number): Ink {
  return (x, y) => Math.hypot(x - cx, y - cy) <= r;
}

function several(w: number, h: number, spots: [number, number, number][], speck?: [number, number]): Analysis {
  const shapes = spots.map(([x, y, r]) => disc(x, y, r));
  return analysis(w, h, (x, y) => shapes.some((s) => s(x, y)) || Boolean(speck && x === speck[0] && y === speck[1]));
}

function seededMask(seed: number, w: number, h: number, on: number): Analysis {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return analysis(w, h, () => rnd() < on);
}

/** Reading order plus the two fractions — everything detect() decides. */
function signature(boxes: Box[], usedFrac: number, autoFrac: number): unknown {
  return { boxes, usedFrac, autoFrac };
}

const FRACTIONS: (number | null)[] = [null, 0, 0.0025, 0.05, 0.15];

const FIXTURES: [string, Analysis][] = [
  ["blank sheet", analysis(120, 90, () => false)],
  ["one disc", analysis(180, 180, disc(90, 90, 30))],
  ["one disc touching two edges", analysis(120, 120, disc(0, 0, 40))],
  ["two discs far apart", several(200, 120, [[40, 60, 20], [160, 60, 20]])],
  ["four discs in a grid", several(180, 180, [[45, 45, 18], [135, 45, 18], [45, 135, 18], [135, 135, 18]])],
  ["disc plus below-threshold speck", several(200, 120, [[50, 60, 25]], [190, 110])],
  ["dithered noise", analysis(160, 120, (x, y) => (x * 7 + y * 13) % 5 === 0)],
  ["single-pixel-wide strip", analysis(180, 6, (x, y) => y === 3 && x % 9 === 0)],
];

/** Cheap fixtures (small grids) can afford every fraction. */
const CHEAP = new Set(["blank sheet", "single-pixel-wide strip", "dithered noise"]);

describe("detect — identical to the pre-change detector (frozen oracle)", () => {
  it("matches on every fixture, at every fraction for the small ones", { timeout: 60_000 }, () => {
    for (const [name, an] of FIXTURES) {
      const fracs = CHEAP.has(name) ? FRACTIONS : [null, 0, 0.05];
      for (const frac of fracs) {
        const want = detectOracle(an, frac);
        const got = detect(an, frac);
        expect(signature(got.boxes, got.usedFrac, got.autoFrac), `${name} @ ${String(frac)}`).toEqual(
          signature(want.boxes, want.usedFrac, want.autoFrac),
        );
      }
    }
  });

  it("matches on seeded random masks, including a scaled analysis", { timeout: 60_000 }, () => {
    for (const seed of [1, 2, 3, 5]) {
      const masks: [string, Analysis][] = [
        ["1:1", seededMask(seed, 180, 130, seed % 2 ? 0.05 : 0.25)],
        ["scaled", { ...seededMask(seed + 100, 90, 70, 0.2), scale: 4.5 }],
      ];
      for (const [label, a] of masks) {
        for (const frac of [null, 0.05] as const) {
          const want = detectOracle(a, frac);
          const got = detect(a, frac);
          expect(signature(got.boxes, got.usedFrac, got.autoFrac), `seed ${seed} ${label} @ ${String(frac)}`).toEqual(
            signature(want.boxes, want.usedFrac, want.autoFrac),
          );
        }
      }
    }
  });

  it("never invents a box on a blank sheet (empty stays empty)", () => {
    const blank = analysis(300, 300, () => false);
    for (const frac of FRACTIONS) {
      expect(detect(blank, frac).boxes).toEqual([]);
      expect(detect(blank, frac).autoFrac).toBe(detectOracle(blank, frac).autoFrac);
    }
  });
});
