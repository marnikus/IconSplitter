// UploadPanel.tsx — the SVG-to-upload tab (prompt §1–§4). Owns: the layout the
// mockup in `design temp/SVG to upload` describes and nothing else. Discovery,
// status, counts, settings, the plan and the package all come from tested
// modules; this file arranges them and passes the one api down.
//
// It never uploads. The deliverable is the `export/` folder inside each icon's
// own pair folder, written by the user's own handle.

import { modelLabel } from "../lib/geminiconfig";
import type { UploadApi } from "./useUpload";
import { useUpload } from "./useUpload";
import UploadSetup from "./UploadSetup";
import UploadToolbar from "./UploadToolbar";
import UploadList from "./UploadList";
import UploadStatusBar from "./UploadStatusBar";
import UploadPreview from "./UploadPreview";

export default function UploadPanel() {
  const api = useUpload();
  return (
    <div data-testid="upload-panel">
      {/* A browser without the File System Access API still sees the whole tab:
          what it cannot do is pick a folder, and the note plus the disabled
          buttons say that plainly instead of hiding the work. */}
      {!api.supported && <Unsupported />}
      <UploadSetup api={api} />
      <UploadToolbar api={api} />
      <Problems api={api} />
      <UploadList api={api} />
      <UploadStatusBar api={api} model={modelLabel(api.provider.model)} />
      <UploadPreview preview={api.preview} background={api.previewBackground} onClose={api.closePreview} />
    </div>
  );
}

function Unsupported() {
  return (
    <section className="m-4 rounded border border-amber-500/40 bg-amber-500/10 p-4 text-sm" data-testid="upload-unsupported">
      <strong className="text-amber-200">This browser cannot open a folder.</strong>
      <p className="mt-1 text-amber-100/80">
        The export writes into the folder the SVGs live in, which needs the File System Access API
        (Chrome or Edge). Nothing is sent anywhere by this page.
      </p>
    </section>
  );
}

/** Every source problem, verbatim: a hidden warning is a hidden substitution. */
function Problems({ api }: { api: UploadApi }) {
  if (api.problems.length === 0) return null;
  return (
    <aside className="my-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100" data-testid="upload-problems" role="status">
      <strong className="text-[11px] text-amber-200">{api.problems.length} source problem(s)</strong>
      <span className="ml-2 rounded-full border border-amber-400/40 px-2 py-0.5 text-[9px]">Needs review</span>
      <ul className="mt-1 space-y-0.5 text-[10px]">
        {api.problems.slice(0, 6).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </aside>
  );
}
