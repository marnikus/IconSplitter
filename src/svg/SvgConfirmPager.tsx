// SvgConfirmPager.tsx — one page = one request: grid, filenames, composite.
// Extracted from SvgConfirm to keep RULE 18 file size (2026-10-09).

import { useEffect, useMemo, useState } from "react";
import { compositeSheetKey } from "../lib/svgcomposite";
import { inIdOrder } from "../lib/selectionorder";
import type { BatchPlan } from "../lib/svgbatch";
import type { DirHandleLike } from "../lib/fs";
import { buildComposite, type BuiltComposite } from "./composite";
import type { SvgSource } from "./sources";
import type { SvgRow } from "./types";

interface PagerProps {
  plan: BatchPlan;
  page: number;
  pages: number;
  picked: SvgRow[];
  rootRef: { current: DirHandleLike | null };
  cache: Map<string, BuiltComposite>;
  onPage: (page: number) => void;
}

export function BatchPager({ plan, page, pages, picked, rootRef, cache, onPage }: PagerProps) {
  const sources = useMemo(() => inIdOrder(picked, plan.items.map((i) => i.sourceId), (r) => r.source.id)
    .map((r) => r.source), [plan, picked]);
  const composite = usePageComposite(rootRef, plan.id, sources, cache);
  return (
    <div className="svg-batch-pager" data-testid="svg-composite">
      <PagerHead plan={plan} page={page} pages={pages} onPage={onPage} />
      <ol className="svg-batch-items" data-testid="svg-batch-items">
        {plan.items.map((item) => <li key={item.position}><span>{item.position} — {item.name}</span></li>)}
      </ol>
      <Composite state={composite} />
    </div>
  );
}

function PagerHead({ plan, page, pages, onPage }: { plan: BatchPlan; page: number; pages: number; onPage: (p: number) => void }) {
  return (
    <>
      <div className="svg-field-label">
        <span data-testid="svg-batch-page">{plan.id} · Request {page + 1} of {pages}</span>
        <span className="svg-pager-buttons">
          <button type="button" className="svg-btn tiny" data-testid="svg-batch-prev" disabled={page === 0}
            onClick={() => onPage(page - 1)}>← Previous</button>
          <button type="button" className="svg-btn tiny" data-testid="svg-batch-next" disabled={page >= pages - 1}
            onClick={() => onPage(page + 1)}>Next →</button>
        </span>
      </div>
      <div className="svg-batch-shape">
        <span data-testid="svg-batch-grid">{plan.cols}×{plan.rows} grid · {plan.items.length} image(s)</span>
        <span data-testid="svg-batch-empty">{plan.emptyCells} empty cell(s)</span>
      </div>
    </>
  );
}

interface CompositeState {
  built: BuiltComposite | null;
  error: string | null;
}

function usePageComposite(
  rootRef: { current: DirHandleLike | null },
  planId: string,
  sources: readonly SvgSource[],
  cache: Map<string, BuiltComposite>,
): CompositeState {
  const key = compositeSheetKey(planId, sources.map((s) => ({ id: s.id, fingerprint: s.fingerprint })));
  const [state, setState] = useState<CompositeState>(() => ({ built: cache.get(key) ?? null, error: null }));
  useEffect(() => {
    const hit = cache.get(key);
    if (hit) return setState({ built: hit, error: null });
    const root = rootRef.current;
    if (root === null) return setState({ built: null, error: "Pick the source folder first" });
    let live = true;
    setState({ built: null, error: null });
    void buildComposite(root, sources).then(
      (built) => { if (live) { cache.set(key, built); setState({ built, error: null }); } },
      (error: unknown) => { if (live) setState({ built: null, error: reason(error) }); },
    );
    return () => { live = false; };
  }, [rootRef, key, sources, cache]);
  return state;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "the contact sheet could not be built — no request was sent";
}

function Composite({ state }: { state: CompositeState }) {
  if (state.error !== null) return <p className="svg-note error" data-testid="svg-composite-error">{state.error}</p>;
  if (state.built === null) return <p className="svg-note" data-testid="svg-composite-building">Building the contact sheet… (memory only — never written into your SVG output folder)</p>;
  return (
    <>
      <img className="svg-composite-img" data-testid="svg-composite-img" src={state.built.dataUrl}
        alt="Contact sheet sent with this request" />
      <p className="svg-note" data-testid="svg-composite-meta">
        {state.built.layout.cols}×{state.built.layout.rows} grid · {state.built.layout.size}px ·{" "}
        {state.built.layout.empty.length} empty cell(s) · hash {state.built.hash.slice(0, 12)}
      </p>
    </>
  );
}
