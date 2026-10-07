// UploadMetaDialog.tsx — the exact request, shown before any paid submission
// (design §2.4/§5): the four facts, the images the request will carry (one per
// selected icon, each rendered from its OWN approved SVG and sent unchanged),
// the exact prompt, and the two buttons. Send is held back until those images
// are ready, so nothing is ever paid for before the user can see it.

import { generateContentUrl, PROVIDER_NAME } from "../lib/upload/gemini";
import { capPreviews, previewCaption } from "../lib/upload/sentpreview";
import type { UploadApi } from "./useUpload";
import type { MetaDialog as MetaDialogModel } from "./types";


/** The exact request, shown before any paid submission (design §2.4/§5). */
export default function UploadMetaDialog({ g, dialog }: { g: UploadApi; dialog: MetaDialogModel }) {
  const ids = dialog.ids;
  return (
    <div className="svg-backdrop" data-testid="upload-meta-backdrop" onClick={g.dismissDialog}>
      <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="upload-meta-title"
        onClick={(e) => e.stopPropagation()}>
        <header className="svg-modal-head">
          <h2 id="upload-meta-title">Generate metadata for {ids.length} icon{ids.length === 1 ? "" : "s"}</h2>
          <button type="button" className="svg-btn tiny" data-testid="upload-meta-cancel" onClick={g.dismissDialog}>Cancel</button>
        </header>
        <div className="svg-modal-body">
          <p className="svg-note">
            Each icon's image is sent to Gemini inside this one request — nothing is uploaded
            automatically, and a timeout or disconnect is never resent on its own.
          </p>
          <MetaFacts g={g} />
          <MetaPreviews dialog={dialog} />
          <p className="svg-note">The exact prompt that will be sent (the validator enforces every rule it states):</p>
          <textarea className="svg-code up-meta-prompt" readOnly data-testid="upload-meta-prompt"
            aria-label="The exact metadata prompt" value={g.prompt} />
          <p className="svg-note">
            Request body: <code>{"{ contents: [{ role: \"user\", parts: [{ text: <the prompt> }, { inlineData: { mimeType: \"image/jpeg\", data: <the base64 preview shown above> } }] }] }"}</code>
            {" "}The image is sent exactly as previewed — one 512 px JPEG of each icon's own approved SVG.
          </p>
          <DialogActions onDismiss={g.dismissDialog} onConfirm={g.confirmMetadata} disabled={dialog.preparing} />
        </div>
      </section>
    </div>
  );
}

/**
 * The images the request will carry, one per selected icon, each labelled with
 * the file it came from (design §2.4): the bytes below ARE the bytes sent, so a
 * wrong or stale picture is visible before anything is paid for. Bounded
 * (PREVIEW_LIMIT) and honest about what it left out.
 */
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

/** One honest sentence about how many icons this strip shows an image for. */
function previewCountText(shown: number, total: number, hidden: number): string {
  const rest = hidden > 0 ? ` The first ${shown} are shown; the other ${hidden} are sent the same way, from their own approved SVG.` : "";
  const missing = total - shown - hidden;
  const gaps = missing > 0 ? ` ${missing} icon(s) could not be previewed and are rendered at send time.` : "";
  return `${shown} of ${total} icon(s) previewed — each request carries its own icon's image.${rest}${gaps}`;
}

/** Confirm sends; dismiss only closes — the request is never sent twice. */
function DialogActions({ onDismiss, onConfirm, disabled }: {
  onDismiss: () => void; onConfirm: () => void; disabled: boolean;
}) {
  return (
    <div className="up-dialog-actions">
      <button type="button" className="svg-btn" data-testid="upload-meta-dismiss" onClick={onDismiss}>Cancel</button>
      <button type="button" className="svg-btn primary" data-testid="upload-meta-confirm" onClick={onConfirm} disabled={disabled}
        title={disabled ? "Rendering the images this request will carry…" : "Send the exact request shown above"}>
        ✦ Generate metadata
      </button>
    </div>
  );
}

/** The four facts the confirmation states: provider, endpoint, auth, retries. */
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
