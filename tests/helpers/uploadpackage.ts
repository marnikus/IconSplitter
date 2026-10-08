// uploadpackage.ts — a committed upload package on a fake folder (shared by the
// panel tests, 2026-10-08): the artifacts under their names + the export.json
// naming them. One pair per folder — two pairs in one folder would share the
// record.
import { pairId } from "../../src/lib/pairing";
import { exportDirOf, newExportRecord, serializeExportRecord } from "../../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS, settingsFingerprint } from "../../src/lib/upload/settings";
import { BinDir, BinFile } from "./binfakefs";

export type PackageKind = "svg" | "jpg" | "eps";

export const PACKAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;
export const PACKAGE_JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
export const PACKAGE_EPS = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 24 24\n";

export interface CommitPackageArgs {
  dir: BinDir;
  dirPath: string;
  name: string;
  kinds: PackageKind[];
  /** What the EPS writer adjusted on its own (record.tools.eps.fixes). */
  epsFixes?: string[];
  /** The source hash the record claims; pass the real one for a row that must read "processed", not "stale". */
  fingerprint?: string;
}

/** A committed package on disk for `name` in its own pair folder. */
export function commitPackage(a: CommitPackageArgs): void {
  const exp = new BinDir("export");
  a.dir.children.set("export", exp);
  const content = { svg: PACKAGE_SVG, jpg: PACKAGE_JPG, eps: PACKAGE_EPS } as const;
  for (const k of a.kinds) exp.children.set(`${a.name}.${k}`, new BinFile(`${a.name}.${k}`, content[k], 5000));
  const record = newExportRecord({
    pair: { id: pairId(a.dirPath, a.name, ""), base: a.name, suffix: "", dir: a.dirPath },
    source: { svgPath: `${a.dirPath}/${a.name}_AI.svg`, version: 1, approval: "approved", fingerprint: a.fingerprint ?? "sha256:src" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: settingsFingerprint(DEFAULT_UPLOAD_SETTINGS) },
    svgo: { enabled: false, version: "", config: "", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" },
    epsEnabled: a.kinds.includes("eps"),
  });
  const out = (k: string) => ({ path: `${exportDirOf(a.dirPath)}/${a.name}.${k}`, bytes: 1, hash: "sha256:x" });
  record.outputs = { svg: a.kinds.includes("svg") ? out("svg") : null, jpg: a.kinds.includes("jpg") ? out("jpg") : null, eps: a.kinds.includes("eps") ? out("eps") : null };
  if (a.epsFixes !== undefined) record.tools.eps = { ...record.tools.eps, fixes: a.epsFixes };
  record.stage = "committed";
  record.status = "processed";
  exp.children.set("export.json", new BinFile("export.json", serializeExportRecord(record), 5001));
}
