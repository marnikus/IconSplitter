// SvgConfirm.tsx — the confirmation that must precede any send (prompt §2/§3/
// §16): the current local prompt, the selected count, the REQUEST count at
// the size the USER configured (the reasoning level never shrinks it —
// 2026-10-05), the provider and sampling facts, and one page per batch with
// that page's own contact sheet, its ordered `position — name`
// manifest and its empty cells. Opening it sends nothing; every page's
// composite is built in memory when the page is first shown and cached for the
// dialog's lifetime. A plan that cannot be mapped is refused here (RULE 15).

import { useEffect, useMemo, useState } from "react";
import { planBatches, validateBatchPlan, type BatchPlan } from "../lib/svgbatch";
import { compositeSheetKey } from "../lib/svgcomposite";
import { inIdOrder } from "../lib/selectionorder";
import { stallLabel, stallNote } from "../lib/effortlimits";
import { clampImagesPerRequest } from "../lib/svgconfig";
import { paramsLabel, type ModelCaps, type SamplingParams } from "../lib/modelcaps";
import type { SvgConfig } from "../lib/svgconfig";
import type { DirHandleLike } from "../lib/fs";
import { buildComposite, type BuiltComposite } from "./composite";
import { toBatchSource, type SvgSource } from "./sources";
import type { SvgOperation, SvgRow } from "./types";

