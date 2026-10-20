// UploadMetaDialog.tsx — confirmation before any paid Gemini metadata submission.
// Displays active per-task/per-scope default prompt above the preset list
// (upload-generate:single | batch, upload-regenerate:single | batch), syncs the
// outgoing prompt preview live, and sends the confirmed prompt without clobbering
// the tab editor's main prompt.

import { generateContentUrl, PROVIDER_NAME } from "../lib/upload/gemini";
import { scopeOfTask } from "../lib/taskprompts";
import { capPreviews, previewCaption } from "../lib/upload/sentpreview";
import { TaskPromptPicker, useTaskPromptSelection, type TaskPromptSelection } from "../ui/TaskPromptPicker";
import type { UploadApi } from "./useUpload";
import type { MetaDialog as MetaDialogModel } from "./types";

export default function UploadMetaDialog({ g, dialog }: { g: UploadApi; dialog: MetaDialogModel }) {
  const promptSel = useTaskPromptSelection({
    operation: dialog.mode === "regenerate" ? "upload-regenerate" : "upload-generate",
    scope: scopeOfTask(dialog.ids.length, 50, false),
    presets: g.presets,
    mainPrompt: g.prompt,
  });
  const handleConfirm = () => {
    promptSel.persistCurrent();
    g.confirmMetadata(promptSel.resolved.text);
  };
  return (
    <div className="svg-backdrop" data-testid="upload-meta-backdrop" onClick={g.dismissDialog}>
      <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="upload-meta-title"
        onClick={(e) => e.stopPropagation()}>
        <MetaDialogHead count={dialog.ids.length} mode={dialog.mode} thenExport={dialog.thenExport.length} onDismiss={g.dismissDialog} />
        <div className="svg-modal-body">
          <SentNote mode={dialog.mode} />
          <ThenExportNote count={dialog.thenExport.length} />
          <MetaFacts g={g} />
          <MetaPreviews dialog={dialog} />
          <MetaPrompt g={g} selection={promptSel} />
          <DialogActions onDismiss={g.dismissDialog} onConfirm={handleConfirm} disabled={dialog.preparing} mode={dialog.mode} />
        </div>
      </section>
    </div>
  );
}

function MetaDialogHead({ count, mode, thenExport, onDismiss }: {
  count: number; mode: MetaDialogModel["mode"]; thenExport: number; onDismiss: () => void;
}) {
  const icons = `icon${count === 1 ? "" : "s"}`;
  const action = mode === "regenerate" ? "Regenerate" : "Generate";
  return (
    <header className="svg-modal-head">
      <h2 id="upload-meta-title">
        {action} metadata for {count} {icons}
        {thenExport > 0 ? `, then export ${thenExport}` : ""}
      </h2>
      <button type="button" className="svg-btn tiny" data-testid="upload-meta-cancel" onClick={onDismiss}>Cancel</button>
    </header>
  );
}

function SentNote({ mode }: { mode: MetaDialogModel["mode"] }) {
  const replacement = mode === "regenerate"
    ? " A returned answer replaces the current text and is never auto-accepted; review it and fix validation errors before accepting. A provider failure keeps the existing text."
    : "";
  return (
    <p className="svg-note">
      Each icon's image is sent to Gemini inside this one request — nothing is uploaded
      automatically, and a timeout or disconnect is never resent on its own.{replacement}
    </p>
  );
}

function ThenExportNote({ count }: { count: number }) {
  if (count === 0) return null;
  const icons = `icon${count === 1 ? "" : "s"}`;
  return (
    <p className="svg-note" data-testid="upload-meta-then-export">
      Then <strong>export {count} {icons}</strong>.
      {" "}An answer that passes the policy is accepted as it lands, so the package really
      carries the metadata; an answer that breaks the policy stays a draft, and that icon
      exports without metadata. Nothing here is re-charged — an icon that already has
      metadata is exported, not generated again.
    </p>
  );
}

