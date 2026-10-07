// UploadRow.tsx — one exportable icon per row (design §4/§8/§9): checkbox,
// file identity + path + chosen version, the export state chip, the metadata
// state chip, the row's warnings, the inherited/overridden settings summary
// with its per-icon editor, and the editable metadata fields under the row —
// empty until accepted, validated live (an invalid edit cannot export). The
// row owns no rule of its own; it reads the model and dispatches.

import { useState } from "react";
import { validateMetadata, type IconMetadata } from "../lib/upmeta";
import { overriddenFields, type ExportOverride } from "../lib/upsettings";
import type { UploadRow } from "./statemodel";
import type { UploadApi } from "./useUpload";

const EXPORT_LABEL: Record<UploadRow["source"]["exportState"], string> = {
  discovered: "Not exported", interrupted: "Interrupted — needs review", processed: "Processed",
  partial: "Partial", failed: "Failed", cancelled: "Cancelled", stale: "Stale",
};

const META_LABEL: Record<UploadRow["metaState"], string> = { empty: "No metadata", pending: "Generating…", accepted: "Accepted" };

export default function UploadRowView({ row, a }: { row: UploadRow; a: UploadApi }) {
  const s = row.source;
  const id = s.id;
  const checked = a.checked.includes(id);
  const [open, setOpen] = useState(false);
  return (
    <div role="listitem" data-testid={`upload-row-${id}`}
      className={`upload-row ${s.exportState}${checked ? " selected" : ""}${s.warnings.length > 0 ? " warn" : ""}`}>
      <input type="checkbox" data-testid={`upload-check-${id}`} checked={checked}
        aria-label={`Select ${s.name}`} onChange={() => a.toggleCheck(id)} />
      <button type="button" className="upload-expand" data-testid={`upload-expand-${id}`}
        onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "▾" : "▸"}</button>
      <div className="upload-file">
        <div className="upload-name" data-testid={`upload-name-${id}`}>{s.iconBase}</div>
        <div className="upload-path" data-testid={`upload-path-${id}`} title={s.svgRelPath}>{s.svgRelPath}</div>
        <div className="upload-version" data-testid={`upload-version-${id}`}>v{s.version} · {s.svgName}</div>
      </div>
      <span className={`chip export-${s.exportState}`} data-testid={`upload-export-${id}`}>{EXPORT_LABEL[s.exportState]}</span>
      <span className={`chip meta-${row.metaState}`} data-testid={`upload-meta-${id}`}>{META_LABEL[row.metaState]}</span>
      <span className="upload-warn" data-testid={`upload-warn-${id}`}>{s.warnings.join(", ")}</span>
      <MetaEditor row={row} a={a} open={open} />
    </div>
  );
}

/** The editable, copyable metadata fields under the previews (design §8). */
function MetaEditor({ row, a, open }: { row: UploadRow; a: UploadApi; open: boolean }) {
  const s = row.source;
  const init = initialDraft(row);
  const [title, setTitle] = useState(init.title);
  const [description, setDescription] = useState(init.description);
  const [tags, setTags] = useState(init.tags);
  const meta = draftOf(title, description, tags);
  const issues = meta === null ? [] : validateMetadata(meta).map((i) => `${i.field}: ${i.problem}`);
  const canAccept = meta !== null && issues.length === 0;
  if (!open) return null;
  return (
    <div className="upload-meta-editor" data-testid={`upload-meta-editor-${s.id}`}>
      <MetaFields id={s.id} title={title} description={description} tags={tags}
        onTitle={setTitle} onDescription={setDescription} onTags={setTags} />
      <div className="upload-meta-issues" data-testid={`upload-meta-issues-${s.id}`}>
        {issuesText(title, description, issues)}
      </div>
      <div className="upload-meta-actions">
        <button type="button" data-testid={`upload-meta-accept-${s.id}`} disabled={!canAccept}
          title={canAccept ? "Accept this metadata for the export" : issues.join(" · ")}
          onClick={() => meta !== null && a.acceptMeta(s, meta)}>Accept metadata</button>
        {overriddenSummary(row, a)}
      </div>
    </div>
  );
}

/** An untouched row edits from its accepted metadata, else from blank fields. */
function initialDraft(row: UploadRow): { title: string; description: string; tags: string } {
  return {
    title: row.metadata?.title ?? "",
    description: row.metadata?.description ?? "",
    tags: row.metadata?.tags.join(", ") ?? "",
  };
}

/** Empty fields show no issues — nothing has been typed to be wrong yet. */
function issuesText(title: string, description: string, issues: string[]): string {
  return title.trim() === "" && description.trim() === "" ? "" : issues.join(" · ");
}

/** The three draft fields — plain controlled inputs, validated by MetaEditor. */
function MetaFields(p: {
  id: string; title: string; description: string; tags: string;
  onTitle: (v: string) => void; onDescription: (v: string) => void; onTags: (v: string) => void;
}) {
  return (
    <>
      <label>
        Title (5–7 words · period · 3–5 words)
        <input data-testid={`upload-meta-title-${p.id}`} value={p.title} onChange={(e) => p.onTitle(e.target.value)} />
      </label>
      <label>
        Description (7–15 words)
        <input data-testid={`upload-meta-desc-${p.id}`} value={p.description} onChange={(e) => p.onDescription(e.target.value)} />
      </label>
      <label>
        Tags (exactly 40, comma-separated — includes the 7 mandatory terms)
        <textarea data-testid={`upload-meta-tags-${p.id}`} rows={3} value={p.tags} onChange={(e) => p.onTags(e.target.value)} />
      </label>
    </>
  );
}

function draftOf(title: string, description: string, tags: string): IconMetadata | null {
  if (title.trim() === "" && description.trim() === "" && tags.trim() === "") return null;
  return { title, description, tags: tags.split(",").map((t) => t.trim()) };
}

/** "inherited" or the overridden fields, so the editor never hides a choice. */
function overriddenSummary(row: UploadRow, a: UploadApi): string {
  const override: ExportOverride | null = a.m.overrides[row.source.id] ?? null;
  if (override === null) return "settings: inherited from the defaults";
  return `settings overridden: ${overriddenFields(override).join(", ")}`;
}
