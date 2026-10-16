// SvgImgConfirm.tsx — the confirm dialog of AI source image regeneration
// (2026-10-16), mirroring the SVG confirm's shell: what will be sent, to whom,
// and the FULL PROMPT — the same main prompt and preset list the SVG generation
// uses ("presets with same prompts"). Escape/Cancel never send anything.

import { useEffect, useRef } from "react";
import { connectionLabel, type Connection } from "../lib/svgconnections";
import type { PromptPreset } from "../lib/promptpresets";
import { Select } from "../ui/fields";

export interface SvgImgConfirmProps {
  ids: readonly string[];
  conn: Connection;
  presets: readonly PromptPreset[];
  prompt: string;
  onPrompt: (prompt: string) => void;
  onPickPreset: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SvgImgConfirm(p: SvgImgConfirmProps) {
  useEscape(p.onCancel);
  return (
    <div className="svg-modal" data-testid="svg-img-confirm" role="dialog" aria-label="Confirm AI source regeneration">
      <div className="svg-modal-head">
        <h2>Regenerate AI source image</h2>
        <button type="button" className="svg-btn" data-testid="svg-img-cancel" onClick={p.onCancel}>Cancel</button>
      </div>
      <ConfirmHead ids={p.ids.length} conn={p.conn} />
      <p className="svg-caps">
        Text-to-image only — this provider documents no image-edit endpoint, so the
        current AI image cannot be sent along. One request per source.
      </p>
      <PromptBlock presets={p.presets} prompt={p.prompt} onPickPreset={p.onPickPreset} onPrompt={p.onPrompt} />
      <div className="svg-modal-foot">
        <button type="button" className="svg-btn primary" data-testid="svg-img-generate" onClick={p.onConfirm}>
          Generate now
        </button>
      </div>
    </div>
  );
}

/** Counts and the active connection, as the dialog's static head. */
function ConfirmHead(p: { ids: number; conn: Connection }) {
  return (
    <div className="svg-provider-fields">
      <label className="svg-field">
        <span className="svg-label">Selected images</span>
        <span className="svg-input flat" data-testid="svg-img-count">{p.ids}</span>
      </label>
      <label className="svg-field">
        <span className="svg-label">Provider / model</span>
        <span className="svg-input flat" data-testid="svg-img-provider" title={p.conn.model}>{p.conn.name} · {connectionLabel(p.conn)}</span>
      </label>
    </div>
  );
}

/** The shared prompt + its preset dropdown (the SVG generation's own list). */
function PromptBlock({ presets, prompt, onPickPreset, onPrompt }: {
  presets: readonly PromptPreset[]; prompt: string;
  onPickPreset: (name: string) => void; onPrompt: (prompt: string) => void;
}) {
  return (
    <div className="svg-provider-fields">
      <Select label="Prompt preset" testid="svg-img-preset" value=""
        options={[["", "— pick a saved prompt —"], ...presets.map((x) => [x.name, x.name] as [string, string])]}
        onChange={onPickPreset} />
      <label className="svg-field">
        <span className="svg-label">Prompt</span>
        <textarea className="svg-input" data-testid="svg-img-prompt" rows={5} aria-label="Image prompt"
          value={prompt} onChange={(e) => onPrompt(e.target.value)} />
      </label>
    </div>
  );
}

function useEscape(onCancel: () => void): void {
  const latest = useRef(onCancel);
  latest.current = onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") latest.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
