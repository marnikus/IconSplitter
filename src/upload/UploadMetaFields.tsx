// UploadMetaFields.tsx — the editable, copiable metadata fields below an
// active row (design §2.13): Title, Description and the 40 Tags, EMPTY until
// generated, each with its own copy button. Accept re-validates the edited
// text and refuses with the exact rule violations; the last validation's
// errors and warnings show under the fields. Nothing here writes files: the
// accepted text persists in the pair's export.json at the next export commit.

import { countWords, type IconMetadata, type MetadataValidation } from "../lib/upload/meta";
import type { UploadMetaState } from "./types";

export interface UploadMetaFieldsProps {
  id: string;
  meta: UploadMetaState;
  onEdit: (patch: Partial<IconMetadata>) => void;
  onAccept: () => void;
  onCopy: (field: "title" | "description" | "tags") => void;
  onRegenerate: () => void;
}

export default function UploadMetaFields({ id, meta, onEdit, onAccept, onCopy, onRegenerate }: UploadMetaFieldsProps) {
  if (meta.metadata === null) {
    return (
      <div className="up-meta" data-testid={`upload-meta-empty-${id}`}>
        <p className="up-meta-hint">
          No metadata yet — generate it with Gemini (the icon's image is sent only inside that
          one request), or export without metadata.
        </p>
        {meta.detail !== "" && <p className="up-meta-detail" data-testid={`upload-meta-detail-${id}`}>{meta.detail}</p>}
        <div className="up-meta-actions">
          <button type="button" className="svg-btn tiny primary" data-testid={`upload-meta-gen-${id}`} onClick={onRegenerate}>
            ✦ Generate metadata
          </button>
        </div>
      </div>
    );
  }
  const m = meta.metadata;
  return (
    <div className="up-meta" data-testid={`upload-meta-fields-${id}`}>
      <MetaFieldsGrid id={id} m={m} onEdit={onEdit} onCopy={onCopy} />
      <ValidationLine id={id} validation={meta.validation} />
      <MetaActions id={id} meta={meta} onAccept={onAccept} onRegenerate={onRegenerate} />
    </div>
  );
}

/** The three editable fields, each with its live count and copy button. */
function MetaFieldsGrid({ id, m, onEdit, onCopy }: {
  id: string; m: IconMetadata; onEdit: (patch: Partial<IconMetadata>) => void;
  onCopy: (field: "title" | "description" | "tags") => void;
}) {
  return (
    <>
      <Field id={id} label="Title" testid="title" value={m.title} count={countWords(m.title)}
        hint="two sentences: 5–7 words, then 3–5 words naming two of the tags"
        onEdit={(v) => onEdit({ title: v })} onCopy={() => onCopy("title")} />
      <Field id={id} label="Description" testid="description" value={m.description} count={countWords(m.description)}
        hint="7–15 words" multiline
        onEdit={(v) => onEdit({ description: v })} onCopy={() => onCopy("description")} />
      <Field id={id} label="Tags" testid="tags" value={m.tags.join(", ")} count={m.tags.length}
        hint="exactly 40 unique, comma-separated, including icon, pictogram, vector, stroke, line, editable, web"
        multiline onEdit={(v) => onEdit({ tags: v.split(",").map((t) => t.trim()).filter((t) => t !== "") })}
        onCopy={() => onCopy("tags")} />
    </>
  );
}

/** The state line, the usage, the last failure, and the accept/regenerate pair. */
function MetaActions({ id, meta, onAccept, onRegenerate }: {
  id: string; meta: UploadMetaState; onAccept: () => void; onRegenerate: () => void;
}) {
  return (
    <div className="up-meta-actions">
      <span className="up-meta-state" data-testid={`upload-meta-state-${id}`}>{stateLabel(meta)}</span>
      {meta.usage.total !== null && (
        <span className="up-meta-usage" data-testid={`upload-meta-usage-${id}`}>{meta.usage.total} tokens · no cost reported</span>
      )}
      {meta.detail !== "" && <span className="up-meta-detail" data-testid={`upload-meta-detail-${id}`}>{meta.detail}</span>}
      <button type="button" className="svg-btn tiny" data-testid={`upload-meta-regen-${id}`} onClick={onRegenerate}>↻ Regenerate</button>
      <button type="button" className="svg-btn tiny success" data-testid={`upload-meta-accept-${id}`} onClick={onAccept}
        disabled={meta.state === "accepted" && !meta.edited}>✓ Accept</button>
    </div>
  );
}

/** One editable field with its live count and its own copy button. */
function Field({ id, label, testid, value, count, hint, multiline, onEdit, onCopy }: {
  id: string; label: string; testid: string; value: string; count: number; hint: string;
  multiline?: boolean; onEdit: (v: string) => void; onCopy: () => void;
}) {
  const common = {
    className: "svg-input", "data-testid": `upload-meta-${testid}-${id}`, "aria-label": label,
    spellCheck: false, value, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onEdit(e.target.value),
  } as const;
  return (
    <div className="svg-field up-meta-field">
      <span className="svg-label">{label} · {count}</span>
      {multiline
        ? <textarea {...common} rows={2} />
        : <input {...common} type="text" />}
      <button type="button" className="svg-btn tiny" data-testid={`upload-copy-${testid}-${id}`}
        title={`Copy the ${label.toLowerCase()}`} onClick={onCopy}>Copy</button>
      <small className="up-hint">{hint}</small>
    </div>
  );
}

/** The last validation's errors (red) and warnings (yellow), never silent. */
function ValidationLine({ id, validation }: { id: string; validation: MetadataValidation | null }) {
  if (validation === null) return null;
  return (
    <div className="up-meta-validation" data-testid={`upload-meta-validation-${id}`}>
      {validation.errors.map((e) => <p key={e} className="error">{e}</p>)}
      {validation.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
    </div>
  );
}

/** The one honest sentence about where the metadata stands. */
function stateLabel(meta: UploadMetaState): string {
  switch (meta.state) {
    case "empty": return "empty";
    case "pending": return "generating…";
    case "generated": return "generated — review, edit, then accept";
    case "invalid": return "invalid — fix the fields or regenerate";
    case "accepted": return meta.edited ? "accepted — edited, accept again to re-embed" : "accepted";
    case "interrupted": return "interrupted — the outcome is unknown, generate again to retry";
  }
}
