// SvgConfirm.tsx — the confirmation that must precede any send (prompt §2/§3/
// §16): the selected count, the REQUEST count at the size the selected
// reasoning level allows, the provider and sampling facts, and one page per
// batch with that page's own contact sheet, its ordered `position — name`
// manifest and its empty cells. Opening it sends nothing; every page's
// composite is built in memory when the page is first shown and cached for the
// dialog's lifetime. A plan that cannot be mapped is refused here (RULE 15).

import { useEffect, useMemo, useState } from "react";
import { batchManifest, planBatches, validateBatchPlan, type BatchPlan } from "../lib/svgbatch";
import { effectivePerRequest, limitNote, timeoutLabel } from "../lib/effortlimits";
import { paramsLabel, type ModelCaps, type SamplingParams } from "../lib/modelcaps";
import { buildPayload } from "../lib/svgpayload";
import { svgFileName } from "../lib/svgfile";
import type { SvgConfig } from "../lib/svgconfig";
import type { DirHandleLike } from "../lib/fs";
import { buildComposite, type BuiltComposite } from "./composite";
import SvgPromptPreview from "./SvgPromptPreview";
import { toBatchSource, type SvgSource } from "./sources";
import type { SvgRow } from "./types";

export interface SvgConfirmProps {
  ids: string[];
  rows: SvgRow[];
  config: SvgConfig;
  caps: ModelCaps;
  params: SamplingParams;
  /** The user's editable prompt — what every request will carry (feature §1). */
  prompt: string;
  rootRef: { current: DirHandleLike | null };
  onConfirm: () => void;
  onDismiss: () => void;
}

