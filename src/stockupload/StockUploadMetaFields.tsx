// StockUploadMetaFields.tsx — local editable metadata fields for an exported
// item (Title, Description, Tags, Creator, Copyright) + Accept & re-embed.

import { countWords, dedupeTags, type IconMetadata, type MetadataValidation } from "../lib/upload/meta";
import UploadMetaRights from "../upload/UploadMetaRights";
import type { StockMetaDraft } from "./rowlist";

export interface StockUploadMetaFieldsProps {
  id: string;
  draft: StockMetaDraft;
  onEdit: (patch: Partial<IconMetadata>) => void;
  onAccept: () => void;
  onCopy: (field: "title" | "description" | "tags") => void;
}

export default function StockUploadMetaFields({ id, draft, onEdit, onAccept, onCopy }: StockUploadMetaFieldsProps) {
  const m = draft.metadata;
  return (
    <div className="up-meta" data-testid={`stock-meta-fields-${id}`}>
      <MetaField id={id} label="Title" slug="title" value={m.title} count={countWords(m.title)}
        hint="At least 5 words, sentence case, no trailing period"
        onChange={(v) => onEdit({ title: v })} onCopy={() => onCopy("title")} />
      <MetaField id={id} label="Description" slug="description" value={m.description} count={countWords(m.description)}
        hint="At least 7 words, sentence case, no trailing period" multiline
        onChange={(v) => onEdit({ description: v })} onCopy={() => onCopy("description")} />
      <MetaField id={id} label="Tags" slug="tags" value={m.tags.join(", ")} count={m.tags.length}
        hint="At least 10 unique lowercase tags including icon, pictogram, vector, stroke, line, editable, web"
        multiline onChange={(v) => onEdit({ tags: dedupeTags(v.split(",").map((t) => t.trim()).filter(Boolean)) })}
        onCopy={() => onCopy("tags")} />
      <UploadMetaRights id={id} metadata={m} onEdit={onEdit} />
      <ValidationView id={id} validation={draft.validation} />
      <div className="up-meta-actions">
        <span className="up-meta-state" data-testid={`stock-meta-state-${id}`}>{statusText(draft)}</span>
        {draft.detail !== "" && <span className="up-meta-detail" data-testid={`stock-meta-detail-${id}`}>{draft.detail}</span>}
        <button type="button" className="svg-btn tiny success" data-testid={`stock-meta-accept-${id}`}
          disabled={draft.state === "accepted" && !draft.edited} onClick={onAccept}>
          ✓ Accept & embed
        </button>
      </div>
    </div>
  );
}

function statusText(draft: StockMetaDraft): string {
  if (draft.state === "accepted") return draft.edited ? "accepted — edited, click Accept & embed to update files" : "accepted";
  return draft.state === "invalid" ? "invalid — fix fields before embedding" : "empty — enter metadata to embed into export/ files";
}

function MetaField(p: {
  id: string; label: string; slug: string; value: string; count: number;
  hint: string; multiline?: boolean; onChange: (v: string) => void; onCopy: () => void;
}) {
  const inputProps = {
    className: "svg-input", "data-testid": `stock-meta-${p.slug}-${p.id}`, "aria-label": p.label,
    spellCheck: false, value: p.value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => p.onChange(e.target.value),
  } as const;
  return (
    <div className="svg-field up-meta-field">
      <span className="svg-label">{p.label} · {p.count}</span>
      {p.multiline ? <textarea {...inputProps} rows={2} /> : <input {...inputProps} type="text" />}
      <button type="button" className="svg-btn tiny" data-testid={`stock-copy-${p.slug}-${p.id}`} onClick={p.onCopy}>Copy</button>
      <small className="up-hint">{p.hint}</small>
    </div>
  );
}

function ValidationView({ id, validation }: { id: string; validation: MetadataValidation | null }) {
  if (validation === null) return null;
  return (
    <div className="up-meta-validation" data-testid={`stock-meta-validation-${id}`}>
      {validation.errors.map((e) => <p key={e} className="error">{e}</p>)}
      {validation.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
    </div>
  );
}
