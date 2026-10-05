// svgpair.ts — fixtures for the per-pair model (RULE 8).
// Every SVG-tab suite now speaks PairMeta, so the shapes are built in ONE place:
// a source row as a scan would produce it, the pair file beside it, and the
// version records inside that file. A suite states only what its case is about.
import { pairId } from "../../src/lib/pairing";
import { parseAiName } from "../../src/lib/naming";
import { NO_COST, type SvgVersion } from "../../src/lib/svgmodel";
import type { PairMeta } from "../../src/lib/pairmeta";
import type { SvgSource } from "../../src/svg/sources";
import { ISO, pairFile } from "./pairfile";

export interface SrcOpts {
  /** Folder the pair lives in, relative to the root. */
  dir?: string;
  /** AI image file name (`<base>_AI<suffix>.png`). */
  name?: string;
  /** The reference image beside it; null when the pair has only the AI face. */
  sourceName?: string | null;
  fingerprint?: string;
  problems?: SvgSource["problems"];
}

/** A scanned row, exactly as svg/sources builds it for an approved pair. */
export function svgSource(id: string, o: SrcOpts = {}): SvgSource {
  const dir = o.dir ?? "architecture";
  const name = o.name ?? `${id}_AI.png`;
  const stem = name.replace(/\.png$/i, "");
  const sourceName = o.sourceName === undefined ? `${stem.replace(/_AI$/, "")}.png` : o.sourceName;
  const parsed = parseAiName(name); // the same parse the scan uses — never a second guess
  const base = parsed?.base ?? stem;
  const suffix = parsed?.suffix ?? "";
  return {
    id: id || pairId(dir, base, suffix),
    name,
    stem,
    relPath: `${dir}/${name}`,
    dirPath: dir,
    fingerprint: o.fingerprint ?? "20:3100",
    problems: o.problems ?? [],
    metaPath: `${dir}/${stem}.svg.json`,
    base,
    suffix,
    sourcePath: sourceName === null ? null : `${dir}/${sourceName}`,
    sourceFingerprint: sourceName === null ? null : "20:2100",
  };
}

/** The pair file that belongs to a source row, with the versions given. */
export function pairMetaFor(source: SvgSource, versions: readonly SvgVersion[] = [], decision: PairMeta["decision"] = "approved"): PairMeta {
  return pairFile(source.dirPath, source.name, {
    id: source.id, decision, versions, sourceName: source.sourcePath === null ? null : source.sourcePath.split("/").pop(),
  });
}

/** The moment every fixture pretends the decision was taken. */
export { ISO };

export interface VerOpts {
  version?: number;
  status?: SvgVersion["status"];
  review?: SvgVersion["review"];
  model?: string;
  usage?: SvgVersion["usage"];
  cost?: SvgVersion["cost"];
  icons?: number;
  error?: string | null;
  requestId?: string | null;
}

/** One version record, with the fields every consumer reads filled in. */
export function svgVersion(svgPath: string, o: VerOpts = {}): SvgVersion {
  const version = o.version ?? 1;
  return {
    version,
    svgPath,
    status: o.status ?? "generated",
    review: o.review ?? "pending",
    prompt: "p",
    provider: "Requesty",
    model: o.model ?? "m",
    requestedAt: ISO,
    completedAt: ISO,
    usage: o.usage ?? { input: 1, output: 2, total: 3 },
    cost: o.cost ?? NO_COST,
    validation: { ok: true, errors: [], warnings: [], icons: o.icons ?? 1 },
    batch: null,
    error: o.error ?? null,
    requestId: o.requestId ?? null,
  };
}

/** The canonical version path a source's N-th SVG would have. */
export function svgPathFor(source: SvgSource, version: number): string {
  return `${source.dirPath}/${source.stem}_v${version}.svg`;
}
