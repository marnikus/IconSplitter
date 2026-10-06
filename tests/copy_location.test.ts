// Regression: copying a location must retain the sheet and split directories.
import { beforeEach, expect, it, vi } from "vitest";
import { copyFolderText } from "../src/lib/copypath";
import { saveRootPathInfo } from "../src/lib/rootpath";

const BASE = "F:\\Stocks 2026\\icons testing\\single\\test_processing_2";
const TAIL = "_split_output/2026-10/2026-10-05_18-45-20/icon-bunny-face_AI_7/split_04";
const FILE = "icon-bunny-face_AI_7_04_v2.svg";

beforeEach(() => localStorage.clear());

it.each([0, 1, 2, 3, 4, 5])("copies the exact bunny folder with %i path segments in the picked root", async (depth) => {
  const segments = TAIL.split("/");
  const rootPath = [BASE, ...segments.slice(0, depth)].join("\\");
  const rootName = rootPath.split("\\").at(-1)!;
  saveRootPathInfo(rootName, rootPath);
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const say = vi.fn();
  await copyFolderText(rootName, [...segments.slice(depth), FILE].join("/"), say);
  const expected = `${BASE}\\${segments.join("\\")}`;
  expect(writeText).toHaveBeenCalledExactlyOnceWith(expected);
  expect(say).toHaveBeenCalledWith(expect.stringContaining(expected));
});
