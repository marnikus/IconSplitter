// audit.ts — the numbers a Generate SVG scan reports, and their wording
// (invariant I-33). Owns: the five-bucket tally over every file the walk saw,
// the `ScanAudit` shape the source bar, the log and the snapshot key share, the
// one-line audit text, and the exclusion summary the banner shows.
// No IO, no React, no pairing: `sourcelist.ts` decides what is listed, this file
// says how many of each there were and how that reads.

import { isImageExt, isVersionArtifact } from "../lib/naming";
import type { FileEntry } from "../lib/scan";
import { isAiArtifact, isCanonicalAi, ext, type SourceExclusion } from "./sourcelist";

/** What the scan found, in the numbers the audit line reports. */
export interface ScanAudit {
  files: number; // every file the walk saw
  aiSources: number; // canonical AI images on disk (eligible naming)
  references: number; // image files that are not AI outputs — never rows
  missing: number; // approved sources whose AI image is not on disk
  duplicates: number; // rows dropped because the same path was already taken
  rows: number; // the final unique list
}

/**
 * Counts the whole tree the list was built from. Five buckets, so no file is
 * counted twice: this app's versioned outputs and its `_AI.svg` files are
 * ignored, canonical raster AI images are sources, and every other image is a
 * reference (never a source, whatever its name).
 */
export function fileTally(entries: readonly FileEntry[]): Pick<ScanAudit, "files" | "aiSources" | "references"> {
  let aiSources = 0;
  let references = 0;
  for (const e of entries) {
    if (isVersionArtifact(e.name) || isAiArtifact(e.name)) continue;
    if (isCanonicalAi(e.name)) aiSources += 1;
    else if (isImageExt(ext(e.name))) references += 1;
  }
  return { files: entries.length, aiSources, references };
}

/** The audit line: the whole picture, one line, so a count is never a mystery. */
export function auditText(a: ScanAudit): string {
  const parts = [
    plural(a.files, "file"), plural(a.aiSources, "AI source"),
    `${plural(a.references, "reference")} excluded`, plural(a.missing, "missing file"),
    `${plural(a.duplicates, "duplicate")} removed`,
  ];
  return `Audit — ${parts.join(" · ")} → ${plural(a.rows, "row")}`;
}

/** Why sources are missing from the list, grouped by kind (banner summary). */
export function exclusionSummary(excluded: readonly SourceExclusion[]): string {
  const parts = KINDS.flatMap(([kind, label]) => {
    const n = excluded.filter((e) => e.kind === kind).length;
    return n === 0 ? [] : [`${n} ${label}`];
  });
  return parts.join(", ");
}

/** One label per exclusion kind, in the order the banner names them. */
const KINDS: [SourceExclusion["kind"], string][] = [
  ["ai-missing", "with no AI image on disk"],
  ["no-files", "with no files left"],
  ["not-ai-output", "with no AI result (reference images)"],
  ["artifact", "with only this app's own SVG output"],
  ["duplicate", "duplicate records"],
];

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