export default function SvgConfirm(p: SvgConfirmProps) {
  const plan = useConfirmPlan(p);
  return (
    <div className="svg-backdrop" data-testid="svg-confirm">
      <section className="svg-modal wide" role="dialog" aria-modal="true" aria-labelledby="svg-confirm-title">
        <header className="svg-modal-head">
          <h2 id="svg-confirm-title">Confirm SVG generation</h2>
          <button type="button" className="svg-btn" data-testid="svg-confirm-close" onClick={p.onDismiss}>Close</button>
        </header>
        <div className="svg-modal-body">
          <Facts plan={plan} p={p} />
          <PlanBody plan={plan} p={p} />
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
  const picked = useMemo(() => p.rows.filter((r) => p.ids.includes(r.source.id)), [p.rows, p.ids]);
  const perRequest = effectivePerRequest(p.config.imagesPerRequest, p.caps, p.params);
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
    picked={plan.picked} rootRef={p.rootRef} cache={plan.cache} p={p} onPage={plan.setPage} />;
}

function Actions({ plan, p }: { plan: ConfirmPlan; p: SvgConfirmProps }) {
  return (
    <div className="svg-modal-actions">
      <button type="button" className="svg-btn" data-testid="svg-confirm-cancel" onClick={p.onDismiss}>Cancel</button>
      <button type="button" className="svg-btn primary" data-testid="svg-confirm-generate"
        disabled={plan.problems.length > 0 || plan.active === null} onClick={p.onConfirm}>Generate now</button>
    </div>
  );
}

/** The facts a confirmation must state before anything is sent. */
function Facts({ plan, p }: { plan: ConfirmPlan; p: SvgConfirmProps }) {
  const note = limitNote(p.config.imagesPerRequest, p.caps, p.params);
  return (
    <div className="svg-facts">
      <Fact label="Selected images" value={String(plan.picked.length)} testid="svg-confirm-count" />
      <Fact label="Requests" value={`${plan.plans.length} × ${plan.perRequest} max`} testid="svg-confirm-requests" />
      <Fact label="Provider / model" value={p.config.model} testid="svg-confirm-model" />
      <Fact label="Model settings" value={paramsLabel(p.caps, p.params)} testid="svg-confirm-sampling" />
      <Fact label="Wait per request" value={timeoutLabel(p.config.timeoutMs, p.caps, p.params)} testid="svg-confirm-timeout" />
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
  p: SvgConfirmProps;
  onPage: (page: number) => void;
}

function PagerHead({ plan, page, pages, onPage }: Pick<PagerProps, "plan" | "page" | "pages" | "onPage">) {
  return (
    <div className="svg-field-label">
      <span data-testid="svg-batch-page">{plan.id} · Request {page + 1} of {pages}</span>
      <span className="svg-pager-buttons">
        <button type="button" className="svg-btn tiny" data-testid="svg-batch-prev" disabled={page === 0}
          onClick={() => onPage(page - 1)}>← Previous</button>
        <button type="button" className="svg-btn tiny" data-testid="svg-batch-next" disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}>Next →</button>
      </span>
    </div>
  );
}

function PagerFacts({ plan }: { plan: BatchPlan }) {
  return (
    <div className="svg-batch-shape">
      <span data-testid="svg-batch-grid">{plan.cols}×{plan.rows} grid · {plan.items.length} image(s)</span>
      <span data-testid="svg-batch-empty">{plan.emptyCells} empty cell(s)</span>
    </div>
  );
}

/** The ordered `position — name` manifest: what the model is told to draw. */
function BatchItems({ plan }: { plan: BatchPlan }) {
  return (
    <ol className="svg-batch-items" data-testid="svg-batch-items">
      {plan.items.map((item) => (
        <li key={item.position}>
          <span>{item.position} — {item.name}</span>{" → "}
          <span className="svg-batch-file" data-testid="svg-batch-file">{svgFileName(item.name, 1)}</span>
        </li>
      ))}
    </ol>
  );
}

/** One page = one request: its grid, its ordered filenames, its composite and
    the exact prompt/payload that will be sent for it. */
function BatchPager({ plan, page, pages, picked, rootRef, cache, p, onPage }: PagerProps) {
  const sources = useMemo(() => plan.items
    .map((i) => picked.find((r) => r.source.id === i.sourceId)?.source)
    .filter((s): s is SvgSource => s !== undefined), [plan, picked]);
  const composite = usePageComposite(rootRef, plan.id, sources, cache);
  const payload = useMemo(() => buildPayload({
    model: p.config.model, userPrompt: p.prompt, manifest: batchManifest(plan.items),
    image: composite.built?.dataUrl ?? "", caps: p.caps, params: p.params,
  }), [p.config.model, p.prompt, p.caps, p.params, plan.items, composite.built]);
  return (
    <div className="svg-batch-pager" data-testid="svg-composite">
      <PagerHead plan={plan} page={page} pages={pages} onPage={onPage} />
      <PagerFacts plan={plan} />
      <BatchItems plan={plan} />
      <NamingNote />
      <Composite state={composite} />
      <SvgPromptPreview prompt={payload.prompt} request={payload.request} state={previewState(composite)} />
    </div>
  );
}

/** Saving is versioned: the plain name first, `_vN` after that (RULE 22). */
function NamingNote() {
  return (
    <p className="svg-note" data-testid="svg-confirm-naming">
      Each answer is saved beside its source under the file name shown above. A source that already
      has SVGs receives the next free <code>_vN</code> name — an existing file is never overwritten.
    </p>
  );
}

function previewState(composite: CompositeState): "building" | "ready" | "blocked" {
  if (composite.built !== null) return "ready";
  return composite.error === null ? "building" : "blocked";
}

interface CompositeState {
  built: BuiltComposite | null;
  error: string | null;
}

/** Builds the page's contact sheet once, in memory, and remembers it. */
function usePageComposite(
  rootRef: { current: DirHandleLike | null },
  planId: string,
  sources: readonly SvgSource[],
  cache: Map<string, BuiltComposite>,
): CompositeState {
  const [state, setState] = useState<CompositeState>(() => ({ built: cache.get(planId) ?? null, error: null }));
  useEffect(() => {
    const hit = cache.get(planId);
    if (hit) return setState({ built: hit, error: null });
    const root = rootRef.current;
    if (root === null) return setState({ built: null, error: "Pick the source folder first" });
    let live = true;
    setState({ built: null, error: null });
    void buildComposite(root, sources).then(
      (built) => { if (live) { cache.set(planId, built); setState({ built, error: null }); } },
      (error: unknown) => { if (live) setState({ built: null, error: reason(error) }); },
    );
    return () => { live = false; };
  }, [rootRef, planId, sources, cache]);
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

function PolicyNote() {
  return (
    <p className="svg-note">
      The saved local prompt is sent with every request. Existing SVG versions are never overwritten —
      each result is saved as the next version. A rate limit reports its retry-after delay, and nothing
      is resent while a request&apos;s outcome is unknown.
    </p>
  );
}
