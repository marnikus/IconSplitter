// pairpath.ts — where a pair's file lives and how it is named (I-41/I-42,
// design §2.1). Split from pairmeta.ts (RULE 18 file sizes): pure path math,
// no parsing or transitions — those stay in pairmeta.ts.

import { parseAiName } from "./naming";
import { pairId, type ReviewPair } from "./pairing";
import { svgStem } from "./svgfile";

/** `<AI stem>.svg.json` — the name that has always lived beside the AI image. */
export function metaFileName(aiName: string): string {
  return `${svgStem(aiName)}.svg.json`;
}

/** The same, from an AI image's path relative to the root. */
export function metaPathForAi(aiRelPath: string): string {
  if (aiRelPath === "") return "";
  const at = aiRelPath.lastIndexOf("/");
  const dir = at < 0 ? "" : aiRelPath.slice(0, at);
  const name = metaFileName(baseName(aiRelPath));
  return dir === "" ? name : `${dir}/${name}`;
}

/**
 * Where a pair's file lives, relative to the scanned root. A pair whose AI side
 * is gone is still located by the name that side would have, so the file beside
 * the reference keeps answering for it (design §2.1).
 */
export function metaPathFor(pair: ReviewPair): string {
  if (pair.ai === null && pair.source === null) return ""; // no face: nothing to name it after
  if (pair.ai !== null) return metaPathForAi(pair.ai.relPath);
  const aiName = aiSideName(pair);
  if (aiName === "") return "";
  const fileName = metaFileName(aiName);
  return pair.relDir === "" ? fileName : `${pair.relDir}/${fileName}`;
}

/** The AI image file name a pair without one would have (`fog_AI_9_01.png`). */
export function aiSideName(pair: ReviewPair): string {
  const from = pair.source?.relPath ?? pair.base;
  if (from === "") return ""; // neither face exists: there is no name to build
  return `${pair.base}_AI${pair.suffix}${extOf(from)}`;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : ".png";
}

export function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}

/**
 * The pair id a pair file's path names — so a file that will not parse can still
 * be reported against the pair it belongs to (the extension is not part of the
 * id, so the name alone is enough). "" when the path is not a pair file.
 */
export function pairIdOfMetaPath(relPath: string): string {
  const at = relPath.lastIndexOf("/");
  const dir = at < 0 ? "" : relPath.slice(0, at);
  const file = relPath.slice(at + 1);
  if (!file.toLowerCase().endsWith(".svg.json")) return "";
  const stem = file.slice(0, -".svg.json".length);
  const parsed = parseAiName(`${stem}.png`);
  return parsed === null ? "" : pairId(dir, parsed.base, parsed.suffix);
}
