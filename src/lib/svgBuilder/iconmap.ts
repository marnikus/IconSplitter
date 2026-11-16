// iconmap.ts — `icon-map.json`: every approved icon that has an Icon Name,
// mapped to its id, folder and files (2026-11-13). Written in the scanned root
// after each scan so an AI (or a person) can find an icon by name or id, open
// its folder, see its preview and reach its SVG, pair sidecar, export record,
// similarity index and usage count. Pure: the writer lives in iconmapstore.ts.
import { joinPath } from "../rootpath";
import { indexPathOf } from "../iconIndex/record";
import { usagePathOf } from "./usage";
import type { BuilderIconAsset } from "./types";

export const ICON_MAP_FILE = "icon-map.json";
export const ICON_MAP_FORMAT = "iconsplitter-icon-map";

export interface IconMapEntry {
  name: string;
  id: string;
  title: string | null;
  /** The pair's folder, relative to the scanned root ("/"-separated). */
  folder: string;
  /** The same folder as a full path, when the root's full path is known. */
  folderPath: string | null;
  files: { svg: string; svgJson: string; preview: string | null; exportJson: string; index: string; usage: string };
}

export interface IconMap {
  format: typeof ICON_MAP_FORMAT;
  version: 1;
  root: string | null;
  count: number;
  icons: IconMapEntry[];
}

function folderOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
}

function entryOf(asset: BuilderIconAsset, rootPath: string): IconMapEntry {
  const folder = folderOf(asset.svgPath);
  return {
    name: asset.name ?? "", id: asset.id, title: asset.title ?? null, folder,
    folderPath: rootPath === "" ? null : joinPath(rootPath, folder.split("/")),
    files: {
      svg: asset.svgPath, svgJson: asset.metaPath, preview: asset.aiPath ?? null,
      exportJson: `${folder === "" ? "" : `${folder}/`}export/export.json`,
      index: indexPathOf(asset.svgPath), usage: usagePathOf(asset.svgPath),
    },
  };
}

/** Code-point order: the same file on every machine and locale. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The map of every named icon, sorted by name then id (a stable file between scans). */
export function iconMapOf(assets: readonly BuilderIconAsset[], rootPath: string): IconMap {
  const icons = assets.filter((a) => typeof a.name === "string" && a.name !== "").map((a) => entryOf(a, rootPath))
    .sort((a, b) => byText(a.name, b.name) || byText(a.id, b.id));
  return { format: ICON_MAP_FORMAT, version: 1, root: rootPath === "" ? null : rootPath, count: icons.length, icons };
}

export function iconMapText(map: IconMap): string {
  return `${JSON.stringify(map, null, 2)}\n`;
}

/** The map file's full path for the folder bar ("" root path → the bare file name). */
export function iconMapPath(rootPath: string): string {
  return rootPath === "" ? ICON_MAP_FILE : joinPath(rootPath, [ICON_MAP_FILE]);
}
