// svgstyles.ts — image STYLES of a Generate SVG row (2026-11-16). The base style
// is the row's own line-stroke AI image. A user adds a style as a folder beside
// the row's files, named `_<style>` (`_colored_wiggle`), holding images named
//   <row stem>[_v<N>]_<style>.png          the style's own image (not a variant)
//   <row stem>[_v<N>]_<style>_<NN>.png     its VARIANTS — the only ones registered
// and, later, the style's SVGs `<style stem>.svg` / `_v2.svg`. The style name is
// the LAST suffix of the name and may be several words. Pure: names in, plan out.
import { parseAiName } from "./naming";
import { pairId } from "./pairing";
import { metaPathForAi } from "./pairpath";
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

/** The style's own image name: its unnumbered file, else its first variant's without `_<NN>`. */
export function styleImageName(files: StyleFiles): string | null {
  if (files.main !== null) return files.main;
  const first = files.variants[0]?.name;
  return first === undefined ? null : first.replace(/_\d+(\.[^.]+)$/, "$1");
}

/** The pair file a style row owns: `<base dir>/_<style>/<style image stem>.svg.json`. */
export function styleMetaPathOf(dirPath: string, style: string, files: StyleFiles): string | null {
  const name = styleImageName(files);
  if (name === null) return null;
  const dir = dirPath === "" ? `_${style}` : `${dirPath}/_${style}`;
  return metaPathForAi(`${dir}/${name}`);
}

/** What a pair file's PATH says about the style row it belongs to. */
export interface StyleFileIdentity {
  style: string;
  /** The folder holding the `_<style>` folder — where the base row lives. */
  baseDir: string;
  /** The base row this style row belongs to (`pair_…`, from the AI stem inside the name). */
  baseRowId: string;
  /** The style row's own id: `<base row id>~<style>`. */
  id: string;
}

/** The file name a pair file's style image stem starts from: `<stem>.svg.json`. */
const META_SUFFIX = ".svg.json";

/**
 * The style row a pair file's own PATH names (2026-11-17), so a restart can
 * find a registered style without asking the user to register it again: the
 * registration IS `<base dir>/_<style>/<stem>[_vN]_<style>.svg.json`, and every
 * part of the id is in that path. Null for any file that is not a style record —
 * nothing is guessed, so an ordinary pair file can never be taken for a style.
 */
export function styleFileIdentityOf(metaPath: string): StyleFileIdentity | null {
  if (!metaPath.toLowerCase().endsWith(META_SUFFIX)) return null;
  const at = metaPath.lastIndexOf("/");
  const dir = at < 0 ? "" : metaPath.slice(0, at);
  const file = metaPath.slice(at + 1);
  const foldAt = dir.lastIndexOf("/");
  const style = styleOfFolder(foldAt < 0 ? dir : dir.slice(foldAt + 1));
  if (style === null) return null;
  const stem = file.slice(0, -META_SUFFIX.length);
  const baseStem = stem.endsWith(`_${style}`) ? stem.slice(0, -(style.length + 1)).replace(/_v\d+$/, "") : null;
  const parsed = baseStem === null ? null : parseAiName(`${baseStem}.png`);
  if (parsed === null) return null;
  const baseDir = foldAt < 0 ? "" : dir.slice(0, foldAt);
  const baseRowId = pairId(baseDir, parsed.base, parsed.suffix);
  return { style, baseDir, baseRowId, id: styleRowId(baseRowId, style) };
}
