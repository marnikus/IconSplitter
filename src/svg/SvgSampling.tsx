// SvgSampling.tsx — the model-parameter row of the provider card (prompt
// §"show only options supported by the selected model"). No rule lives here:
// every range, option and value comes from lib/modelcaps, so a control the
// selected model refuses is not merely disabled, it is not offered at all.

import { EFFORT_LABELS, type ModelCaps, type SamplingParams } from "../lib/modelcaps";
import { modelLabel } from "../lib/svgconfig";

export interface SvgSamplingProps {
  caps: ModelCaps;
  params: SamplingParams;
  onParams: (patch: Partial<SamplingParams>) => void;
  onRefresh: () => void;
  /** What a model change had to reset; null when nothing was reset. */
  note: string | null;
  onDismissNote: () => void;
}

/** The three sampling controls plus the honest statement of what is accepted. */
export default function SvgSampling(p: SvgSamplingProps) {
  return (
    <div className="svg-sampling">
      <div className="svg-fields">
        <TemperatureField caps={p.caps} params={p.params} onParams={p.onParams} />
        <TokensField caps={p.caps} params={p.params} onParams={p.onParams} />
        {p.caps.efforts.length > 0 && <EffortField caps={p.caps} params={p.params} onParams={p.onParams} />}
      </div>
      <p className="svg-caps" data-testid="svg-caps">{capsLine(p.caps)}</p>
      {p.note !== null && (
        <p className="svg-note warn" data-testid="svg-param-note">
          <span>{p.note}</span>
          <button type="button" className="svg-link" data-testid="svg-param-note-dismiss" onClick={p.onDismissNote}>Dismiss</button>
        </p>
      )}
    </div>
  );
}

function TemperatureField({ caps, params, onParams }: Pick<SvgSamplingProps, "caps" | "params" | "onParams">) {
  const range = caps.temperature;
  if (range === null) {
    return (
      <label className="svg-field">
        <span className="svg-label">Temperature</span>
        <span className="svg-input flat" data-testid="svg-temperature-off">Not supported by this model</span>
      </label>
    );
  }
  return (
    <label className="svg-field">
      <span className="svg-label">Temperature</span>
      <input className="svg-input" data-testid="svg-temperature" type="number" inputMode="decimal"
        aria-label="Temperature" min={range.min} max={range.max} step={range.step}
        value={params.temperature ?? ""}
        onChange={(e) => onParams({ temperature: e.target.value === "" ? null : Number(e.target.value) })} />
    </label>
  );
}

function TokensField({ caps, params, onParams }: Pick<SvgSamplingProps, "caps" | "params" | "onParams">) {
  return (
    <label className="svg-field">
      <span className="svg-label">Max output tokens</span>
      <input className="svg-input" data-testid="svg-max-tokens" type="number" inputMode="numeric"
        aria-label="Max output tokens" min={caps.maxTokens.min} max={caps.maxTokens.max} step={caps.maxTokens.step}
        value={params.maxTokens}
        onChange={(e) => onParams({ maxTokens: Number(e.target.value) })} />
    </label>
  );
}

function EffortField({ caps, params, onParams }: Pick<SvgSamplingProps, "caps" | "params" | "onParams">) {
  return (
    <label className="svg-field">
      <span className="svg-label">Reasoning / quality</span>
      <select className="svg-input" data-testid="svg-effort" aria-label="Reasoning effort"
        value={params.effort ?? ""}
        onChange={(e) => onParams({ effort: e.target.value === "" ? null : e.target.value as SamplingParams["effort"] })}>
        <option value="">Provider default</option>
        {caps.efforts.map((effort) => <option key={effort} value={effort}>{EFFORT_LABELS[effort]}</option>)}
      </select>
    </label>
  );
}

/** What the model accepts, and where that knowledge came from — never implied. */
function capsLine(caps: ModelCaps): string {
  const name = modelLabel(caps.model);
  const temp = caps.temperature === null ? "no temperature" : `temperature ${caps.temperature.min}–${caps.temperature.max}`;
  const efforts = caps.efforts.length === 0
    ? "no reasoning effort"
    : `effort ${caps.efforts.map((e) => EFFORT_LABELS[e]).join(" / ")}`;
  return `${name}: ${temp} · ${caps.tokenField} ${caps.maxTokens.min}–${caps.maxTokens.max} · ${efforts} · ${sourceLabel(caps.source)}`;
}

function sourceLabel(source: ModelCaps["source"]): string {
  if (source === "catalog") return "limits from the Requesty model list";
  if (source === "family") return "limits from the model family (list not fetched yet)";
  return "conservative limits (unknown model)";
}
