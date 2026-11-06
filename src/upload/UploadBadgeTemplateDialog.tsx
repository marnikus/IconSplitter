import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { BADGE_TEMPLATE_MAX_LENGTH, DEFAULT_BADGE_TEMPLATE, validateBadgeTemplate, type TemplateResult } from "../lib/upload/badgetemplate";

interface EditorProps { source: string; scope: string | null; onClose: () => void; onApply: (svg: string) => void }
interface DraftProps { draft: string; onDraft: (svg: string) => void; result: TemplateResult }

/** This modal is portaled outside the parent settings dialog, which is inert until it closes. */
export default function UploadBadgeTemplateDialog(p: EditorProps) {
  const [draft, setDraft] = useState(p.source || DEFAULT_BADGE_TEMPLATE);
  const result = useMemo(() => validateBadgeTemplate(draft), [draft]);
  const dialog = useEditorFocus();
  return createPortal(<div className="svg-backdrop up-badge-template-backdrop" data-testid="upload-badge-template-backdrop"
    onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) p.onClose(); }}>
    <section ref={dialog} className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="upload-badge-template-title"
      data-testid="upload-badge-template-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => editorKey(e, p.onClose)}>
      <header className="svg-modal-head"><h2 id="upload-badge-template-title">Badge SVG template{p.scope ? ` — ${p.scope}` : " — global defaults"}</h2></header>
      <div className="svg-modal-body">
        <p className="svg-note">Paste a complete vector SVG with a viewBox. Paths, basic shapes, groups and supported gradients are preserved.
          Outline text first; images, scripts, external resources and unsupported effects cannot be used. Applying a template never turns a badge on.</p>
        <TemplateDraft draft={draft} onDraft={setDraft} result={result} />
        <div className="svg-modal-actions">
          <button type="button" className="svg-btn" data-testid="upload-badge-template-default" onClick={() => setDraft(DEFAULT_BADGE_TEMPLATE)}>Restore default</button>
          <button type="button" className="svg-btn" data-testid="upload-badge-template-cancel" onClick={p.onClose}>Cancel</button>
          <button type="button" className="svg-btn primary" data-testid="upload-badge-template-apply" disabled={!result.ok}
            onClick={() => { if (result.ok) p.onApply(draft === DEFAULT_BADGE_TEMPLATE ? "" : result.svg); }}>Apply template</button>
        </div>
      </div>
    </section>
  </div>, document.body);
}

function TemplateDraft({ draft, onDraft, result }: DraftProps) {
  return <div className="up-badge-template-grid">
    <div className="svg-field">
      <label className="svg-label" htmlFor="upload-badge-template-code">SVG code</label>
      <textarea id="upload-badge-template-code" data-testid="upload-badge-template-code" className="svg-prompt up-badge-template-code"
        spellCheck={false} value={draft} maxLength={BADGE_TEMPLATE_MAX_LENGTH} aria-invalid={!result.ok}
        aria-describedby="upload-badge-template-status" onChange={(e) => onDraft(e.target.value)} />
    </div>
    <div className="svg-field">
      <span className="svg-label">Template preview</span>
      <div className="up-badge-template-preview">
        {result.ok ? <img data-testid="upload-badge-template-preview" alt="Badge template preview"
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`} /> : <span>Preview unavailable</span>}
      </div>
      <p id="upload-badge-template-status" role="status" aria-live="polite" className="svg-note"
        data-testid={result.ok ? "upload-badge-template-valid" : "upload-badge-template-error"}>
        {result.ok ? `Valid vector SVG · ${result.bounds.width} × ${result.bounds.height}. Changes are saved only when applied.` : result.detail}
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
