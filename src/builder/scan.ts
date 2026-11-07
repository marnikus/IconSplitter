// scan.ts — the builder's library: exactly the approved icons of the selected
// root. Behaviour is SVG-to-upload's approved discovery (src/upload/discovery —
// ONE owner of "what counts as approved", the sidecar pairing and the split
// scope); this module only adds what the builder needs on top: the display row,
// the tag cache hook, and its own output folder excluded from the walk so a
// placed sheet is never read back in as artwork.
//
// Nothing here guesses: a pair that is not listed is listed as excluded with
// the reason discovery gave.

import type { DirHandleLike } from "../lib/fs";
import { discoverUploadSources, type UploadDiscovery, type UploadExclusion } from "../upload/discovery";
import { baseIcon, withTags, type BuilderIcon } from "../lib/builder/rows";

/** Folders never walked: discovery's `export/` plus our own output folder. */
export const BUILDER_IGNORE = ["export", "builder"];

/** What the source bar's audit line reports for this root. */
export interface BuilderScope {
  /** Files walked (the whole selected root, recursively). */
  files: number;
  svgFiles: number;
  /** Icons the rail can show. */
  icons: number;
  /** Pairs found but not listed (see `excluded`). */
  excluded: number;
  /** Sidecars that would not parse, and files that would not read. */
  corrupt: number;
  unreadable: number;
}

export interface BuilderLibrary {
  icons: BuilderIcon[];
  excluded: UploadExclusion[];
  scope: BuilderScope;
}

/** The tag cache the caller already holds for one icon (null = nothing cached). */
export interface ScanOptions {
  tagsOf?: (icon: BuilderIcon) => readonly string[] | null;
}

/** The whole selected root, recursively → the icons the builder may place. */
export async function discoverBuilderIcons(root: DirHandleLike, options: ScanOptions = {}): Promise<BuilderLibrary> {
  const found = await discoverUploadSources(root, BUILDER_IGNORE);
  const icons = found.rows.map((row) => {
    const icon = baseIcon(row);
    return withTags(icon, options.tagsOf === undefined ? null : options.tagsOf(icon) ?? null);
  });
  return { icons, excluded: found.excluded, scope: scopeOf(found, icons.length) };
}

function scopeOf(found: UploadDiscovery, icons: number): BuilderScope {
  return {
    files: found.audit.files,
    svgFiles: found.audit.svgFiles,
    icons,
    excluded: found.audit.excluded,
    corrupt: found.corruptFiles.length,
    unreadable: found.unreadable.length,
  };
}
