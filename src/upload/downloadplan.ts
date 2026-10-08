// downloadplan.ts — "Download all" (2026-10-08): the PURE plan of which committed
// package files of the selected icons go into the chosen folder, and under which
// names. No handles and no IO: the adapter (downloadactions.ts) reads and writes.
// Rules: a package is copied whole, under its export names; a name the folder or
// an earlier icon of the batch already holds is numbered AS A WHOLE PACKAGE
// (fog_2.svg + fog_2.jpg), never overwritten (RULE 23); names compare without case,
// because Windows folders do.

import type { OutputRecord } from "../lib/upload/export";

export type PackageKind = "svg" | "jpg" | "eps";
const KINDS: readonly PackageKind[] = ["svg", "jpg", "eps"];

/** One icon as the plan needs it: its committed outputs and whether they are stale. */
export interface DownloadSource {
  id: string;
  base: string;
  outputs: Record<PackageKind, OutputRecord | null>;
  stale: boolean;
}

/** One file to copy: where it is now (root-relative) and what it is called there. */
export interface DownloadFile {
  src: string;
  name: string;
}

export interface DownloadItem {
  id: string;
  base: string;
  stale: boolean;
  /** True when the package had to be numbered to avoid a name already taken. */
  renamed: boolean;
  files: DownloadFile[];
}

export interface DownloadSkip {
  id: string;
  base: string;
  why: string;
}

export interface DownloadPlan {
  items: DownloadItem[];
  skipped: DownloadSkip[];
}

/** The plan for the given icons, in the order given; `taken` are names already in the folder. */
export function planDownload(sources: readonly DownloadSource[], taken: ReadonlySet<string>): DownloadPlan {
  const used = new Set([...taken].map(lower));
  const plan: DownloadPlan = { items: [], skipped: [] };
  for (const s of sources) {
    const parts = committedParts(s);
    if (parts.length === 0) {
      plan.skipped.push({ id: s.id, base: s.base, why: "no export yet" });
      continue;
    }
    const n = firstFreeNumber(parts, used);
    const files = parts.map((p) => ({ src: p.src, name: `${numbered(p.stem, n)}.${p.ext}` }));
    for (const f of files) used.add(lower(f.name));
    plan.items.push({ id: s.id, base: s.base, stale: s.stale, renamed: n > 1, files });
  }
  return plan;
}

/** What one copy-run tells the user, for the toast. */
export interface DownloadTally {
  folder: string;
  files: number;
  icons: number;
  renamed: number;
  skipped: number;
  stale: number;
  missing: number;
  failed: number;
}

/** The toast line: what was written and where, then only the things that happened. */
export function downloadSummary(t: DownloadTally): string {
  const head = `Downloaded ${countOf(t.files, "file")} for ${countOf(t.icons, "icon")} to “${t.folder}”`;
  const notes = [
    t.renamed > 0 && `${t.renamed} renamed (name already taken)`,
    t.skipped > 0 && `${t.skipped} without an export skipped`,
    t.stale > 0 && `${t.stale} stale — re-export for current files`,
    t.missing > 0 && `${countOf(t.missing, "file")} missing on disk`,
    t.failed > 0 && `${countOf(t.failed, "file")} could not be written`,
  ].filter((note): note is string => typeof note === "string");
  return [head, ...notes].join(" · ");
}

interface Part {
  src: string;
  stem: string;
  ext: PackageKind;
}

/** The committed files of one icon, in svg/jpg/eps order. Each keeps its own file name's stem. */
function committedParts(s: DownloadSource): Part[] {
  return KINDS.flatMap((ext) => {
    const o = s.outputs[ext];
    if (o === null) return [];
    const file = o.path.slice(o.path.lastIndexOf("/") + 1);
    return [{ src: o.path, stem: file.slice(0, file.lastIndexOf(".")), ext }];
  });
}

/** The first number n for which NO file of the package is taken; 1 is the plain name. */
function firstFreeNumber(parts: readonly Part[], used: ReadonlySet<string>): number {
  let n = 1;
  while (parts.some((p) => used.has(lower(`${numbered(p.stem, n)}.${p.ext}`)))) n += 1;
  return n;
}

function numbered(stem: string, n: number): string {
  return n === 1 ? stem : `${stem}_${n}`;
}

function lower(s: string): string {
  return s.toLowerCase();
}

function countOf(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
