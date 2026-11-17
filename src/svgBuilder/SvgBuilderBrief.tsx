// SvgBuilderBrief.tsx — "Prompt brief" / "Corrected brief" dialog (reference
// layout): Brief | Raw prompt switch, Copy prompt, a section nav, and a
// copy-ready markdown prompt with its character count. Escape / backdrop close.
import { useEffect, useState } from "react";
import { BRIEF_SECTIONS, briefMarkdown } from "./briefText";

type View = "brief" | "raw";

export default function SvgBuilderBrief({ onClose, onCopied }: { onClose: () => void; onCopied: (msg: string, error?: boolean) => void }) {
  const [view, setView] = useState<View>("brief");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(briefMarkdown());
      setCopied(true); onCopied("Generation prompt copied to clipboard");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setView("raw"); onCopied("Clipboard access was blocked — select the raw prompt to copy it.", true);
    }
  };
  return <div className="bld-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="bld-modal bld-brief" data-testid="builder-brief-dialog" role="dialog" aria-modal="true" aria-label="Generation brief">
      <BriefHead view={view} setView={setView} copied={copied} onCopy={() => { void copy(); }} onClose={onClose} />
      {view === "brief" ? <BriefBody /> : <RawBody />}
    </section>
  </div>;
}

function BriefHead({ view, setView, copied, onCopy, onClose }: {
  view: View; setView: (v: View) => void; copied: boolean; onCopy: () => void; onClose: () => void;
}) {
  return <div className="bld-modal-head">
    <div><span className="bld-eyebrow">GENERATION BRIEF v1.0</span><h3>Corrected, scoped and ready for a build model</h3></div>
    <div className="bld-header-actions">
      <div className="v2-date-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === "brief"} className={view === "brief" ? "active" : ""} data-testid="builder-brief-tab-brief" onClick={() => setView("brief")}>Brief</button>
        <button type="button" role="tab" aria-selected={view === "raw"} className={view === "raw" ? "active" : ""} data-testid="builder-brief-tab-raw" onClick={() => setView("raw")}>Raw prompt</button>
      </div>
      <button type="button" className="svg-btn primary" data-testid="builder-brief-copy" onClick={onCopy}>{copied ? "Copied" : "Copy prompt"}</button>
      <button type="button" className="svg-btn ghost tiny" data-testid="builder-brief-close" aria-label="Close" onClick={onClose}>✕</button>
    </div>
  </div>;
}

function BriefBody() {
  return <div className="bld-brief-grid">
    <nav className="bld-brief-nav" aria-label="In this brief">
      <div className="svg-field-label"><span>In this brief</span></div>
      {BRIEF_SECTIONS.map((s, i) => <a key={s.id} href={`#bld-brief-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`bld-brief-${s.id}`)?.scrollIntoView({ behavior: "smooth" }); }}>
        {String(i + 1).padStart(2, "0")} {s.title}</a>)}
    </nav>
    <div className="bld-brief-main" data-testid="builder-brief-text">
      {BRIEF_SECTIONS.map((s, i) => <section key={s.id} id={`bld-brief-${s.id}`} className="bld-card">
        <span className="bld-eyebrow">{String(i + 1).padStart(2, "0")}</span><h4>{s.title}</h4>
        <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
      </section>)}
    </div>
  </div>;
}

function RawBody() {
  const text = briefMarkdown();
  return <div className="bld-raw">
    <div className="svg-field-label"><span>copy-ready / markdown</span><span data-testid="builder-brief-count">{text.length} chars</span></div>
    <pre className="bld-raw-text" data-testid="builder-brief-raw">{text}</pre>
  </div>;
}
