// UploadPanel.tsx — the SVG-to-upload tab (design §4/§5/§7/§8/§9): the folder
// bar, the global defaults bar, the bulk bar (apply-to-selected in ONE undoable
// entry, export selected, rescan), the row list with per-row metadata editing,
// the Gemini provider card (key masked, exact-request preview before anything
// is sent) and the toast. The panel owns no rule of its own — discovery, the
// model, the job and the undo path all live in tested modules; this file is
// the wiring that makes them one screen.

import { useState } from "react";
import { isDefaultMetaPrompt, DEFAULT_META_PROMPT } from "../lib/upprompt";
import { geminiProviderLabel } from "../lib/gemconfig";
import { maskKey } from "../lib/svgsecret";
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import { loadMetaCache } from "./stores";
import type { UploadRow } from "./statemodel";
import type { UploadApi } from "./useUpload";
import UploadRowView from "./UploadRow";

export default function UploadPanel({ u }: { u: UploadApi }) {
  const [confirm, setConfirm] = useState(false);
  if (!u.supported) return <Unsupported u={u} />;
  const checkedRows = u.m.rows.filter((r) => u.checked.includes(r.source.id));
  return (
    <div className="upload-panel" data-testid="upload-panel">
      <header className="upload-head">
        <OpenFolderButton testid="upload-open-folder" onClick={u.chooseRoot} />
        <FolderPathRow rootName={u.rootName} testid="upload-folder-path" />
        <button type="button" className="upload-btn" data-testid="upload-rescan" onClick={u.rescan}>Rescan</button>
        <span className="upload-busy" data-testid="upload-busy">{u.busy ?? ""}</span>
      </header>
      <DefaultsBar u={u} />
      <BulkBar u={u} onExport={() => setConfirm(true)} count={checkedRows.length} />
      <RowList u={u} />
      <ProviderCard u={u} />
      {u.m.toast !== null && <div className="upload-toast" data-testid="upload-toast" role="status">{u.m.toast}</div>}
      {confirm && (
        <ConfirmDialog u={u} rows={checkedRows} onClose={() => setConfirm(false)} />
      )}
    </div>
  );
}

/** The File System Access API gate — the tab explains itself when missing. */
function Unsupported({ u }: { u: UploadApi }) {
  return (
    <section className="upload-panel upload-center" data-testid="upload-unsupported">
      <p>Exporting needs the File System Access API — Chrome or Edge.</p>
      <button type="button" className="upload-btn ghost" onClick={u.chooseRoot}>Try anyway</button>
    </section>
  );
}

function RowList({ u }: { u: UploadApi }) {
  return (
    <div className="upload-list" role="list" data-testid="upload-list">
      {u.visible.map((row) => (
        <UploadRowView key={row.source.id} row={row} a={u} />
      ))}
      {u.visible.length === 0 && <EmptyNote rootName={u.rootName} />}
    </div>
  );
}

function EmptyNote({ rootName }: { rootName: string }) {
  return (
    <p className="upload-empty" data-testid="upload-empty">
      {rootName === "" ? "Pick the folder your approved pairs live in." : "No exportable icons — an approved pair needs an approved SVG version."}
    </p>
  );
}

