// discovery.ts — the builder's all-folder approved asset discovery. It reuses
// the upload tab's improved parallel walk, pair cache, preferred-version gate
// and audit, but turns OFF split-scope hiding and ignores its own output folder.
import type { DirHandleLike } from "../lib/fs";
import { assetsFromRows } from "../lib/svgBuilder/assets";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";
import {
  discoverUploadSources, type UploadDiscovery, type UploadExclusion, type UploadRowSource,
} from "../upload/discovery";

export const BUILDER_IGNORE = ["export", "svg-builder"] as const;

export interface BuilderDiscovery {
  assets: readonly BuilderIconAsset[];
  rows: readonly UploadRowSource[];
  excluded: readonly UploadExclusion[];
  audit: UploadDiscovery["audit"];
  corruptFiles: readonly string[];
  unreadable: UploadDiscovery["unreadable"];
}

export async function discoverBuilderAssets(root: DirHandleLike): Promise<BuilderDiscovery> {
  const found = await discoverUploadSources(root, { hideOutside: false, ignoreDirs: BUILDER_IGNORE });
  return {
    assets: assetsFromRows(found.rows), rows: found.rows, excluded: found.excluded,
    audit: found.audit, corruptFiles: found.corruptFiles, unreadable: found.unreadable,
  };
}

export function builderAuditLine(found: BuilderDiscovery): string {
  return `${found.assets.length} approved SVG asset(s) · ${found.audit.svgFiles} SVG file(s) · `
    + `${found.excluded.length} pair(s) not listed · ${found.corruptFiles.length} corrupt pair file(s)`;
}
