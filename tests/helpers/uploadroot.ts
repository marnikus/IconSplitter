// uploadroot.ts — the "SVG to upload" fixture in ONE place (RULE 8): approved
// pairs, each with one valid generated SVG on disk and its pair file beside it.
import { serializePairMeta } from "../../src/lib/pairmeta";
import { pairId } from "../../src/lib/pairing";
import { BinDir, BinFile } from "./binfakefs";
import { pairFile } from "./pairfile";
import { svgVersion } from "./svgpair";

/** The accepted artwork the fixtures hold; the preview never alters it. */
export const SAVED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

/** The stable pair id of `<dir>/<name>_AI.png`, the same id the scan reports. */
export function uploadPairId(dir: string, name: string): string {
  return pairId(dir, name, "");
}

/** `<dir>/<name>_AI.png` + `_AI.svg` + an approved pair file with one valid version. */
function approvedPair(dir: BinDir, folder: string, name: string): void {
  const stem = `${name}_AI`;
  const meta = pairFile(folder, `${stem}.png`, {
    versions: [svgVersion(`${folder}/${stem}.svg`, { version: 1, review: "approved" })],
  });
  dir.children.set(`${stem}.svg.json`, new BinFile(`${stem}.svg.json`, serializePairMeta(meta), 3300));
  dir.children.set(`${stem}.png`, new BinFile(`${stem}.png`, "ai", 3100));
  dir.children.set(`${stem}.svg`, new BinFile(`${stem}.svg`, SAVED_SVG, 3400));
}

/**
 * A root whose `folder` holds one approved pair per name. With no names the
 * folder exists but nothing in it is listable — the "scan found nothing" case.
 */
export function approvedUploadRoot(folder = "architecture", names: readonly string[] = ["fog", "arch"]): BinDir {
  const root = new BinDir("split_root");
  const dir = new BinDir(folder);
  for (const name of names) approvedPair(dir, folder, name);
  root.children.set(folder, dir);
  return root;
}
