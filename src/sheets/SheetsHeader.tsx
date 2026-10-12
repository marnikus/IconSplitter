// SheetsHeader.tsx — full-width header for Single sheets tab
// Owns the logo, title and the export action buttons. Full width left-right
// (flex w-full) with no max-width limit, matching Workbench header behavior.

type Props = {
  total: number;
  onUpload: () => void;
  onZip: () => void;
  onFolder: () => void;
  onDownload: () => void;
};

export default function SheetsHeader({ total, onUpload, onZip, onFolder, onDownload }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 backdrop-blur">
      <div className="flex w-full flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
              <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
              <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
              <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Icon Splitter</h1>
            <p className="text-xs text-slate-400">Detect icons on a sheet → equal squares with padding</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button data-testid="upload-button" onClick={onUpload} className="btn-ghost">+ Upload images</button>
          <button data-testid="export-zip" disabled={!total} onClick={onZip} className="btn-primary">⬇ ZIP ({total})</button>
          <button data-testid="export-folder" disabled={!total} onClick={onFolder} className="btn-ghost">📁 Save to folder</button>
          <button data-testid="export-download" disabled={!total} onClick={onDownload} className="btn-ghost">Download files</button>
        </div>
      </div>
    </header>
  );
}
