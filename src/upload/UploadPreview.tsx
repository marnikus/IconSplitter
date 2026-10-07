// UploadPreview.tsx — the icon preview dialog (prompt §3/§6). Owns: showing the
// APPROVED SVG the export will use, on the preview background the toolbar chose.
//
// The background here is display-only: it never changes a setting, and the
// exports keep the plate the settings panel defines.

import SvgPreviewBox from "../svg/SvgPreview";

export default function UploadPreview({ preview, background, onClose }: {
  preview: { name: string; code: string } | null;
  background: string;
  onClose: () => void;
}) {
  if (preview === null) return null;
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={`Preview of ${preview.name}`} data-testid="upload-preview-dialog">
      <div className="dialog">
        <div className="flex between">
          <strong>{preview.name}</strong>
          <button type="button" data-testid="upload-preview-close" onClick={onClose}>Close</button>
        </div>
        <div className="preview-large" style={{ background }}>
          <SvgPreviewBox code={preview.code} box={{ width: 520, height: 520 }} testid="upload-preview-svg" label={preview.name} version={0} />
        </div>
        <p className="muted tiny">
          The approved SVG as it will be prepared: padded board, {`${preview.name}`}·jpg rendered from these vectors.
        </p>
      </div>
    </div>
  );
}
