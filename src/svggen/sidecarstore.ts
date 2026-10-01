// sidecarstore.ts — per-file sidecar IO (design D4): <base>.svg.json beside
// the AI image. Missing = not generated; corrupt = warn, never destructive;
// save = tmp -> read back verify -> overwrite -> delete tmp (RULE 23), same
// shape as reviewstore. Any failure throws; the caller keeps in-memory state
// and offers Retry.

import type { DirHandleLike } from "../lib/fs";
import { tryGetFile, writeFileOverwrite } from "../lib/fs";
import { emptySidecar, parseSidecar, serializeSidecar, type Sidecar } from "../lib/svgsidecar";

export function sidecarNameFor(aiName: string): string {
  return `${aiName.replace(/\.[^.]+$/, "")}.svg.json`;
}

export interface SidecarLoad {
  sidecar: Sidecar;
  missing: boolean;
  corrupt: boolean;
}

export interface LoadArgs {
  dir: DirHandleLike;
  aiName: string;
  sourceId: string;
  sourcePath: string;
  fingerprint: string;
}

export async function loadSidecar(a: LoadArgs): Promise<SidecarLoad> {
  const { dir, aiName, sourceId, sourcePath, fingerprint } = a;
  const fh = await tryGetFile(dir, sidecarNameFor(aiName));
  if (!fh) return { sidecar: emptySidecar(sourceId, sourcePath, fingerprint), missing: true, corrupt: false };
  const parsed = parseSidecar(await (await fh.getFile()).text());
  if (!parsed.ok) return { sidecar: emptySidecar(sourceId, sourcePath, fingerprint), missing: false, corrupt: true };
  return { sidecar: parsed.sidecar, missing: false, corrupt: false };
}

export async function saveSidecar(dir: DirHandleLike, aiName: string, sidecar: Sidecar): Promise<void> {
  const name = sidecarNameFor(aiName);
  const text = serializeSidecar(sidecar);
  const tmp = `${name}.tmp`;
  await writeFileOverwrite(dir, tmp, new Blob([text]));
  const back = await tryGetFile(dir, tmp);
  if (!back || (await (await back.getFile()).text()) !== text) throw new Error("sidecar tmp verify failed");
  await writeFileOverwrite(dir, name, new Blob([text]));
  await dir.removeEntry?.(tmp);
}
