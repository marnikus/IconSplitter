import { describe, expect, it } from "vitest";
import { imageEditLimit, planImageEditGroups, returnedCellRect, compositeEditPrompt } from "../src/lib/svgimgbatch";

const sources = (count: number) => Array.from({ length: count }, (_, i) => ({
  id: `pair-${i + 1}`, name: `icon-${i + 1}.png`, fingerprint: `main-${i + 1}`,
}));

describe("image-edit composite plans", () => {
  it("keeps one source per request at size one", () => {
    const groups = planImageEditGroups(sources(2), 1, 1024);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.cells[0].id)).toEqual(["pair-1", "pair-2"]);
    expect(groups.every((group) => group.cols === 1 && group.empty.length === 0)).toBe(true);
  });

  it("maps nine selected pairs to one square 3x3 sheet in selection order", () => {
    const [group] = planImageEditGroups(sources(9), 9, 1024);
    expect(group.cols).toBe(3);
    expect(group.cells.map((cell) => [cell.id, cell.position, cell.rect])).toEqual(
      sources(9).map((source, index) => [source.id, index + 1, {
        x: (index % 3) / 3, y: Math.floor(index / 3) / 3, w: 1 / 3, h: 1 / 3,
      }]),
    );
    expect(group.empty).toEqual([]);
  });

  it("keeps partial groups square with blank cells, without creating extra icons", () => {
    const groups = planImageEditGroups(sources(10), 5, 1024);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.cols)).toEqual([3, 3]);
    expect(groups[0].empty).toEqual([6, 7, 8, 9]);
    expect(groups[1].cells.map((cell) => cell.id)).toEqual(sources(10).slice(5).map((source) => source.id));
    expect(planImageEditGroups(sources(9), 4, 1024).map((group) => group.cells.length)).toEqual([4, 4, 1]);
  });

  it("refuses duplicate identities and an unsafe size instead of guessing", () => {
    expect(() => planImageEditGroups([sources(1)[0], sources(1)[0]], 2, 1024)).toThrow(/duplicate/i);
    expect(() => planImageEditGroups(sources(2), 0, 1024)).toThrow(/count/i);
    expect(() => planImageEditGroups(sources(9), 9, 512)).toThrow(/limit/i);
    expect(imageEditLimit(1024)).toBe(16);
    expect(imageEditLimit(768)).toBe(9);
  });

  it("scales fractional edges to changed output dimensions without shifting identity", () => {
    const [group] = planImageEditGroups(sources(9), 9, 1024);
    expect(returnedCellRect(group.cells[4], 1536, 1536)).toEqual({ x: 512, y: 512, w: 512, h: 512 });
    expect(returnedCellRect(group.cells[8], 1536, 1536)).toEqual({ x: 1024, y: 1024, w: 512, h: 512 });
    expect(() => returnedCellRect(group.cells[4], 1536, 1024)).toThrow(/square/i);
  });

  it("shows the effective thin-line and fixed-grid instruction without local paths", () => {
    const prompt = compositeEditPrompt("Make each stroke thin.", 3, 5);
    expect(prompt).toContain("Make each stroke thin.");
    expect(prompt).toMatch(/3.?×.?3|3.?x.?3/i);
    expect(prompt).toMatch(/same (?:cell|position)|positions/i);
    expect(prompt).toMatch(/empty|blank/i);
  });
});
