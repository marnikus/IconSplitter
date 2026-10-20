// SvgConfirm.tsx — confirmation dialog for both SVG generation and batch SVG
// regeneration. Displays active per-task/per-scope default prompt above the
// preset dropdown, supports configurable 1..9 icons per regeneration request,
// and previews the exact contact sheet + outgoing text payload per batch page.

import { useState } from "react";
import { stallLabel, stallNote } from "../lib/effortlimits";
import { paramsLabel, type ModelCaps, type SamplingParams } from "../lib/modelcaps";
import type { SvgConfig } from "../lib/svgconfig";
import type { DirHandleLike } from "../lib/fs";
import type { SvgOperation, SvgRow } from "./types";
import type { PromptPreset } from "../lib/promptpresets";
import { TaskPromptPicker, useTaskPromptSelection, type TaskPromptSelection } from "../ui/TaskPromptPicker";
import { loadRegenSetting } from "./regenstore";
import { MAX_REGEN_BATCH, saveRegenBatchPref } from "./regenprefs";
import type { ConfirmSvgInput } from "./runcontrol";
import { BatchPager } from "./SvgConfirmPager";
import { FullPromptPreview } from "./SvgConfirmFullPrompt";
import { useBuiltConfirmPlan, useConfirmBatchCount, type ConfirmBatchCountState, type ConfirmPlan } from "./SvgConfirmPlan";

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
  onConfirm: (choice: ConfirmSvgInput) => void;
  onDismiss: () => void;
}

function useConfirmModalState(p: SvgConfirmProps) {
  const [page, setPage] = useState(0);
  const batch = useConfirmBatchCount(p, () => setPage(0));
  const promptSel = useTaskPromptSelection({
    operation: p.operation === "regenerate" ? "svg-regenerate" : "svg-generate",
    scope: batch.scope,
    presets: p.presets,
    mainPrompt: p.prompt,
    legacyPresetName: loadRegenSetting().presetName,
  });
  const selected = promptSel.resolved.presetName ?? "";
  const plan = useBuiltConfirmPlan({
    input: p, selected, perRequest: batch.perRequest, countError: batch.countError, page, setPage,
  });
  return { batch, promptSel, selected, plan };
}

export default function SvgConfirm(p: SvgConfirmProps) {
  const { batch, promptSel, selected, plan } = useConfirmModalState(p);
  return (
    <div className="svg-backdrop" data-testid="svg-confirm">
      <section className="svg-modal wide" role="dialog" aria-modal="true" aria-labelledby="svg-confirm-title">
        <DialogHead operation={p.operation} onDismiss={p.onDismiss} />
        <div className="svg-modal-body">
          <ModeBadge operation={p.operation} />
          <QueueNote running={p.running} count={plan.picked.length} />
          <PromptAndCountRow operation={p.operation} presets={p.presets} selection={promptSel} batch={batch} />
          <Facts plan={plan} p={p} selected={selected} />
          <PlanBody plan={plan} p={p} />
          <FullPromptPreview operation={p.operation} prompt={promptSel.resolved.text} presets={p.presets}
            selected={selected} regen={plan.regen} active={plan.active} picked={plan.picked} rootRef={p.rootRef} />
          <PolicyNote operation={p.operation} perRequest={plan.perRequest} />
          <Actions plan={plan} p={p} selection={promptSel} />
        </div>
      </section>
    </div>
  );
}

function PromptAndCountRow(p: {
  operation: SvgOperation;
  presets: PromptPreset[];
  selection: TaskPromptSelection;
  batch: ConfirmBatchCountState;
}) {
  const isRegen = p.operation === "regenerate";
  const pickedName = p.selection.resolved.presetName;
  return (
    <div className="svg-regen-controls-row">
      <div className="svg-regen-prompt">
        <TaskPromptPicker
          selection={p.selection}
          presets={p.presets}
          selectTestId={isRegen ? "svg-confirm-regen-preset" : "svg-confirm-gen-preset"}
          defaultMsgTestId="svg-confirm-default-prompt"
          label={isRegen ? "Regeneration prompt" : "Generation prompt preset"}
        />
        {!isRegen && (
          <small className="svg-note" data-testid="svg-confirm-main-prompt">
            {pickedName ? `Using saved preset “${pickedName}” — applied to full batch.` : "Using main prompt (currently loaded) — applied to full batch."}
          </small>
        )}
      </div>
      {isRegen && <RegenBatchCountControl batch={p.batch} />}
    </div>
  );
}

function RegenBatchCountControl({ batch }: { batch: ConfirmBatchCountState }) {
  return (
    <div className="svg-regen-count">
      <label className="svg-field">
        <span className="svg-label">Icons per regeneration request</span>
        <input
          className="svg-input"
          type="number"
          min="1"
          max={MAX_REGEN_BATCH}
          step="1"
          data-testid="svg-regen-per-request"
          value={batch.countText}
          onChange={(e) => batch.setCountText(e.target.value)}
        />
      </label>
      {batch.storageWarning && <p role="status">Saved SVG regeneration batch count was unreadable; using 4.</p>}
      {batch.countError && <p role="alert" data-testid="svg-regen-count-error">{batch.countError}</p>}
    </div>
  );
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

function PlanBody({ plan, p }: { plan: ConfirmPlan; p: SvgConfirmProps }) {
  if (plan.problems.length > 0) {
    return <p className="svg-note error" data-testid="svg-confirm-problem">{plan.problems[0]} — nothing will be sent.</p>;
  }
  if (plan.active === null) return null;
  return (
    <BatchPager plan={plan.active} page={plan.page} pages={plan.plans.length}
      picked={plan.picked} rootRef={p.rootRef} cache={plan.cache} onPage={plan.setPage} />
  );
}

function Actions({ plan, p, selection }: { plan: ConfirmPlan; p: SvgConfirmProps; selection: TaskPromptSelection }) {
  const handleConfirm = () => {
    selection.persistCurrent();
    if (p.operation === "regenerate") {
      saveRegenBatchPref(plan.perRequest);
      p.onConfirm(selection.resolved.presetName);
      return;
    }
    const override = selection.resolved.presetName === null ? null : selection.resolved.text;
    p.onConfirm(override === null ? null : { regenPresetName: null, promptOverride: override });
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
  const promptNote = selected !== "" ? ` · prompt “${selected}”` : "";
  return (
    <div className="svg-facts">
      <Fact label="Selected images" value={String(plan.picked.length)} testid="svg-confirm-count" />
      <Fact label="Requests" value={`${plan.plans.length} × ${plan.perRequest} max${promptNote}`} testid="svg-confirm-requests" />
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

function PolicyNote({ operation, perRequest }: { operation: SvgOperation; perRequest: number }) {
  return (
    <p className="svg-note">
      {operation === "regenerate"
        ? `Regeneration sends up to ${perRequest} icon(s) per request with their contact sheet, selected preset, and current SVG code(s), matching returned SVGs strictly by <title>. Existing versions are never overwritten.`
        : "The selected prompt is sent with every request, streamed so the connection cannot be cut for being idle. Existing SVG versions are never overwritten — each result is saved as the next version."}{" "}
      A rate limit reports its retry-after delay; a request that goes silent for the whole
      stall window is reported as outcome unknown with its request id and is never resent.
    </p>
  );
}
