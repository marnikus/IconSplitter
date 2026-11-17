// Locate saved style pair records, including stems with an optional _vN.
import { probePath, type DirHandleLike } from "../lib/fs";
import { styleFilesOf } from "../lib/svgstyles";
import type { SvgSource } from "./sources";

export async function stylePairPaths(root: DirHandleLike, source: SvgSource, style: string): Promise<string[]> {
  const dir = [source.dirPath, `_${style}`].filter(Boolean).join("/");
  const folder = await probePath(root, dir);
  if (folder === null) return [];
  const names: string[] = [];
  for await (const [name, handle] of folder.entries()) {
    if (handle.kind !== "file" || !name.toLowerCase().endsWith(".svg.json")) continue;
    const imageName = name.slice(0, -".svg.json".length) + ".png";
    if (styleFilesOf(source.stem, style, [imageName]).main !== null) names.push(`${dir}/${name}`);
  }
  return names.sort();
}
