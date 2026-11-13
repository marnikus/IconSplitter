// iconmapstore.ts — writes `icon-map.json` in the scanned root after each scan
// (2026-11-13). App-owned index data like `<svg>.index.json`: only rewritten
// when its content changed, never touching any icon file.
import { boundRootPathInfo } from "../lib/knownroots";
import { readTextAt, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { ICON_MAP_FILE, iconMapOf, iconMapPath, iconMapText } from "../lib/svgBuilder/iconmap";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";

/** What the folder bar says about the map. */
export interface IconMapState {
  /** The file's full path when the root's path is known, else its name. */
  path: string;
  count: number;
  error: string | null;
}

export async function refreshIconMap(root: DirHandleLike, assets: readonly BuilderIconAsset[]): Promise<IconMapState> {
  const rootPath = boundRootPathInfo(root).path;
  const map = iconMapOf(assets, rootPath);
  const text = iconMapText(map);
  const path = iconMapPath(rootPath);
  try {
    const before = await readTextAt(root, ICON_MAP_FILE).catch(() => null);
    if (before !== text) await writeFileOverwrite(root, ICON_MAP_FILE, new Blob([text], { type: "application/json" }));
    return { path, count: map.count, error: null };
  } catch (err) {
    return { path, count: map.count, error: `icon-map.json could not be written (${(err as Error).message})` };
  }
}
