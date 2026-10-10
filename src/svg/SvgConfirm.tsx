// SvgConfirm.tsx — the confirmation that must precede any send (prompt §2/§3/
// §16): the selected count, the REQUEST count at the size the USER configured
// (the reasoning level never shrinks it — 2026-10-05), the provider and
// sampling facts, and one page per batch with that page's own contact sheet,
// its ordered `position — name` manifest and its empty cells. Opening it sends
// nothing; every page's composite is built in memory when the page is first shown
// and cached for the dialog's lifetime. A plan that cannot be mapped is refused
// here (RULE 15).
// 2026-10-09: generation vs regeneration are clearly distinguished —
// "Generation batch now" uses main current loaded prompt, "Regeneration now"
// shows a dropdown of saved prompts applied to full batch.

import { useEffect, useMemo, useState } from "react";
import { planBatches, validateBatchPlan, type BatchPlan } from "../lib/svgbatch";
import { inIdOrder } from "../lib/selectionorder";
import { stallLabel, stallNote } from "../lib/effortlimits";
import { clampImagesPerRequest } from "../lib/svgconfig";
import { paramsLabel, type ModelCaps, type SamplingParams } from "../lib/modelcaps";
import type { SvgConfig } from "../lib/svgconfig";
import type { DirHandleLike } from "../lib/fs";
import type { BuiltComposite } from "./composite";
import { toBatchSource } from "./sources";
import type { SvgOperation, SvgRow } from "./types";
import type { PromptPreset } from "../lib/promptpresets";
import { regenPlanFromPresetName, type RegenPlan } from "../lib/svgregen";
import { BatchPager } from "./SvgConfirmPager";
import { FullPromptPreview } from "./SvgConfirmFullPrompt";

export interface SvgConfirmProps {
  ids: string[];
  operation: SvgOperation;
  rows: SvgRow[];
  config: SvgConfig;
  caps: ModelCaps;
  params: SamplingParams;
  rootRef: { current: DirHandleLike | null };
  running: boolean;
  presets: PromptPreset[];
  prompt: string;
  onConfirm: (regenPresetName: string | null) => void;
  onDismiss: () => void;
}

export default function SvgConfirm(p: SvgConfirmProps) {
  const { selected, setSelected } = useSelectedPreset(p.presets);
  const plan = useConfirmPlan(p, selected);
  return (
    <div className="svg-backdrop" data-testid="svg-confirm">
      <section className="svg-modal wide" role="dialog" aria-modal="true" aria-labelledby="svg-confirm-title">
        <DialogHead operation={p.operation} onDismiss={p.onDismiss} />
        <div className="svg-modal-body">
          <ModeBadge operation={p.operation} />
          <QueueNote running={p.running} count={plan.picked.length} />
          <PromptChooser operation={p.operation} presets={p.presets} selected={selected} onSelect={setSelected} />
          <Facts plan={plan} p={p} selected={selected} />
          <PlanBody plan={plan} p={p} />
          <FullPromptPreview operation={p.operation} prompt={p.prompt} presets={p.presets} selected={selected}
            regen={plan.regen} active={plan.active} picked={plan.picked} rootRef={p.rootRef} />
          <PolicyNote operation={p.operation} />
          <Actions plan={plan} p={p} selected={selected} />
        </div>
      </section>
    </div>
  );
}

function useSelectedPreset(presets: PromptPreset[]) {
  const [selected, setSelected] = useState<string>(() => presets[0]?.name ?? "");
  useEffect(() => {
    if (presets.length === 0) { setSelected(""); return; }
    if (!presets.some((pr) => pr.name === selected)) setSelected(presets[0].name);
  }, [presets, selected]);
  return { selected, setSelected };
}

function DialogHead({ operation, onDismiss }: { operation: SvgOperation; onDismiss: () => void }) {
  return (
    <header className="svg-modal-head">
      <h2 id="svg-confirm-title" data-testid="svg-confirm-title">
        Confirm SVG {operation === "regenerate" ? "regeneration" : "generation"}
      </h2>
      <button type="button" className="svg-btn" data-testid="svg-confirm-close" onClick={onDismiss}>Close</button>
    </header>
  );
}

function ModeBadge({ operation }: { operation: SvgOperation }) {
  const text = operation === "regenerate" ? "Regeneration now" : "Generation batch now";
  return <p className="svg-note strong" data-testid="svg-confirm-mode">{text}</p>;
}

function QueueNote({ running, count }: { running: boolean; count: number }) {
  if (!running) return null;
  return (
    <p className="svg-note" data-testid="svg-confirm-queue-note">
      A run is in flight — confirming adds these {count} image(s) to the queue.
      The run in flight is not interrupted, and nothing waits for the queue to be noticed.
    </p>
  );
}

function PromptChooser({
  operation, presets, selected, onSelect,
}: {
  operation: SvgOperation;
  presets: PromptPreset[];
  selected: string;
  onSelect: (name: string) => void;
}) {
  if (operation === "generate") {
    return <p className="svg-note" data-testid="svg-confirm-main-prompt">Using main prompt (currently loaded) — applied to full batch.</p>;
  }
  return <RegenPicker presets={presets} selected={selected} onSelect={onSelect} />;
}

