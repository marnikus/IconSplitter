// UploadNameField.tsx — shared per-item editor for the upload file stem across
// SVG to upload, SVG builder, and Stock upload. Shows the unchanged app working
// name (`workName`) beside an editable human-readable `uploadName` (no commas
// or dots, <= 180 chars on whole words), with ✦ From Title + Description,
// ✓ Apply name, and ↺ Reset.

import { useEffect, useState } from "react";
import {
  UPLOAD_NAME_MAX_CHARS,
  buildUploadName,
  effectiveExportStem,
  sanitizeUploadName,
} from "../lib/upload/uploadname";

export interface UploadNameFieldProps {
  id: string;
  workName: string;
  /** Currently saved custom upload stem (null or equal to workName = default). */
  uploadName: string | null;
  titleText: string;
  descriptionText: string;
  onApply: (nextUploadName: string | null) => void;
}

export default function UploadNameField(p: UploadNameFieldProps) {
  const saved = p.uploadName && p.uploadName !== p.workName ? p.uploadName : "";
  const [draft, setDraft] = useState(saved);
  useEffect(() => { setDraft(saved); }, [saved, p.id]);
  const preview = sanitizeUploadName(draft);
  const activeStem = effectiveExportStem(p.workName, saved);
  const generated = buildUploadName({ title: p.titleText, description: p.descriptionText });
  const dirty = preview !== saved;
  const commit = (val: string | null) => { setDraft(val ?? ""); p.onApply(val); };
  return (
    <div className="svg-field up-meta-field" data-testid={`upload-name-box-${p.id}`}>
      <span className="svg-label">
        Upload file name · {(preview || activeStem).length}/{UPLOAD_NAME_MAX_CHARS} ·{" "}
        <small>Work name: <code data-testid={`upload-work-name-${p.id}`}>{p.workName}</code></small>
      </span>
      <input type="text" className="svg-input" data-testid={`upload-file-name-${p.id}`} aria-label="Upload file name"
        spellCheck={false} placeholder={p.workName} value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && dirty) { e.preventDefault(); commit(preview === "" ? null : preview); } }} />
      <NameActions id={p.id} canGen={generated !== ""} dirty={dirty} canReset={saved !== "" || draft !== ""}
        onGen={() => commit(generated)} onApply={() => commit(preview === "" ? null : preview)} onReset={() => commit(null)} />
      <small className="up-hint">
        Exports as <code>{preview !== "" ? preview : activeStem}</code> (no commas or dots, max {UPLOAD_NAME_MAX_CHARS} chars on whole words).
      </small>
    </div>
  );
}

function NameActions(p: {
  id: string; canGen: boolean; dirty: boolean; canReset: boolean;
  onGen: () => void; onApply: () => void; onReset: () => void;
}) {
  return (
    <div className="up-meta-actions">
      <button type="button" className="svg-btn tiny" data-testid={`upload-name-from-meta-${p.id}`}
        disabled={!p.canGen} onClick={p.onGen}
        title="Build upload filename from Title + Description (underscores, no commas/dots, <= 180 chars on whole words)">
        ✦ From Title + Description
      </button>
      <button type="button" className="svg-btn tiny success" data-testid={`upload-name-apply-${p.id}`}
        disabled={!p.dirty} onClick={p.onApply}>✓ Apply name</button>
      <button type="button" className="svg-btn tiny" data-testid={`upload-name-reset-${p.id}`}
        disabled={!p.canReset} onClick={p.onReset}>↺ Reset to work name</button>
    </div>
  );
}
