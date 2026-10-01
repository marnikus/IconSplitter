// svgbatch.ts — fold one batch response back onto its sources (batch spec §8).
// Every manifest position gets exactly one outcome; a missing or invalid
// result never shifts its neighbours, and invalid SVG never counts as saved.

import type { MatchOut } from "./svgextract";
import type { SvgBatch } from "./svgmanifest";
import type { SvgValidation } from "./svgvalidate";

export type OutcomeKind = "saved" | "invalid" | "missing" | "unmapped";

export interface ItemOutcome {
  position: number;
  sourceId: string;
  kind: OutcomeKind;
  /** only set when saved; the complete validated SVG */
  svg: string | null;
  validation: SvgValidation | null;
  reasons: string[];
}

export function batchOutcomes(
  batch: SvgBatch,
  match: MatchOut,
  validate: (text: string) => SvgValidation,
): ItemOutcome[] {
  const missing = missingPositions(match);
  return batch.items.map((item) => outcome({ position: item.position, sourceId: item.id }, match, missing, validate));
}

function missingPositions(match: MatchOut): Set<number> {
  return new Set(match.issues.filter((i) => i.kind === "missing").map((i) => i.position));
}

interface ItemRef { position: number; sourceId: string }

function outcome(item: ItemRef, match: MatchOut, missing: Set<number>, validate: (t: string) => SvgValidation): ItemOutcome {
  const text = match.byPosition.get(item.position);
  if (text === undefined) return noResult(item, missing.has(item.position));
  const validation = validate(text);
  if (!validation.ok) return { ...item, kind: "invalid", svg: null, validation, reasons: validation.reasons };
  return { ...item, kind: "saved", svg: text, validation, reasons: [] };
}

function noResult(item: ItemRef, missing: boolean): ItemOutcome {
  const reasons = [missing ? "no svg returned for this position" : "could not map an svg to this position"];
  return { ...item, kind: missing ? "missing" : "unmapped", svg: null, validation: null, reasons };
}

export interface BatchSummary {
  saved: number;
  invalid: number;
  missing: number;
  unmapped: number;
}

export function summarise(list: ItemOutcome[]): BatchSummary {
  const s: BatchSummary = { saved: 0, invalid: 0, missing: 0, unmapped: 0 };
  for (const o of list) s[o.kind]++;
  return s;
}
