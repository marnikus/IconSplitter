// ConfirmFacts.tsx — the read-only facts of the confirmation: counts, provider
// and model, and the ordered position manifest the provider answers with.

import type { planBatches } from "../../lib/svgbatch";

/** The facts a confirmation must state before anything is sent. */
export function Facts({ ids, batches, perRequest, model, sampling }: {
  ids: number; batches: number; perRequest: number; model: string; sampling: string;
}) {
  return (
    <div className="svg-facts">
      <Fact label="Selected images" value={String(ids)} testid="svg-confirm-count" />
      <Fact label="Requests" value={`${batches} × ${perRequest} max`} testid="svg-confirm-requests" />
      <Fact label="Provider / model" value={model} testid="svg-confirm-model" />
      <Fact label="Model settings" value={sampling} testid="svg-confirm-sampling" />
      <Fact label="Output policy" value="Versioned SVG + per-file sidecar" />
    </div>
  );
}

/** The ordered position manifest the provider answers with (prompt §3). */
export function Manifest({ plans }: { plans: ReturnType<typeof planBatches> }) {
  return (
    <div className="svg-manifest" data-testid="svg-manifest">
      <div className="svg-field-label"><span>Ordered positions per request</span><span>{plans.length} request(s)</span></div>
      <ol>
        {plans.map((plan) => (
          <li key={plan.id}>
            <strong>{plan.id}</strong> · {plan.cols}×{plan.rows} grid
            <span className="svg-manifest-positions">
              {plan.items.map((i) => <span key={i.position}>{i.position} — {i.name}</span>)}
            </span>
          </li>
        ))}
      </ol>
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
