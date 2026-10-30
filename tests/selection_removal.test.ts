// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

it('removes the exclusive original Selection UI and its single-sided thumbnail API', () => {
  for (const name of ['SelectionPanel', 'HeaderRow', 'FilterBar', 'PairList']) {
    expect(existsSync(`src/selection/${name}.tsx`), name).toBe(false);
  }
  expect(readFileSync('src/selection/thumbs.ts', 'utf8')).not.toMatch(/export (?:function useThumbFor|type ThumbFor)/);
  expect(readFileSync('src/ui/Workbench.tsx', 'utf8')).not.toMatch(/SelectionPanel|testid: "tab-selection"/);
});
