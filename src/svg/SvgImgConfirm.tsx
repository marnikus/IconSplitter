// SvgImgConfirm.tsx — the confirm dialog of AI source image regeneration
// (2026-10-16), mirroring the SVG confirm's shell: what will be sent, to whom,
// and the FULL PROMPT — the same main prompt and preset list the SVG generation
// uses ("presets with same prompts"). Escape/Cancel never send anything.
// 2026-10-19: a real overlay (the `.svg-backdrop` shell) and a roomy reading
// layout — controls first, the prompt last at full width, fitted to its text —
// plus the image wait limit, the capability note as a named fact, and a
// Generate that waits for a prompt (archive/2026-10-19-image-regen-fix).

import { useEffect, useLayoutEffect, useRef } from "react";
import { connectionLabel, type Connection } from "../lib/svgconnections";
import type { PromptPreset } from "../lib/promptpresets";
import { Select } from "../ui/fields";

export interface SvgImgConfirmProps {
  ids: readonly string[];
  conn: Connection;
  presets: readonly PromptPreset[];
  prompt: string;
  /** The whole wait for one image (svgimgreg.imageWaitMs); omitted = not shown. */
  waitMs?: number;
  onPrompt: (prompt: string) => void;
  onPickPreset: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SvgImgConfirm(p: SvgImgConfirmProps) {
  useEscape(p.onCancel);
  return (
    <div className="svg-backdrop" data-testid="svg-img-confirm">
      <section className="svg-modal img-regen" role="dialog" aria-modal="true" aria-label="Confirm AI source regeneration">
        <header className="svg-modal-head">
          <h2>Regenerate AI source image</h2>
          <button type="button" className="svg-btn" data-testid="svg-img-cancel" onClick={p.onCancel}>Cancel</button>
        </header>
        <div className="svg-modal-body svg-img-body">
          <ConfirmHead ids={p.ids.length} conn={p.conn} waitMs={p.waitMs} />
          <p className="svg-note" data-testid="svg-img-caps">
            Image edit — each request sends this prompt together with that source&apos;s current main AI image as the
            reference. One request per source; each result is saved as a new version and becomes the main AI source,
            which the SVG generation then uses. Nothing is overwritten.
          </p>
          <PromptBlock presets={p.presets} prompt={p.prompt} onPickPreset={p.onPickPreset} onPrompt={p.onPrompt} />
          <div className="svg-modal-actions">
            <button type="button" className="svg-btn primary" data-testid="svg-img-generate" disabled={p.prompt.trim() === ""}
              title={p.prompt.trim() === "" ? "Write a prompt first — nothing blank is ever sent" : undefined} onClick={p.onConfirm}>
              Generate now
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Counts, the active connection and the wait limit, as the dialog's static head. */
function ConfirmHead(p: { ids: number; conn: Connection; waitMs?: number }) {
  return (
    <div className="svg-img-meta">
      <label className="svg-field svg-img-count">
        <span className="svg-label">Selected images</span>
        <span className="svg-input flat" data-testid="svg-img-count">{p.ids}</span>
      </label>
      <label className="svg-field">
        <span className="svg-label">Provider / model</span>
        <span className="svg-input flat" data-testid="svg-img-provider" title={p.conn.model}>{p.conn.name} · {connectionLabel(p.conn)}</span>
      </label>
      {p.waitMs !== undefined && (
        <label className="svg-field">
          <span className="svg-label">Wait limit</span>
          <span className="svg-input flat" data-testid="svg-img-wait">{Math.round(p.waitMs / 1000)} s per image</span>
        </label>
      )}
    </div>
  );
}

/** The shared prompt + its preset dropdown: preset on its own row, the prompt below at full width. */
function PromptBlock({ presets, prompt, onPickPreset, onPrompt }: {
  presets: readonly PromptPreset[]; prompt: string;
  onPickPreset: (name: string) => void; onPrompt: (prompt: string) => void;
}) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  useFitToText(box, prompt);
  return (
    <div className="svg-img-prompt-block">
      <Select label="Prompt preset" testid="svg-img-preset" value=""
        options={[["", "— pick a saved prompt —"], ...presets.map((x) => [x.name, x.name] as [string, string])]}
        onChange={onPickPreset} />
      <label className="svg-field">
        <span className="svg-label">Prompt</span>
        <textarea ref={box} className="svg-input svg-img-prompt" data-testid="svg-img-prompt" rows={3} aria-label="Image prompt"
          value={prompt} onChange={(e) => onPrompt(e.target.value)} />
      </label>
    </div>
  );
}

/** Sizes the box to the WHOLE text (CSS caps it at the browser height), refitting on edit and resize. */
function useFitToText(ref: React.RefObject<HTMLTextAreaElement | null>, text: string): void {
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (el === null) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, text]);
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
