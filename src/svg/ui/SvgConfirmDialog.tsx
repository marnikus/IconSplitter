// ui/SvgConfirmDialog.tsx — explicit pre-send review of the captured prompt,
// source count, deterministic batches, local PNG payload size and honest pricing.

import type { SvgRunPlan } from "./useSvgRun";
import { REQUESTY_MODEL_INFO } from "../requesty";
import SvgDialog from "./SvgDialog";

export default function SvgConfirmDialog({ plan, onConfirm, onClose }: {
  plan: SvgRunPlan; onConfirm: () => void; onClose: () => void;
}) {
  return <SvgDialog title="Confirm SVG generation" onClose={onClose} wide>
    <ConfirmationFacts plan={plan} />
    <CostDisclosure />
    <SendDisclosure />
    <PromptDisclosure prompt={plan.prefs.prompt} />
    <ConfirmationActions onConfirm={onConfirm} onClose={onClose} />
  </SvgDialog>;
}

function ConfirmationFacts({ plan }: { plan: SvgRunPlan }) {
  const payloadBytes = plan.batches.reduce((sum, batch) => sum + batch.payloadBytes, 0);
  const imageBytes = plan.batches.reduce((sum, batch) => sum + batch.composite.size, 0);
  const sizes = plan.batches.map((batch) => batch.rows.length).join(" + ");
  return <>
    <div className="svg-confirm-grid">
      <Fact label="Approved AI images" value={String(plan.rows.length)} />
      <Fact label="Request batches" value={`${plan.batches.length} (${sizes} per batch)`} />
      <Fact label="Requesty model" value={plan.prefs.model} />
      <Fact label="Request JSON bodies" value={`${(payloadBytes / 1_048_576).toFixed(2)} MiB · ${plan.batches.length} requests`} />
      <Fact label="Composite PNGs" value={`${(imageBytes / 1_048_576).toFixed(2)} MiB total`} />
    </div>
    {plan.batches.some((batch) => batch.reduced) && <p role="status" className="svg-warning-copy">Some batches were automatically reduced to stay within the configured full JSON request-body cap.</p>}
  </>;
}

function CostDisclosure() {
  return <div className="svg-cost-explainer">
    <strong>Pre-send estimate unavailable</strong>
    <span>Vision-token billing depends on Requesty’s route. Actual tokens and cost are shown from its response; shared batch charges are not allocated per icon.</span>
    <small>Listed upstream route rates: ${REQUESTY_MODEL_INFO.inputUsdPerMillion}/M input · ${REQUESTY_MODEL_INFO.outputUsdPerMillion}/M output. Requesty pay-as-you-go may add 5%; BYOK may be 0%. The response cost remains authoritative.</small>
  </div>;
}

function SendDisclosure() {
  return <p className="svg-modal-copy">Nothing has been uploaded yet. Selecting “Generate now” sends the contact sheets, filenames, manifest and prompt to Requesty. Existing SVG versions are never overwritten.</p>;
}

function PromptDisclosure({ prompt }: { prompt: string }) {
  return <label className="svg-field"><span>Exact prompt to be sent</span>
    <pre className="svg-prompt-preview">{prompt}</pre>
  </label>;
}

function ConfirmationActions({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return <div className="svg-modal-actions">
    <button type="button" className="svg-btn" onClick={onClose}>Cancel</button>
    <button type="button" className="svg-btn primary" onClick={onConfirm}>Generate now</button>
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="svg-fact"><span>{label}</span><strong>{value}</strong></div>;
}
