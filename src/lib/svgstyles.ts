// svgstyles.ts — image STYLES of a Generate SVG row (2026-11-16). The base style
// is the row's own line-stroke AI image. A user adds a style as a folder beside
// the row's files, named `_<style>` (`_colored_wiggle`), holding images named
//   <row stem>[_v<N>]_<style>.png          the style's own image (not a variant)
//   <row stem>[_v<N>]_<style>_<NN>.png     its VARIANTS — the only ones registered
// and, later, the style's SVGs `<style stem>.svg` / `_v2.svg`. The style name is
// the LAST suffix of the name and may be several words. Pure: names in, plan out.
import { parseImageVersions, type ImageVersion } from "./svgimgreg";

export const STYLE_ID_SEP = "~";
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** `_colored_wiggle` → `colored_wiggle`; anything else (no leading `_`, or a known non-style folder) → null. */
export function styleOfFolder(folder: string): string | null {
  if (!folder.startsWith("_") || folder.length < 2) return null;
  const style = folder.slice(1);
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(style) ? style : null;
}

/** A row's id in a style (its own pair file, its own selection). */
export const styleRowId = (baseId: string, style: string): string => `${baseId}${STYLE_ID_SEP}${style}`;
/** The base row a (style) row id belongs to. */
export const baseRowId = (id: string): string => id.split(STYLE_ID_SEP)[0];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface StyleFiles {
  /** The style's own image (no variant number), if present. */
  main: string | null;
  /** Variants by number, in order: only `_<NN>` after the style name. */
  variants: Array<{ n: number; name: string }>;
}

/** Sorts a style folder's file names into the style image and its numbered variants. */
export function styleFilesOf(stem: string, style: string, names: readonly string[]): StyleFiles {
  const re = new RegExp(`^${escape(stem)}(?:_v\\d+)?_${escape(style)}(?:_(\\d+))?\\.(?:png|jpe?g|webp)$`, "i");
  let main: string | null = null;
  const variants: Array<{ n: number; name: string }> = [];
  for (const name of names) {
    if (!IMAGE_EXT.test(name)) continue;
    const m = re.exec(name);
    if (m === null) continue;
    if (m[1] === undefined) main = main ?? name;
    else variants.push({ n: Number(m[1]), name });
  }
  variants.sort((a, b) => a.n - b.n);
  return { main, variants };
}

/** The variants as the pair file's image history: version N = variant `_NN` (kept when already there). */
export function variantVersions(dir: string, files: StyleFiles, existing: readonly ImageVersion[], at: string): ImageVersion[] {
  const out = [...existing];
  for (const v of files.variants) {
    const file = dir === "" ? v.name : `${dir}/${v.name}`;
    if (out.some((x) => x.file === file)) continue;
    const version = out.some((x) => x.version === v.n) ? Math.max(0, ...out.map((x) => x.version)) + 1 : v.n;
    out.push(...parseImageVersions([{ version, file, status: "done", prompt: "", model: "", updatedAt: at }]));
  }
  return out.sort((a, b) => a.version - b.version);
}
