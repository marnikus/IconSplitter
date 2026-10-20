// Exact on-disk AI-source regeneration artifacts, not ordinary review sources.
// The image writer records these paths in imageVersions and mainImageOf reads
// them directly; discovery alone must not treat them as new pairs/references.
import { parseAiName } from "./naming";
import type { FileEntry } from "./scan";
import { IMAGE_REGEN_DIR } from "./svgimgreg";

/** Only a direct `<canonical AI stem>_vN.png` in the app's version folder. */
export function isImageRegenArtifact(entry: Pick<FileEntry, "name" | "dirPath">, rootName: string): boolean {
  const parent = entry.dirPath === "" ? rootName : entry.dirPath.split("/").at(-1);
  if (parent?.toLowerCase() !== IMAGE_REGEN_DIR.toLowerCase()) return false;
  const match = /^(.+)_v[1-9]\d*\.png$/i.exec(entry.name);
  return match !== null && parseAiName(`${match[1]}.png`) !== null;
}
