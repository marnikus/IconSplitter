// useConfirmRun.ts — what the confirmation shows is DERIVED, never stored
// (RULE 24): the PreparedRun is recomputed from the live selection, settings
// and rules, so the user always reads the request that "Generate now" sends. A
// catalog refresh or an edit on the tab behind the dialog re-derives it; only
// the pager position is state, and it clamps if the selection shrinks.

import { useMemo, useState } from "react";
import type { ModelCaps, SamplingParams } from "../../lib/modelcaps";
import type { SvgConfig } from "../../lib/svgconfig";
import { prepareRun, type PreparedBatch, type PreparedRun } from "../../lib/svgpayload";
import { toBatchSource } from "../sources";
import type { SvgRow } from "../types";

export interface ConfirmInput {
  ids: string[];
  rows: SvgRow[];
  config: SvgConfig;
  caps: ModelCaps;
  params: SamplingParams;
  prompt: string;
}

export interface ConfirmRun {
  prepared: PreparedRun;
  /** The pager position, already clamped into the requests there are. */
  index: number;
  /** The request on screen; null only when nothing is selected any more. */
  shown: PreparedBatch | null;
  setIndex: (index: number) => void;
}

export function useConfirmRun(a: ConfirmInput): ConfirmRun {
  const { ids, rows, config, caps, params, prompt } = a;
  const prepared = useMemo(() => {
    const sources = rows.filter((r) => ids.includes(r.source.id)).map((r) => toBatchSource(r.source));
    return prepareRun({ sources, config, caps, params, rules: prompt });
  }, [ids, rows, config, caps, params, prompt]);
  const [wanted, setIndex] = useState(0);
  const index = Math.min(wanted, Math.max(0, prepared.batches.length - 1));
  return { prepared, index, shown: prepared.batches[index] ?? null, setIndex };
}
