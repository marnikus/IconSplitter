// SvgConfirm.tsx — the confirmation that must precede any send (prompt §2/§3/
// §16): the selected count, the REQUEST count at the size the USER configured
// (the reasoning level never shrinks it — 2026-10-05), the provider and
// sampling facts, and one page per batch with that page's own contact sheet,
// its ordered `position — name` manifest and its empty cells. Opening it sends
// nothing; every page's composite is built in memory when the page is first shown
// and cached for the dialog's lifetime. A plan that cannot be mapped is refused
// here (RULE 15).
// 2026-10-09: generation vs regeneration are clearly distinguished.
// 2026-10-20: ONE task prompt picker (its default is named above the list), a
// single/batch tab per work, and the icons-per-regeneration-request control.

import { useMemo, useState } from "react";
import type { PromptPreset } from "../lib/promptpresets";
import type {
  PromptChoice, PromptTaskId, PromptWork, ResolvedTaskPrompt, TaskPromptEntry, TaskPromptMap,
} from "../lib/prompttasks";
import { resolveTaskPrompt, taskLabel, taskOf } from "../lib/prompttasks";
import { inIdOrder } from "../lib/selectionorder";
import { stallLabel, stallNote } from "../lib/effortlimits";
import { paramsLabel, type ModelCaps, type SamplingParams } from "../lib/modelcaps";
import type { SvgConfig } from "../lib/svgconfig";
import type { DirHandleLike } from "../lib/fs";
import TaskPromptPicker from "../ui/TaskPromptPicker";
import { useRegenCodes } from "./confirmcodes";
import { useConfirmPlan, type ConfirmPlan } from "./confirmplan";
import { BatchPager } from "./SvgConfirmPager";
import { FullPromptPreview } from "./SvgConfirmFullPrompt";
import type { ConfirmedBatch, SvgOperation, SvgRow } from "./types";

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
  /** The stored main prompt — never modified by this popup. */
  prompt: string;
  /** The six tasks' remembered choices, read when the popup opened. */
  taskEntries: TaskPromptMap;
  onTaskEntry: (task: PromptTaskId, entry: TaskPromptEntry) => void;
  onConfirm: (batch: ConfirmedBatch) => void;
  onDismiss: () => void;
}

export default function SvgConfirm(p: SvgConfirmProps) {
  const s = useConfirmState(p);
  return (
    <div className="svg-backdrop" data-testid="svg-confirm">
      <section className="svg-modal wide" role="dialog" aria-modal="true" aria-labelledby="svg-confirm-title">
        <DialogHead operation={p.operation} onDismiss={p.onDismiss} />
        <div className="svg-modal-body">
          <ModeBadge operation={p.operation} task={s.ownTask} />
          <QueueNote running={p.running} count={s.plan.picked.length} />
          <TaskPromptPicker testId="svg-confirm-prompt" work={s.work} count={p.ids.length}
            entries={s.entries} onEntry={s.chooseEntry} sources={s.sources} note={s.note} />
          <Facts plan={s.plan} p={p} choice={s.own.choice} />
          <ExclusionNote names={s.plan.excluded} />
          <PlanBody plan={s.plan} p={p} />
          <FullPromptPreview operation={p.operation} prompt={p.prompt} choice={s.own.choice} active={s.plan.active}
            picked={s.plan.picked} codes={s.codes.codes} loading={s.codes.loading} />
          <PolicyNote operation={p.operation} />
          <Actions state={s} p={p} />
        </div>
      </section>
    </div>
  );
}

interface ConfirmState {
  work: PromptWork;
  ownTask: PromptTaskId;
  entries: TaskPromptMap;
  chooseEntry: (task: PromptTaskId, entry: TaskPromptEntry) => void;
  sources: { presets: PromptPreset[]; mainPrompt: string };
  own: ResolvedTaskPrompt;
  note: string;
  size: number;
  codes: ReturnType<typeof useRegenCodes>;
  plan: ConfirmPlan;
}

