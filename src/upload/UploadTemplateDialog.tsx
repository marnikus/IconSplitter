import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

// UploadTemplateDialog.tsx — the "paste an SVG" editor the badge and the shadow templates share
// (2026-11-08: generalised from the badge dialog so the shadow got the same editor, not a copy).
// A template kind brings its words, its default graphic and its validator; the test ids are
// `upload-<kind>-template-*`, so the badge's ids and texts are exactly what they were.

/** What a kind's validator hands the editor: the canonical SVG and the line it shows when valid. */
export type TemplateCheck = { ok: true; svg: string; summary: string } | { ok: false; detail: string };

export interface TemplateKind {
  /** `badge` | `shadow` — the test-id prefix. */
  kind: string;
  heading: string;
  note: string;
  previewAlt: string;
  defaultSvg: string;
  maxLength: number;
  validate: (code: string) => TemplateCheck;
}

interface EditorProps { source: string; scope: string | null; onClose: () => void; onApply: (svg: string) => void }
interface DraftProps { spec: TemplateKind; draft: string; onDraft: (svg: string) => void; result: TemplateCheck }

/** This modal is portaled outside the parent settings dialog, which is inert until it closes. */
export default function UploadTemplateDialog(p: EditorProps & { spec: TemplateKind }) {
  const { spec } = p;
  const id = `upload-${spec.kind}-template`;
  const [draft, setDraft] = useState(p.source || spec.defaultSvg);
  const result = useMemo(() => spec.validate(draft), [spec, draft]);
  const dialog = useEditorFocus();
  return createPortal(<div className="svg-backdrop up-badge-template-backdrop" data-testid={`${id}-backdrop`}
    onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) p.onClose(); }}>
    <section ref={dialog} className="svg-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
      data-testid={`${id}-dialog`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => editorKey(e, p.onClose)}>
      <header className="svg-modal-head"><h2 id={`${id}-title`}>{spec.heading}{p.scope ? ` — ${p.scope}` : " — global defaults"}</h2></header>
      <div className="svg-modal-body">
        <p className="svg-note">{spec.note}</p>
        <TemplateDraft spec={spec} draft={draft} onDraft={setDraft} result={result} />
        <div className="svg-modal-actions">
          <button type="button" className="svg-btn" data-testid={`${id}-default`} onClick={() => setDraft(spec.defaultSvg)}>Restore default</button>
          <button type="button" className="svg-btn" data-testid={`${id}-cancel`} onClick={p.onClose}>Cancel</button>
          <button type="button" className="svg-btn primary" data-testid={`${id}-apply`} disabled={!result.ok}
            onClick={() => { if (result.ok) p.onApply(draft === spec.defaultSvg ? "" : result.svg); }}>Apply template</button>
        </div>
      </div>
    </section>
  </div>, document.body);
}

function TemplateDraft({ spec, draft, onDraft, result }: DraftProps) {
  const id = `upload-${spec.kind}-template`;
  return <div className="up-badge-template-grid">
    <div className="svg-field">
      <label className="svg-label" htmlFor={`${id}-code`}>SVG code</label>
      <textarea id={`${id}-code`} data-testid={`${id}-code`} className="svg-prompt up-badge-template-code"
        spellCheck={false} value={draft} maxLength={spec.maxLength} aria-invalid={!result.ok}
        aria-describedby={`${id}-status`} onChange={(e) => onDraft(e.target.value)} />
    </div>
    <div className="svg-field">
      <span className="svg-label">Template preview</span>
      <div className="up-badge-template-preview">
        {result.ok ? <img data-testid={`${id}-preview`} alt={spec.previewAlt}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`} /> : <span>Preview unavailable</span>}
      </div>
      <p id={`${id}-status`} role="status" aria-live="polite" className="svg-note"
        data-testid={result.ok ? `${id}-valid` : `${id}-error`}>
        {result.ok ? result.summary : result.detail}
      </p>
    </div>
  </div>;
}

/** Initial focus, background isolation and focus restoration belong to this modal's lifetime. */
function useEditorFocus() {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const parent = previous?.closest<HTMLElement>('[role="dialog"]');
    const wasInert = parent?.inert ?? false;
    if (parent) parent.inert = true;
    dialog.current?.querySelector("textarea")?.focus();
    return () => {
      if (parent) parent.inert = wasInert;
      previous?.focus();
    };
  }, []);
  return dialog;
}

function editorKey(e: KeyboardEvent<HTMLElement>, close: () => void): void {
  e.stopPropagation();
  if (e.key === "Escape") { e.preventDefault(); close(); return; }
  if (e.key !== "Tab") return;
  const fields = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("textarea, button:not(:disabled)"));
  const first = fields[0], last = fields[fields.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
}
