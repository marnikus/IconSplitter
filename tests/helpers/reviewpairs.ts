// Shared ReviewPair/ViewPair factories for the Selection V2 tests (RULE 8).
// Keeps the new suites honest about *what* they build instead of repeating
// the same literal in four files.
import type { ReviewPair } from "../../src/lib/pairing";
import type { ViewPair } from "../../src/lib/reviewfilter";

export interface PairOpts {
  dir?: string;
  created?: number;
  generated?: number | null;
  noSource?: boolean;
  noAi?: boolean;
}

export function reviewPair(id: string, o: PairOpts = {}): ReviewPair {
  const dir = o.dir ?? "a";
  const created = o.created ?? 1000;
  const generated = o.generated === undefined ? created + 1 : o.generated;
  return {
    pairId: id,
    base: id,
    relDir: dir,
    source: o.noSource ? null : { relPath: `${dir}/${id}.png`, size: 11, mtime: created },
    ai: o.noAi || generated === null ? null : { relPath: `${dir}/${id}_AI.png`, size: 22, mtime: generated },
    created,
    generated,
  };
}

export function viewPair(id: string, o: PairOpts & { decision?: ViewPair["decision"] } = {}): ViewPair {
  return { ...reviewPair(id, o), decision: o.decision ?? "pending", reviewedAt: null };
}
