// StockUploadHistoryFiles.tsx — dense uploaded-file rows and click-to-enlarge previews.

import { useEffect, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import type { StockUploadBatch, StockUploadHistoryFile } from "../lib/stockupload/batchhistory";
import { loadHistoryPreviewUrl } from "./historypreview";

interface PreviewRef { current: DirHandleLike | null }

export default function StockUploadHistoryFiles({ batch, rootRef, rootToken, onCopy }: {
  batch: StockUploadBatch; rootRef: PreviewRef; rootToken: number; onCopy: (path: string) => void;
}) {
  const [preview, setPreview] = useState<StockUploadHistoryFile | null>(null);
  return (
    <>
      <div className="stock-history-files" role="list" aria-label="Files uploaded in batch">
        {batch.files.map((file, index) => (
          <HistoryFileRow key={`${file.itemId}-${file.fileName}-${index}`} file={file} batch={batch}
            rootRef={rootRef} rootToken={rootToken} onPreview={setPreview} onCopy={onCopy} index={index} />
        ))}
        {batch.files.length === 0 && <p className="svg-empty">No files were successfully uploaded in this batch.</p>}
      </div>
      {preview && <LargePreview batch={batch} file={preview} rootRef={rootRef} rootToken={rootToken} onClose={() => setPreview(null)} />}
    </>
  );
}

function usePreviewUrl(batch: StockUploadBatch, file: StockUploadHistoryFile, rootRef: PreviewRef, rootToken: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let created: string | null = null;
    void loadHistoryPreviewUrl(rootRef.current, batch, file).then((next) => {
      created = next;
      if (live) setUrl(next);
      else if (next) URL.revokeObjectURL(next);
    });
    return () => { live = false; if (created) URL.revokeObjectURL(created); };
  }, [batch, file, rootToken, rootRef]);
  return url;
}

function HistoryFileRow({ batch, file, rootRef, rootToken, onPreview, onCopy, index }: {
  batch: StockUploadBatch; file: StockUploadHistoryFile; rootRef: PreviewRef; rootToken: number;
  onPreview: (file: StockUploadHistoryFile) => void; onCopy: (path: string) => void; index: number;
}) {
  const url = usePreviewUrl(batch, file, rootRef, rootToken);
  const location = file.fullPath ?? file.relPath ?? file.fileName;
  return (
    <div className="stock-history-file" role="listitem" data-testid={`stock-history-file-${batch.id}-${index}`}>
      <HistoryThumbnail batchId={batch.id} file={file} index={index} url={url} onPreview={onPreview} />
      <span className="stock-history-file-name" title={file.fileName}>{file.fileName}</span>
      <span className="stock-history-file-path" title={location}>{location}</span>
      <button type="button" className="svg-btn tiny" data-testid={`stock-history-location-${batch.id}-${index}`}
        title={location} onClick={() => onCopy(location)}>Location</button>
    </div>
  );
}

function hoverPreviewAt(button: HTMLButtonElement): { left: number; top: number } {
  const rect = button.getBoundingClientRect();
  return { left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - 240)),
    top: Math.max(8, Math.min(rect.top, window.innerHeight - 200)) };
}

function HistoryThumbnail({ batchId, file, index, url, onPreview }: {
  batchId: string; file: StockUploadHistoryFile; index: number; url: string | null;
  onPreview: (file: StockUploadHistoryFile) => void;
}) {
  const [hoverAt, setHoverAt] = useState<{ left: number; top: number } | null>(null);
  const showHover = (button: HTMLButtonElement) => { if (url) setHoverAt(hoverPreviewAt(button)); };
  return (
    <>
      <button type="button" className="stock-history-thumb" aria-label={`Preview ${file.fileName}`}
        data-testid={`stock-history-thumb-${batchId}-${index}`} onClick={() => onPreview(file)}
        onMouseEnter={(event) => showHover(event.currentTarget)} onMouseLeave={() => setHoverAt(null)}
        onFocus={(event) => showHover(event.currentTarget)} onBlur={() => setHoverAt(null)}>
        {url ? <img src={url} alt="" loading="lazy" /> : <span>{file.fileName.split(".").at(-1)?.toUpperCase() ?? "FILE"}</span>}
      </button>
      {hoverAt && url && <div className="stock-history-hover-preview" role="tooltip"
        data-testid={`stock-history-hover-preview-${batchId}-${index}`} style={hoverAt}>
        <img src={url} alt={`${file.fileName} preview`} style={{ width: "auto", height: "auto" }} />
      </div>}
    </>
  );
}

function LargePreview({ batch, file, rootRef, rootToken, onClose }: {
  batch: StockUploadBatch; file: StockUploadHistoryFile; rootRef: PreviewRef; rootToken: number; onClose: () => void;
}) {
  const url = usePreviewUrl(batch, file, rootRef, rootToken);
  return (
    <div className="svg-backdrop stock-history-preview-backdrop" data-testid="stock-history-preview" onClick={onClose}>
      <section className="svg-modal stock-history-preview-modal" role="dialog" aria-modal="true" aria-label={`Preview ${file.fileName}`}
        onClick={(event) => event.stopPropagation()}>
        <header className="svg-modal-head"><h2>{file.fileName}</h2><button type="button" className="svg-btn tiny" data-testid="stock-history-preview-close" onClick={onClose}>Close</button></header>
        <div className="stock-history-large-preview">{url ? <img src={url} alt={file.fileName} style={{ width: "auto", height: "auto" }} /> : <p>Preview unavailable for this file or workspace.</p>}</div>
      </section>
    </div>
  );
}
