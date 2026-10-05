// SvgConfirm.tsx — the confirmation that must precede any send (prompt §2/§3):
// the request each "Generate now" will post, shown exactly (blocks, JSON,
// fingerprint), the ordered manifest, and the contact sheet. It renders a
// PreparedRun and hands THAT object to onConfirm — nothing is re-read at click
// time. Escape/Close/Cancel dismiss it WITHOUT sending anything; empty rules
// disable the send and say why.

import { describeRequest, type PreparedRun } from "../../lib/svgpayload";
import type { ModelCaps, SamplingParams } from "../../lib/modelcaps";
import type { SvgConfig } from "../../lib/svgconfig";
import type { DirHandleLike } from "../../lib/fs";
import type { SvgRow } from "../types";
import CompositePreview from "./ConfirmComposite";
import { Facts, Manifest } from "./ConfirmFacts";
import ConfirmPrompt from "./ConfirmPrompt";
import { useConfirmRun, type ConfirmRun } from "./useConfirmRun";

export interface ConfirmProps {
  ids: string[];
  rows: SvgRow[];
  config: SvgConfig;
  caps: ModelCaps;
  params: SamplingParams;
  /** The stored rules: this dialog and the tab's textarea edit the same value. */
  prompt: string;
  onPrompt: (text: string) => void;
  rootRef: { current: DirHandleLike | null };
  onConfirm: (prepared: PreparedRun) => void;
  onDismiss: () => void;
}

export default function SvgConfirm(p: ConfirmProps) {
  const run = useConfirmRun(p);
  return (
    <div className="svg-backdrop" data-testid="svg-confirm">
      <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="svg-confirm-title">
        <header className="svg-modal-head">
          <h2 id="svg-confirm-title">Confirm SVG generation</h2>
          <button type="button" className="svg-btn" data-testid="svg-confirm-close" onClick={p.onDismiss}>Close</button>
        </header>
        <div className="svg-modal-body"><Body p={p} run={run} /></div>
      </section>
    </div>
  );
}

function Body({ p, run }: { p: ConfirmProps; run: ConfirmRun }) {
  const { prepared, shown } = run;
  const empty = prepared.rules.trim() === "";
  return (
    <>
      <Facts prepared={prepared} selected={p.ids.length} perRequest={p.config.imagesPerRequest}
        sampling={shown === null ? "—" : describeRequest(shown.request, p.caps)} attempts={attemptsOf(p.config)} />
      <p className="svg-note">
        This is the exact text each request carries. Existing SVG versions are never overwritten — each result is
        saved as the next version. A rate limit reports its retry-after delay, and nothing is resent while a
        request&apos;s outcome is unknown.
      </p>
      {shown !== null && (
        <ConfirmPrompt batch={shown} endpoint={prepared.endpoint} index={run.index} total={prepared.batches.length}
          onIndex={run.setIndex} rules={p.prompt} onRules={p.onPrompt} />
      )}
      {empty && <p className="svg-note error" data-testid="svg-confirm-empty-rules">The generation rules are empty — a request would carry no instructions. Add rules above to send.</p>}
      <Manifest plans={prepared.batches.map((b) => b.plan)} />
      {shown !== null && (
        <CompositePreview key={`${shown.plan.id}|${shown.plan.items.map((i) => i.fingerprint).join()}`}
          rootRef={p.rootRef} items={shown.plan.items} index={run.index} total={prepared.batches.length} />
      )}
      <Actions onDismiss={p.onDismiss} onConfirm={() => p.onConfirm(prepared)}
        disabled={empty || shown === null} requests={prepared.batches.length} />
    </>
  );
}

function Actions({ onDismiss, onConfirm, disabled, requests }: {
  onDismiss: () => void; onConfirm: () => void; disabled: boolean; requests: number;
}) {
  return (
    <div className="svg-modal-actions">
      <button type="button" className="svg-btn" data-testid="svg-confirm-cancel" onClick={onDismiss}>Cancel</button>
      <button type="button" className="svg-btn primary" data-testid="svg-confirm-generate" disabled={disabled} onClick={onConfirm}>
        Generate now · {requests} request{requests === 1 ? "" : "s"}
      </button>
    </div>
  );
}

const attemptsOf = (c: SvgConfig): string => `up to ${c.retries + 1} attempts · ${Math.round(c.timeoutMs / 1000)} s timeout`;
