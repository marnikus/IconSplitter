// ConfirmFacts.tsx — the read-only facts of the confirmation: counts, provider
// and model, the endpoint, the attempts and timeout, the fingerprint of the run,
// and the ordered position manifest of every request (prompt §3).

import type { BatchPlan } from "../../lib/svgbatch";
import type { PreparedRun } from "../../lib/svgpayload";

interface FactsProps {
  prepared: PreparedRun;
  selected: number;
  perRequest: number;
  /** Read from the request on screen (describeRequest), not from the settings. */
  sampling: string;
  attempts: string;
}

/** The facts a confirmation must state before anything is sent. */
export function Facts({ prepared, selected, perRequest, sampling, attempts }: FactsProps) {
  return (
    <div className="svg-facts">
      <Fact label="Selected images" value={String(selected)} testid="svg-confirm-count" />
      <Fact label="Requests" value={`${prepared.batches.length} × ${perRequest} max`} testid="svg-confirm-requests" />
      <Fact label="Provider / model" value={prepared.model} testid="svg-confirm-model" />
      <Fact label="Model settings" value={sampling} testid="svg-confirm-sampling" />
      <Fact label="Endpoint" value={`POST ${prepared.endpoint}`} testid="svg-confirm-endpoint" />
      <Fact label="Attempts" value={attempts} testid="svg-confirm-attempts" />
      <Fact label="Run fingerprint" value={prepared.fingerprint} testid="svg-confirm-run-fingerprint" />
      <Fact label="Output policy" value="Versioned SVG + per-file sidecar" />
    </div>
  );
}

/** The ordered position manifest the provider answers with (prompt §3). */
export function Manifest({ plans }: { plans: BatchPlan[] }) {
  return (
    <details className="svg-manifest" data-testid="svg-manifest" open>
      <summary className="svg-field-label"><span>All requests · ordered positions</span><span>{plans.length} request(s)</span></summary>
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
    </details>
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