function RegenPicker({
  presets, selected, onSelect,
}: {
  presets: PromptPreset[];
  selected: string;
  onSelect: (name: string) => void;
}) {
  if (presets.length === 0) return null;
  return (
    <div className="svg-field">
      <label className="svg-label" htmlFor="svg-confirm-regen-preset">Regeneration prompt</label>
      <select id="svg-confirm-regen-preset" className="svg-input" data-testid="svg-confirm-regen-preset"
        aria-label="Prompt for regeneration" value={selected} onChange={(e) => onSelect(e.target.value)}>
        {presets.map((pr) => <option key={pr.name} value={pr.name}>{pr.name}</option>)}
      </select>
      <small className="svg-note" data-testid="svg-confirm-regen-note">
        Selected prompt will be applied to full batch — one icon per request with its current SVG code.
      </small>
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
  regen: RegenPlan | null;
}

function useConfirmPlan(p: SvgConfirmProps, selected: string): ConfirmPlan {
  const picked = useMemo(() => inIdOrder(p.rows, p.ids, (r) => r.source.id), [p.rows, p.ids]);
  const regen = useMemo<RegenPlan | null>(() => {
    if (p.operation !== "regenerate") return null;
    if (p.presets.length === 0) return null;
    const res = regenPlanFromPresetName(selected, p.presets);
    return res.ok ? res.plan : null;
  }, [p.operation, p.presets, selected]);
  const perRequest = useMemo(() => {
    return p.operation === "regenerate" ? 1 : clampImagesPerRequest(p.config.imagesPerRequest);
  }, [p.operation, p.config.imagesPerRequest]);
  const plans = useMemo(() => planBatches(picked.map((r) => toBatchSource(r.source)), perRequest), [picked, perRequest]);
  const problems = useMemo(() => {
    const base = validateBatchPlan(plans, perRequest);
    if (base.length > 0) return base;
    if (p.operation === "regenerate") {
      if (p.presets.length === 0) return ["No saved prompts — save one in the prompt window first"];
      const res = regenPlanFromPresetName(selected, p.presets);
      if (!res.ok) return [res.problem];
    }
    return [];
  }, [plans, perRequest, p.operation, p.presets, selected]);
  const [page, setPage] = useState(0);
  const cache = useMemo(() => new Map<string, BuiltComposite>(), []);
  const active = plans[Math.min(page, Math.max(0, plans.length - 1))] ?? null;
  return { picked, perRequest, plans, problems, page, cache, active, setPage, regen };
}

function PlanBody({ plan, p }: { plan: ConfirmPlan; p: SvgConfirmProps }) {
  if (plan.problems.length > 0) {
    return <p className="svg-note error" data-testid="svg-confirm-problem">{plan.problems[0]} — nothing will be sent.</p>;
  }
  if (plan.active === null) return null;
  return <BatchPager plan={plan.active} page={plan.page} pages={plan.plans.length}
    picked={plan.picked} rootRef={p.rootRef} cache={plan.cache} onPage={plan.setPage} />;
}

function Actions({ plan, p, selected }: { plan: ConfirmPlan; p: SvgConfirmProps; selected: string }) {
  const handleConfirm = () => {
    if (p.operation === "regenerate") p.onConfirm(selected);
    else p.onConfirm(null);
  };
  return (
    <div className="svg-modal-actions">
      <button type="button" className="svg-btn" data-testid="svg-confirm-cancel" onClick={p.onDismiss}>Cancel</button>
      <button type="button" className="svg-btn primary" data-testid="svg-confirm-generate"
        disabled={plan.problems.length > 0 || plan.active === null} onClick={handleConfirm}>
        {p.running ? "Add to queue" : p.operation === "regenerate" ? "Regenerate now" : "Generate now"}
      </button>
    </div>
  );
}

function Facts({ plan, p, selected }: { plan: ConfirmPlan; p: SvgConfirmProps; selected: string }) {
  const note = stallNote(p.config.timeoutMs, p.caps, p.params);
  const regenLabel = p.operation === "regenerate" && selected !== "" ? ` · prompt “${selected}”` : "";
  return (
    <div className="svg-facts">
      <Fact label="Selected images" value={String(plan.picked.length)} testid="svg-confirm-count" />
      <Fact label="Requests" value={`${plan.plans.length} × ${plan.perRequest} max${regenLabel}`} testid="svg-confirm-requests" />
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

function PolicyNote({ operation }: { operation: SvgOperation }) {
  return (
    <p className="svg-note">
      {operation === "regenerate"
        ? "Regeneration uses the selected saved prompt plus the icon's current SVG code and its image — one icon per request. Existing versions are never overwritten."
        : "The main prompt (currently loaded) is sent with every request, streamed so the connection cannot be cut for being idle. Existing SVG versions are never overwritten — each result is saved as the next version."}{" "}
      A rate limit reports its retry-after delay; a request that goes silent for the whole
      stall window is reported as outcome unknown with its request id and is never resent, because a
      resend could be a duplicate charge. The batch size above is exactly what you configured.
    </p>
  );
}