export interface SvgConfirmProps {
  ids: string[];
  operation: SvgOperation;
  rows: SvgRow[];
  config: SvgConfig;
  prompt: string;
  caps: ModelCaps;
  params: SamplingParams;
  rootRef: { current: DirHandleLike | null };
  /** A request is in flight: confirming ADDS this batch to the queue (I-53). */
  running: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export default function SvgConfirm(p: SvgConfirmProps) {
  const plan = useConfirmPlan(p);
  return (
    <div className="svg-backdrop" data-testid="svg-confirm">
      <section className="svg-modal wide" role="dialog" aria-modal="true" aria-labelledby="svg-confirm-title">
        <header className="svg-modal-head">
          <h2 id="svg-confirm-title" data-testid="svg-confirm-title">
            Confirm SVG {p.operation === "regenerate" ? "regeneration" : "generation"}
          </h2>
          <button type="button" className="svg-btn" data-testid="svg-confirm-close" onClick={p.onDismiss}>Close</button>
        </header>
        <div className="svg-modal-body">
          {p.running && (
            <p className="svg-note" data-testid="svg-confirm-queue-note">
              A run is in flight — confirming adds these {plan.picked.length} image(s) to the queue.
              The run in flight is not interrupted, and nothing waits for the queue to be noticed.
            </p>
          )}
          <Facts plan={plan} p={p} />
          <PlanBody plan={plan} p={p} />
          <PromptPreview prompt={p.prompt} />
          <PolicyNote />
          <Actions plan={plan} p={p} />
        </div>
      </section>
    </div>
  );
}

interface ConfirmPlan {
  picked: SvgRow[];
  perRequest: number;
  plans: BatchPlan[];
  problems: string[];
  page: number;
  cache: Map<string, BuiltComposite>;
  active: BatchPlan | null;
  setPage: (page: number) => void;
}

/** The whole split, computed once per dialog — the runner uses the same maths. */
function useConfirmPlan(p: SvgConfirmProps): ConfirmPlan {
  // The pick order, never the row order: the sheet below is drawn in it, and the
  // runner plans from the same order (lib/selectionorder) — so the picture the
  // user approves is the picture the request carries.
  const picked = useMemo(() => inIdOrder(p.rows, p.ids, (r) => r.source.id), [p.rows, p.ids]);
  const perRequest = clampImagesPerRequest(p.config.imagesPerRequest);
  const plans = useMemo(() => planBatches(picked.map((r) => toBatchSource(r.source)), perRequest), [picked, perRequest]);
  const problems = validateBatchPlan(plans, perRequest);
  const [page, setPage] = useState(0);
  const cache = useMemo(() => new Map<string, BuiltComposite>(), []);
  const active = plans[Math.min(page, Math.max(0, plans.length - 1))] ?? null;
  return { picked, perRequest, plans, problems, page, cache, active, setPage };
}

/** The refusal when the plan cannot be mapped, or the page in view. */
function PlanBody({ plan, p }: { plan: ConfirmPlan; p: SvgConfirmProps }) {
  if (plan.problems.length > 0) {
    return <p className="svg-note error" data-testid="svg-confirm-problem">{plan.problems[0]} — nothing will be sent.</p>;
  }
  if (plan.active === null) return null;
  return <BatchPager plan={plan.active} page={plan.page} pages={plan.plans.length}
    picked={plan.picked} rootRef={p.rootRef} cache={plan.cache} onPage={plan.setPage} />;
}

function Actions({ plan, p }: { plan: ConfirmPlan; p: SvgConfirmProps }) {
  return (
    <div className="svg-modal-actions">
      <button type="button" className="svg-btn" data-testid="svg-confirm-cancel" onClick={p.onDismiss}>Cancel</button>
      <button type="button" className="svg-btn primary" data-testid="svg-confirm-generate"
        disabled={plan.problems.length > 0 || plan.active === null} onClick={p.onConfirm}>
        {p.running ? "Add to queue" : p.operation === "regenerate" ? "Regenerate now" : "Generate now"}
      </button>
    </div>
  );
}

/** The facts a confirmation must state before anything is sent. */
function Facts({ plan, p }: { plan: ConfirmPlan; p: SvgConfirmProps }) {
  const note = stallNote(p.config.timeoutMs, p.caps, p.params);
  return (
    <div className="svg-facts">
      <Fact label="Selected images" value={String(plan.picked.length)} testid="svg-confirm-count" />
      <Fact label="Requests" value={`${plan.plans.length} × ${plan.perRequest} max`} testid="svg-confirm-requests" />
      <Fact label="Provider / model" value={p.config.model} testid="svg-confirm-model" />
      <Fact label="Model settings" value={paramsLabel(p.caps, p.params)} testid="svg-confirm-sampling" />
      <Fact label="Stall window" value={stallLabel(p.config.timeoutMs, p.caps, p.params)} testid="svg-confirm-timeout" />
      <Fact label="Streaming" value="on — a live request is never cut, however long it runs" testid="svg-confirm-streaming" />
      {note !== null && <p className="svg-note warn" data-testid="svg-confirm-limit">{note}</p>}
    </div>
  );
}

function Fact({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="svg-fact">
      <span>{label}</span>
      <strong data-testid={testid}>{value}</strong>
    </div>
  );
}

interface PagerProps {
  plan: BatchPlan;
  page: number;
  pages: number;
  picked: SvgRow[];
  rootRef: { current: DirHandleLike | null };
  cache: Map<string, BuiltComposite>;
  onPage: (page: number) => void;
}

/** One page = one request: its grid, its ordered filenames, its composite. */
function BatchPager({ plan, page, pages, picked, rootRef, cache, onPage }: PagerProps) {
  const sources = useMemo(() => inIdOrder(picked, plan.items.map((i) => i.sourceId), (r) => r.source.id)
    .map((r) => r.source), [plan, picked]);
  const composite = usePageComposite(rootRef, plan.id, sources, cache);
  return (
    <div className="svg-batch-pager" data-testid="svg-composite">
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
      <ol className="svg-batch-items" data-testid="svg-batch-items">
        {plan.items.map((item) => <li key={item.position}><span>{item.position} — {item.name}</span></li>)}
      </ol>
      <Composite state={composite} />
    </div>
  );
}

interface CompositeState {
  built: BuiltComposite | null;
  error: string | null;
}

/**
 * Builds the page's contact sheet once, in memory, and remembers it — under the
 * sheet's OWN identity (page label + every source with its fingerprint), so a
 * dialog re-planned for another selection can never show the earlier sheet.
 */
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

function PromptPreview({ prompt }: { prompt: string }) {
  return (
    <section className="svg-confirm-prompt" aria-label="Current generation prompt">
      <div className="svg-field-label">Current generation prompt · sent with every request</div>
      <pre data-testid="svg-confirm-prompt">{prompt}</pre>
    </section>
  );
}

function PolicyNote() {
  return (
    <p className="svg-note">
      The saved local prompt is sent with every request, streamed so the connection cannot be cut for
      being idle. Existing SVG versions are never overwritten — each result is saved as the next
      version. A rate limit reports its retry-after delay; a request that goes silent for the whole
      stall window is reported as outcome unknown with its request id and is never resent, because a
      resend could be a duplicate charge. The batch size above is exactly what you configured.
    </p>
  );
}
