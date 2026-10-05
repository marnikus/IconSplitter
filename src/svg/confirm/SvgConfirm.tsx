// SvgConfirm.tsx — the confirmation that must precede any send (prompt §2/§3):
// count, provider + model, the ordered position manifest, the request count
// and the contact-sheet preview. Escape/Close/Cancel dismiss it WITHOUT
// sending anything; only "Generate now" starts a run.

import { planBatches } from "../../lib/svgbatch";
import { paramsLabel, type ModelCaps, type SamplingParams } from "../../lib/modelcaps";
import type { SvgConfig } from "../../lib/svgconfig";
import type { DirHandleLike } from "../../lib/fs";
import { toBatchSource } from "../sources";
import type { SvgRow } from "../types";
import CompositePreview from "./ConfirmComposite";
import { Facts, Manifest } from "./ConfirmFacts";

export interface ConfirmProps {
  ids: string[];
  batches: number;
  perRequest: number;
  rows: SvgRow[];
  config: SvgConfig;
  caps: ModelCaps;
  params: SamplingParams;
  rootRef: { current: DirHandleLike | null };
  onConfirm: () => void;
  onDismiss: () => void;
}

export default function SvgConfirm(p: ConfirmProps) {
  const picked = p.rows.filter((r) => p.ids.includes(r.source.id));
  const plans = planBatches(picked.map((r) => toBatchSource(r.source)), p.perRequest);
  return (
    <div className="svg-backdrop" data-testid="svg-confirm">
      <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="svg-confirm-title">
        <header className="svg-modal-head">
          <h2 id="svg-confirm-title">Confirm SVG generation</h2>
          <button type="button" className="svg-btn" data-testid="svg-confirm-close" onClick={p.onDismiss}>Close</button>
        </header>
        <div className="svg-modal-body">
          <Facts ids={p.ids.length} batches={p.batches} perRequest={p.perRequest} model={p.config.model}
            sampling={paramsLabel(p.caps, p.params)} />
          <p className="svg-note">
            The saved local prompt is sent with every request. Existing SVG versions are never overwritten —
            each result is saved as the next version. A rate limit reports its retry-after delay, and nothing
            is resent while a request&apos;s outcome is unknown.
          </p>
          <Manifest plans={plans} />
          <CompositePreview rootRef={p.rootRef} picked={picked} perRequest={p.config.imagesPerRequest} />
          <div className="svg-modal-actions">
            <button type="button" className="svg-btn" data-testid="svg-confirm-cancel" onClick={p.onDismiss}>Cancel</button>
            <button type="button" className="svg-btn primary" data-testid="svg-confirm-generate" onClick={p.onConfirm}>Generate now</button>
          </div>
        </div>
      </section>
    </div>
  );
}
