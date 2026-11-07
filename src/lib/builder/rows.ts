// rows.ts — the library's row model (RULE 3): one approved pair becomes one
// BuilderIcon, and the rail's folder/tag/search filters are pure functions of
// that list. The identity fields (id, svgPath, fingerprint, version) are carried
// verbatim from the scan: a caption may be guessed, an identity may not.
//
// Tag honesty (design §10 Q6): generated metadata wins when it exists; otherwise
// the filename's own words are used and `tagSource` says so, so the UI never
// presents a guess as metadata.

import type { UploadRowSource } from "../../upload/discovery";
import { nameOf, nameTokens } from "./name";

/** One icon the builder may place. Identity is stable across a rescan. */
export interface BuilderIcon {
  /** The pair's stable id (I-10) — never a row index. */
  id: string;
  /** The approved version's SVG path relative to the scanned root. */
  svgPath: string;
  /** Display name: the pair's base with separators opened up. */
  name: string;
  /** The pair's folder ("" at the root) — the coarse category. */
  folder: string;
  /** Search/recipe tokens; may be empty. */
  tags: string[];
  /** Where the tokens came from, so a tooltip can be honest. */
  tagSource: "metadata" | "filename" | "none";
  /** size:mtime fingerprint captured at scan time (the artwork cache key). */
  fingerprint: string;
  /** The approved version number the row shows. */
  version: number;
}

/** The metadata a caller may already hold for one icon (from the tag cache). */
export interface IconMetadataLike {
  title?: string;
  tags: readonly string[];
}

export interface BuilderFilter {
  /** Free text: name, folder or any tag. */
  search: string;
  /** "" = every folder. */
  folder: string;
  /** "" = every tag. */
  tag: string;
}

export const emptyFilter: BuilderFilter = { search: "", folder: "", tag: "" };

/** The approved pair → a library icon, with no metadata applied yet. */
export function baseIcon(row: UploadRowSource): BuilderIcon {
  const named = nameOf(row.base);
  // The displayed name falls back to the file's own name, so the tokens must be
  // built from the name that is actually shown — not from the empty base.
  const name = named === "" ? nameOf(row.svgName.replace(/\.svg$/i, "")) : named;
  const tokens = searchTokensOf(name, row.dirPath);
  return {
    id: row.id,
    svgPath: row.svgPath,
    name,
    folder: row.dirPath,
    tags: tokens,
    tagSource: tokens.length > 0 ? "filename" : "none",
    fingerprint: row.fingerprint,
    version: row.version,
  };
}

/** The approved pair → a library icon, with the caller's cached tags when it has them. */
export function toBuilderIcon(row: UploadRowSource, meta: IconMetadataLike | null): BuilderIcon {
  return withTags(baseIcon(row), meta === null ? null : meta.tags);
}

/**
 * Generated metadata wins over the filename's words when it exists; `tagSource`
 * always says which of the two is showing (Q6: a guess is never called metadata).
 */
export function withTags(icon: BuilderIcon, tags: readonly string[] | null): BuilderIcon {
  if (tags === null || tags.length === 0) return icon;
  return { ...icon, tags: [...tags], tagSource: "metadata" };
}

/**
 * The tokens a nameless pair offers: the folder's own path words and the name's
 * words, each once and in that order (the folder is the coarser signal).
 */
export function searchTokensOf(name: string, folder: string): string[] {
  const words = [...folder.split("/").flatMap((part) => nameTokens(nameOf(part))), ...nameTokens(name)];
  return [...new Set(words)];
}

/** The rail's rows: every filter, one pass, the scan's order preserved. */
export function filterIcons(icons: readonly BuilderIcon[], filter: BuilderFilter): BuilderIcon[] {
  const query = filter.search.trim().toLowerCase();
  return icons.filter((icon) => inFolder(icon, filter.folder) && hasTag(icon, filter.tag) && matchesQuery(icon, query));
}

function inFolder(icon: BuilderIcon, folder: string): boolean {
  return folder === "" || icon.folder === folder;
}

function hasTag(icon: BuilderIcon, tag: string): boolean {
  return tag === "" || icon.tags.includes(tag);
}

/** Free text searches the name, the folder and every tag — nothing else is invented. */
function matchesQuery(icon: BuilderIcon, query: string): boolean {
  if (query === "") return true;
  const fields = [icon.name, icon.folder, ...icon.tags];
  return fields.some((field) => field.toLowerCase().includes(query));
}

export interface IconFacets {
  /** [folder, count] pairs, folder name ascending. */
  folders: [string, number][];
  /** [tag, count] pairs, tag ascending. */
  tags: [string, number][];
}

/** The chip lists: every folder and tag once, sorted, with how many icons carry it. */
export function iconFacets(icons: readonly BuilderIcon[]): IconFacets {
  const folders = new Map<string, number>();
  const tags = new Map<string, number>();
  for (const icon of icons) {
    if (icon.folder !== "") folders.set(icon.folder, (folders.get(icon.folder) ?? 0) + 1);
    for (const tag of new Set(icon.tags)) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }
  return { folders: sorted(folders), tags: sorted(tags) };
}

/** Map → `[key, count]` pairs, key ascending (locale-independent, so a snapshot holds). */
function sorted(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