/** The global defaults bar — every field clamped on the way in (RULE 13). */
function DefaultsBar({ u }: { u: UploadApi }) {
  const d = u.m.defaults;
  return (
    <section className="upload-defaults" data-testid="upload-defaults">
      <Num label="Padding %" field="paddingPct" value={d.paddingPct} step={1} u={u} />
      <Num label="Stroke (pt)" field="strokePt" value={d.strokePt} step={0.1} u={u} />
      <Num label="JPEG MP" field="jpegMpx" value={d.jpegMpx} step={0.1} u={u} />
      <Num label="JPEG quality" field="jpegQuality" value={d.jpegQuality} step={0.01} u={u} />
      <select data-testid="upload-default-artboard" value={d.artboard}
        aria-label="Artboard" onChange={(e) => u.setDefault("artboard", e.target.value as "square" | "fit")}>
        <option value="square">Square artboard</option>
        <option value="fit">Fit content</option>
      </select>
      <label className="upload-toggle">
        <input type="checkbox" data-testid="upload-default-optimize" checked={d.optimizeSvg}
          onChange={(e) => u.setDefault("optimizeSvg", e.target.checked)} /> Optimize SVG
      </label>
      <label className="upload-toggle">
        <input type="checkbox" data-testid="upload-default-eps" checked={d.includeEps}
          onChange={(e) => u.setDefault("includeEps", e.target.checked)} /> Include EPS
      </label>
    </section>
  );
}

function Num({ label, field, value, step, u }: { label: string; field: "paddingPct" | "strokePt" | "jpegMpx" | "jpegQuality"; value: number; step: number; u: UploadApi }) {
  return (
    <label className="upload-num">
      {label}
      <input type="number" data-testid={`upload-default-${field}`} value={value} step={step}
        onChange={(e) => u.setDefault(field, e.target.value)} />
    </label>
  );
}

function BulkBar({ u, onExport, count }: { u: UploadApi; onExport: () => void; count: number }) {
  return (
    <section className="upload-bulk" data-testid="upload-bulk">
      <button type="button" data-testid="upload-check-all"
        onClick={() => u.checkAll(u.visible.map((r) => r.source.id), true)}>Check all</button>
      <button type="button" data-testid="upload-check-none"
        onClick={() => u.checkAll(u.visible.map((r) => r.source.id), false)}>Check none</button>
      <button type="button" data-testid="upload-apply-settings" disabled={count === 0}
        onClick={() => u.applyToSelected({
          paddingPct: u.m.defaults.paddingPct, strokePt: u.m.defaults.strokePt,
          jpegMpx: u.m.defaults.jpegMpx, jpegQuality: u.m.defaults.jpegQuality,
          optimizeSvg: u.m.defaults.optimizeSvg, includeEps: u.m.defaults.includeEps,
          artboard: u.m.defaults.artboard,
        })}>
        Apply settings to selected
      </button>
      <button type="button" className="primary" data-testid="upload-export" disabled={count === 0} onClick={onExport}>
        Export selected ({count})
      </button>
      <span data-testid="upload-counts">{u.m.rows.length} icon(s) · {u.m.rows.filter((r) => r.source.exportState === "processed").length} processed</span>
    </section>
  );
}

/** The Gemini provider card: key (masked), tunables, prompt — RULE 20 throughout. */
function ProviderCard({ u }: { u: UploadApi }) {
  const [keyDraft, setKeyDraft] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <section className="upload-provider" data-testid="upload-provider">
      <button type="button" data-testid="upload-provider-toggle" onClick={() => setOpen(!open)}>
        {geminiProviderLabel(u.gemini)} · key: {u.key === null ? "not set" : maskKey(u.key)}
      </button>
      {open && (
        <div className="upload-provider-body">
          <KeyFields u={u} draft={keyDraft} setDraft={setKeyDraft} />
          <Field label="Endpoint" testid="upload-endpoint" value={u.gemini.endpoint}
            onChange={(v) => u.setGemini({ endpoint: v })} />
          <Field label="Model" testid="upload-model" value={u.gemini.model}
            onChange={(v) => u.setGemini({ model: v })} />
          <Field label="Timeout (s)" testid="upload-timeout" type="number" value={u.gemini.timeoutS}
            onChange={(v) => u.setGemini({ timeoutS: Number(v) })} />
          <Field label="Concurrency" testid="upload-concurrency" type="number" value={u.gemini.concurrency}
            onChange={(v) => u.setGemini({ concurrency: Number(v) })} />
          <PromptField u={u} />
        </div>
      )}
    </section>
  );
}

