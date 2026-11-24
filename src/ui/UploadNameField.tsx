// UploadNameField.tsx — shared per-item editor for the upload file stem across
// SVG to upload, SVG builder, and Stock upload. Shows the unchanged app working
// name (`workName`) beside an editable human-readable `uploadName` (no commas
// or dots, <= 180 chars on whole words), with ✦ From Title + Description,
// ✓ Apply name, ↺ Reset, and an inline status line so every click responds —
// even when the item already has that exact same name.

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  UPLOAD_NAME_MAX_CHARS,
  buildUploadName,
  effectiveExportStem,
  sanitizeUploadName,
} from "../lib/upload/uploadname";
import {
  getRenameFeedback,
  publishRenameFeedback,
  subscribeRenameFeedback,
  type ItemRenameFeedback,
} from "../upload/renamefeedback";

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
  const feedback = useSyncExternalStore(subscribeRenameFeedback, () => getRenameFeedback(p.id));
  const preview = sanitizeUploadName(draft);
  const activeStem = effectiveExportStem(p.workName, saved);
  const generated = buildUploadName({ title: p.titleText, description: p.descriptionText });
  const commit = (val: string | null) => { setDraft(val ?? ""); p.onApply(val); };
  return (
    <div className="svg-field up-meta-field" data-testid={`upload-name-box-${p.id}`}>
      <NameHeader id={p.id} workName={p.workName} length={(preview || activeStem).length} />
      <input type="text" className="svg-input" data-testid={`upload-file-name-${p.id}`} aria-label="Upload file name"
        spellCheck={false} placeholder={p.workName} value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(preview === "" ? null : preview); } }} />
      <NameActions id={p.id} generated={generated} onCommit={commit}
        onApply={() => commit(preview === "" ? null : preview)} onReset={() => commit(null)} />
      <FeedbackLine id={p.id} feedback={feedback} preview={preview !== "" ? preview : activeStem} />
    </div>
  );
}

function NameHeader(p: { id: string; workName: string; length: number }) {
  return (
    <span className="svg-label">
      Upload file name · {p.length}/{UPLOAD_NAME_MAX_CHARS} ·{" "}
      <small>Work name: <code data-testid={`upload-work-name-${p.id}`}>{p.workName}</code></small>
    </span>
  );
}

function FeedbackLine(p: { id: string; feedback: ItemRenameFeedback | null; preview: string }) {
  return (
    <>
      {p.feedback !== null && (
        <small className={`up-hint up-name-feedback${p.feedback.err ? " is-error" : ""}`} role="status"
          aria-live="polite" data-testid={`upload-name-status-${p.id}`} data-seq={p.feedback.seq}>
          {p.feedback.err ? "⚠ " : "✓ "}{p.feedback.msg}
        </small>
      )}
      <small className="up-hint">
        Exports as <code>{p.preview}</code> (saved in JSON + exported filenames only — never in metadata; no commas/dots, max {UPLOAD_NAME_MAX_CHARS} chars on whole words).
      </small>
    </>
  );
}

function NameActions(p: {
  id: string; generated: string;
  onCommit: (val: string | null) => void; onApply: () => void; onReset: () => void;
}) {
  const canGen = p.generated !== "";
  const handleGen = () => {
    if (!canGen) publishRenameFeedback(p.id, "Add Title + Description metadata first to build an upload file name", true);
    else p.onCommit(p.generated);
  };
  return (
    <div className="up-meta-actions">
      <button type="button" className="svg-btn tiny" data-testid={`upload-name-from-meta-${p.id}`}
        disabled={!canGen} onClick={handleGen}
        title={canGen ? "Build upload filename from Title + Description (underscores, no commas/dots, <= 180 chars on whole words)" : "Add Title + Description metadata first"}>
        ✦ From Title + Description
      </button>
      <button type="button" className="svg-btn tiny success" data-testid={`upload-name-apply-${p.id}`}
        onClick={p.onApply}>✓ Apply name</button>
      <button type="button" className="svg-btn tiny" data-testid={`upload-name-reset-${p.id}`}
        onClick={p.onReset}>↺ Reset to work name</button>
    </div>
  );
}
