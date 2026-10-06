// pairfile.ts — the pair file as a fixture (RULE 8): identity, both image faces,
// the pair's decision and its SVG versions in ONE shape. The SVG-tab suites add
// a scan row's extra fields on top (helpers/svgpair), the Selection suites use
// this directly, and both describe the same file a write would produce.
import { newPairMeta, sideOf, withDecision, withVersion, type PairMeta } from "../../src/lib/pairmeta";
import { withPreferred } from "../../src/lib/pairpreferred";
import { pairId } from "../../src/lib/pairing";
import { parseAiName } from "../../src/lib/naming";
import type { Decision } from "../../src/lib/reviewfilter";
import type { SvgVersion } from "../../src/lib/svgmodel";

/** The moment every fixture pretends the decision was taken. */
export const ISO = "2026-10-01T09:00:00.000Z";

export interface FileOpts {
  /** The stable pair id, when the case needs one that is not derived. */
  id?: string;
  /** null = nobody ever decided (a file that carries versions only). */
  decision?: Decision | null;
  reviewedAt?: string;
  versions?: readonly SvgVersion[];
  /** The version the user chose to show (I-54); null/absent = the newest one. */
  preferred?: number | null;
  /** File name of the reference image; null when the pair has only the AI face. */
  sourceName?: string | null;
}

/** The pair file for `<dirPath>/<aiName>`. */
export function pairFile(dirPath: string, aiName: string, o: FileOpts = {}): PairMeta {
  const parsed = parseAiName(aiName);
  const base = parsed?.base ?? aiName.replace(/\.png$/i, "");
  const suffix = parsed?.suffix ?? "";
  const sourceName = o.sourceName === undefined ? `${base}.png` : o.sourceName;
  const at = (relPath: string): string => (dirPath === "" ? relPath : `${dirPath}/${relPath}`);
  const decision = o.decision === undefined ? "approved" : o.decision;
  const written = newPairMeta({
    id: o.id ?? pairId(dirPath, base, suffix),
    base,
    suffix,
    dirPath,
    ai: sideOf(at(aiName), "20:3100"),
    source: sourceName === null ? null : sideOf(at(sourceName), "12:2100"),
  });
  // null keeps "nobody ever decided" — the file a legacy migration reads (I-42)
  const decided = decision === null ? written : withDecision(written, decision, o.reviewedAt ?? ISO);
  const chosen = o.preferred === undefined || o.preferred === null ? decided : withPreferred(decided, o.preferred);
  return (o.versions ?? []).reduce((meta, v) => withVersion(meta, v), chosen);
}