/** The key row: typed once, masked everywhere, stored by the browser only. */
function KeyFields({ u, draft, setDraft }: { u: UploadApi; draft: string; setDraft: (v: string) => void }) {
  return (
    <>
      <label className="upload-key">
        Gemini API key
        <input type="password" data-testid="upload-key-input" value={draft}
          placeholder="stored in this browser only — never in a report or the repository"
          onChange={(e) => setDraft(e.target.value)} />
      </label>
      <button type="button" data-testid="upload-key-save"
        onClick={() => { u.saveKey(draft); setDraft(""); }}>Save key</button>
      <button type="button" data-testid="upload-key-clear" onClick={() => u.saveKey("")}>Clear key</button>
    </>
  );
}

/** One labelled text input — the tunables share this shape. */
function Field(p: { label: string; testid: string; value: string | number; type?: string; onChange: (v: string) => void }) {
  return (
    <label>{p.label}
      <input type={p.type ?? "text"} data-testid={p.testid} value={p.value}
        onChange={(e) => p.onChange(e.target.value)} />
    </label>
  );
}

function PromptField({ u }: { u: UploadApi }) {
  return (
    <>
      <label>Prompt
        <textarea data-testid="upload-prompt" rows={6} value={u.prompt}
          onChange={(e) => u.setPrompt(e.target.value)} />
      </label>
      <button type="button" data-testid="upload-prompt-reset" disabled={isDefaultMetaPrompt(u.prompt)}
        onClick={() => u.setPrompt(DEFAULT_META_PROMPT)}>Reset prompt to default</button>
    </>
  );
}

/** The exact-request confirmation before anything is sent (design §7). */
function ConfirmDialog({ u, rows, onClose }: { u: UploadApi; rows: UploadRow[]; onClose: () => void }) {
  // The cache counts as accepted: only rows with neither need the paid call.
  const cache = loadMetaCache();
  const pending = rows.filter((r) => r.metadata === null && (r.source.svgFingerprint === null || cache[r.source.svgFingerprint] === undefined));
  const aiCount = pending.length;
  const needKey = aiCount > 0 && u.key === null;
  const preview = aiCount > 0 ? u.requestPreview(pending[0].source) : null;
  return (
    <div className="upload-dialog-wrap" role="dialog" aria-modal="true" data-testid="upload-confirm">
      <div className="upload-dialog">
        <h3>Export {rows.length} icon{rows.length === 1 ? "" : "s"}</h3>
        <p data-testid="upload-confirm-summary">
          {rows.length} package(s) will be written into each pair folder&apos;s export/ directory.
        </p>
        <AiNote count={aiCount} preview={preview} needKey={needKey} />
        <DialogActions u={u} needKey={needKey} onClose={onClose} />
      </div>
    </div>
  );
}

/** The AI disclosure: what will be sent, redacted, and what it needs first. */
function AiNote({ count, preview, needKey }: { count: number; preview: string | null; needKey: boolean }) {
  if (count === 0) return null;
  return (
    <>
      <p data-testid="upload-confirm-ai">
        {count} icon(s) have no accepted metadata — the Gemini request below will be sent for each
        (image attached at send time; cost is an estimate from the versioned rate card).
      </p>
      {preview !== null && <pre data-testid="upload-confirm-request">{preview}</pre>}
      {needKey && <p className="upload-warn">A Gemini API key is required for metadata generation — set it in the provider card first.</p>}
    </>
  );
}

function DialogActions({ u, needKey, onClose }: { u: UploadApi; needKey: boolean; onClose: () => void }) {
  return (
    <div className="upload-dialog-actions">
      <button type="button" data-testid="upload-confirm-cancel" onClick={onClose}>Cancel</button>
      <button type="button" className="primary" data-testid="upload-confirm-ok" disabled={needKey}
        onClick={() => { onClose(); void u.exportSelected(true); }}>Export</button>
    </div>
  );
}