function MetaPrompt({ g, selection }: { g: UploadApi; selection: TaskPromptSelection }) {
  return (
    <>
      <TaskPromptPicker
        selection={selection}
        presets={g.presets}
        selectTestId="upload-meta-preset"
        defaultMsgTestId="upload-meta-default-prompt"
        label="Metadata prompt preset"
      />
      <p className="svg-note">The exact prompt that will be sent (the validator enforces every rule it states):</p>
      <textarea className="svg-code up-meta-prompt" readOnly data-testid="upload-meta-prompt"
        aria-label="The exact metadata prompt" value={selection.resolved.text} />
      <p className="svg-note">
        Request body: <code>{"{ contents: [{ role: \"user\", parts: [{ text: <the prompt> }, { inlineData: { mimeType: \"image/jpeg\", data: <the base64 preview shown above> } }] }] }"}</code>
        {" "}The image is sent exactly as previewed — one 512 px JPEG of each icon's own approved SVG.
      </p>
    </>
  );
}

function MetaPreviews({ dialog }: { dialog: MetaDialogModel }) {
  const { shown, hidden } = capPreviews(dialog.previews);
  if (dialog.preparing && dialog.previews.length === 0) {
    return <p className="svg-note" data-testid="upload-preview-busy">Rendering the 512 px JPEG that will be sent…</p>;
  }
  if (shown.length === 0) {
    return (
      <p className="svg-note error" data-testid="upload-preview-none">
        No image could be previewed — each icon is rendered from its own approved SVG at send time.
      </p>
    );
  }
  return (
    <div className="up-preview-strip" data-testid="upload-preview-strip">
      {shown.map((p) => (
        <figure className="up-preview-card" key={p.id}>
          <img className="up-preview-img" data-testid={`upload-preview-${p.id}`} src={p.image}
            alt={`${p.name} — the image sent to the model`} width={96} height={96} />
          <figcaption data-testid={`upload-preview-caption-${p.id}`}>{previewCaption(p)}</figcaption>
        </figure>
      ))}
      <p className="svg-note" data-testid="upload-preview-count">
        {previewCountText(shown.length, dialog.ids.length, hidden)}
      </p>
    </div>
  );
}

function previewCountText(shown: number, total: number, hidden: number): string {
  const rest = hidden > 0 ? ` The first ${shown} are shown; the other ${hidden} are sent the same way, from their own approved SVG.` : "";
  const missing = total - shown - hidden;
  const gaps = missing > 0 ? ` ${missing} icon(s) could not be previewed and are rendered at send time.` : "";
  return `${shown} of ${total} icon(s) previewed — each request carries its own icon's image.${rest}${gaps}`;
}

function DialogActions({ onDismiss, onConfirm, disabled, mode }: {
  onDismiss: () => void; onConfirm: () => void; disabled: boolean; mode: MetaDialogModel["mode"];
}) {
  const label = mode === "regenerate" ? "↻ Regenerate metadata" : "✦ Generate metadata";
  return (
    <div className="up-dialog-actions">
      <button type="button" className="svg-btn" data-testid="upload-meta-dismiss" onClick={onDismiss}>Cancel</button>
      <button type="button" className="svg-btn primary" data-testid="upload-meta-confirm" onClick={onConfirm} disabled={disabled}
        title={disabled ? "Rendering the images this request will carry…" : "Send the exact request shown above"}>
        {label}
      </button>
    </div>
  );
}

function MetaFacts({ g }: { g: UploadApi }) {
  return (
    <div className="svg-facts">
      <div className="svg-fact"><span>Provider</span><strong data-testid="upload-meta-provider">{PROVIDER_NAME} · {g.gemini.model}</strong></div>
      <div className="svg-fact"><span>Endpoint</span><strong data-testid="upload-meta-endpoint">{generateContentUrl(g.gemini.baseUrl, g.gemini.model)}</strong></div>
      <div className="svg-fact"><span>Auth</span><strong>x-goog-api-key header — the key never enters a URL or a log</strong></div>
      <div className="svg-fact"><span>Retries</span><strong>{g.gemini.retries} · only provider-confirmed failures</strong></div>
    </div>
  );
}