/** Everything the dialog decides, in one place: its task, size, codes and plan. */
function useConfirmState(p: SvgConfirmProps): ConfirmState {
  const work: PromptWork = p.operation === "regenerate" ? "svg.regenerate" : "svg.generate";
  const ownTask = taskOf(work, p.ids.length);
  const [entries, setEntries] = useState<TaskPromptMap>(p.taskEntries);
  const picked = useMemo(() => inIdOrder(p.rows, p.ids, (r) => r.source.id), [p.rows, p.ids]);
  const codes = useRegenCodes(p.operation, p.rootRef, picked);
  const sources = useMemo(() => ({ presets: p.presets, mainPrompt: p.prompt }), [p.presets, p.prompt]);
  const own = resolveTaskPrompt(ownTask, entries[ownTask], sources);
  const plan = useConfirmPlan({ ids: p.ids, operation: p.operation, rows: p.rows, config: p.config, choice: own, codes });
  const chooseEntry = (task: PromptTaskId, entry: TaskPromptEntry) => {
    setEntries((prev: TaskPromptMap) => ({ ...prev, [task]: entry }));
    p.onTaskEntry(task, entry);
  };
  const note = noteFor(ownTask, own, plan.perRequest);
  return { work, ownTask, entries, chooseEntry, sources, own, note, size: plan.perRequest, codes, plan };
}

/** What this task's prompt does for the batch in flight. */
function noteFor(ownTask: PromptTaskId, own: ResolvedTaskPrompt, size: number): string {
  if (ownTask.startsWith("svg.generate")) {
    return own.choice.kind === "preset"
      ? "This preset is used for this batch only — the main prompt in the prompt window is not changed."
      : "Each request uses the main prompt (currently loaded), applied to the full batch.";
  }
  return size === 1
    ? "Each request sends one icon's current SVG code and this prompt."
    : `Each request sends its ${size} icons' current SVG code and this prompt, and its answer is matched back by SVG <title>.`;
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

function ModeBadge({ operation, task }: { operation: SvgOperation; task: PromptTaskId }) {
  const text = operation === "regenerate" ? "Regeneration now" : "Generation batch now";
  return (
    <p className="svg-note strong">
      <span data-testid="svg-confirm-mode">{text}</span>
      {" · "}
      <span data-testid="svg-confirm-task">{taskLabel(task)}</span>
    </p>
  );
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
  return <BatchPager plan={plan.active} page={plan.page} pages={plan.plans.length}
    picked={plan.picked} rootRef={p.rootRef} cache={plan.cache} onPage={plan.setPage} />;
}

/** A row left out is named before anything is sent, never dropped in silence. */
function ExclusionNote({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="svg-note warn" data-testid="svg-confirm-excluded">
      {names.length} icon(s) left out — no readable current SVG: {names.join(", ")}.
      Use Generate selected for a first version.
    </p>
  );
}

function Actions({ state, p }: { state: ConfirmState; p: SvgConfirmProps }) {
  const plan = state.plan;
  const confirm = () => p.onConfirm({ choice: state.own.choice, size: state.size, codes: state.codes.codes });
  return (
    <div className="svg-modal-actions">
      <button type="button" className="svg-btn" data-testid="svg-confirm-cancel" onClick={p.onDismiss}>Cancel</button>
      <button type="button" className="svg-btn primary" data-testid="svg-confirm-generate"
        disabled={plan.problems.length > 0 || plan.active === null} onClick={confirm}>
        {p.running ? "Add to queue" : p.operation === "regenerate" ? "Regenerate now" : "Generate now"}
      </button>
    </div>
  );
}

function Facts({ plan, p, choice }: { plan: ConfirmPlan; p: SvgConfirmProps; choice: PromptChoice }) {
  const note = stallNote(p.config.timeoutMs, p.caps, p.params);
  const label = choice.kind === "preset" ? ` · prompt “${choice.name}”` : "";
  return (
    <div className="svg-facts">
      <Fact label="Selected images" value={String(plan.picked.length)} testid="svg-confirm-count" />
      <Fact label="Requests" value={`${plan.plans.length} × ${plan.perRequest} max${label}`} testid="svg-confirm-requests" />
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
        ? "Regeneration sends the chosen saved prompt plus every carried icon's current SVG code — each answer is matched back by its SVG <title>. Existing versions are never overwritten."
        : "The chosen prompt is sent with every request, streamed so the connection cannot be cut for being idle. Existing SVG versions are never overwritten — each result is saved as the next version."}{" "}
      A rate limit reports its retry-after delay; a request that goes silent for the whole
      stall window is reported as outcome unknown with its request id and is never resent, because a
      resend could be a duplicate charge. The sizes above are exactly what you configured.
    </p>
  );
}
