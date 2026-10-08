// types.ts — the EPS converter contract (2026-10-09, design
// docs/archive/2026-10-09-eps-converters-inkscape-expand/design.md D1): one
// interface every converter implements, so the drop list, the EPS stage and
// the export record read ONE table (registry.ts) and never ask "which one".

export type EpsConverterId = "builtin" | "inkscape";

/** What a conversion needs — the prepared SVG text and the flatten colour (RULE 3: explicit inputs). */
export interface EpsConvertInput {
  svg: string;
  background: string;
  title: string;
  createdAt?: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** What a converter may reach: the helper's URL and the fetch it uses (a fake in tests). */
export interface ConverterDeps {
  bridgeUrl: string;
  fetch: FetchLike;
}

/** Usable right now? A failure names the reason AND the fix — the UI shows both (RULE 4). */
export type ConverterState =
  | { ok: true; version: string }
  | { ok: false; reason: string; fix: string };

/** `writer` names the exact tool for the record (RULE 22); `fixes` are automatic adjustments, said, never asked. */
export type ConvertResult =
  | { ok: true; eps: string; writer: string; fixes: string[] }
  | { ok: false; reason: string; fix?: string };

export interface EpsConverter {
  id: EpsConverterId;
  label: string;
  probe(deps: ConverterDeps): Promise<ConverterState>;
  convert(input: EpsConvertInput, deps: ConverterDeps, signal?: AbortSignal): Promise<ConvertResult>;
}

/** The one line a failed result shows: the reason, then the fix when there is one. */
export function describeFailure(r: { reason: string; fix?: string }): string {
  return r.fix === undefined ? r.reason : `${r.reason} — ${r.fix}`;
}
