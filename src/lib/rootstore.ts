// rootstore.ts — where a captured full path survives a restart: WITH the folder
// handle it was captured for (RULE 13/I-63). The third report (2026-10-09) came
// from a store keyed by FOLDER NAME — every `_split_output` in the user's tree
// shared one memory slot and the row showed another folder's path. Identity
// here is the platform's own (`isSameEntry`); a name match is never enough. A
// record whose path is not a folder path, or whose provenance is not one of
// ours, is corrupt and reads as no memory at all — never a guess.

import { ROOTPATHS_STORE, idbDelete, idbGet, idbPut } from "../batch/store";
import type { DirHandleLike } from "./fs";
import { NO_ROOT_PATH, isFolderPathText, normalizeRootPath, type RootPathInfo } from "./rootpath";

const KEY = "all";
/** How many folders to remember — old records drop off the end. */
const KEEP = 20;

interface RootRecord {
  handle: DirHandleLike;
  path: string;
  how: RootPathInfo["how"];
}

/** Persists (or, with no path, forgets) the folder's captured path. */
export async function persistRootPath(handle: DirHandleLike, info: RootPathInfo): Promise<void> {
  const records = (await loadRecords()).filter((r) => r.handle !== handle);
  const path = normalizeRootPath(info.path);
  if (path !== "" && isFolderPathText(path) && info.how !== null) {
    records.push({ handle, path, how: info.how });
  }
  await idbPut(ROOTPATHS_STORE, KEY, records.slice(-KEEP));
}

/** The path captured FOR this very folder — or `{ "", null }` (never a name's). */
export async function lookupRootPath(handle: DirHandleLike): Promise<RootPathInfo> {
  for (const record of await loadRecords()) {
    if (await isSameFolder(record.handle, handle)) return valid(record);
  }
  return NO_ROOT_PATH;
}

/** Tests and the forget path: no stored record survives this. */
export async function forgetStoredRootPaths(): Promise<void> {
  await idbDelete(ROOTPATHS_STORE, KEY);
}

/** The platform's own folder identity — a restored handle is a fresh object. */
async function isSameFolder(a: DirHandleLike, b: DirHandleLike): Promise<boolean> {
  if (a === b) return true;
  if (typeof a.isSameEntry !== "function") return false;
  try {
    return await a.isSameEntry(b);
  } catch {
    return false; // a lost handle: no record, never a name match
  }
}

/** One record as a truth, or no truth at all (RULE 13: validate on read). */
function valid(record: RootRecord): RootPathInfo {
  const path = normalizeRootPath(record.path);
  if (record.how === null || path === "" || !isFolderPathText(path)) return NO_ROOT_PATH;
  return { path, how: record.how };
}

/** The stored list, validated as a list: anything else is empty. */
async function loadRecords(): Promise<RootRecord[]> {
  const raw = await idbGet<unknown>(ROOTPATHS_STORE, KEY);
  return Array.isArray(raw) ? raw.filter(isRootRecord) : [];
}

function isRootRecord(value: unknown): value is RootRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<RootRecord>;
  return typeof record.path === "string" && "handle" in record
    && (record.how === "copied" || record.how === "derived" || record.how === null);
}
