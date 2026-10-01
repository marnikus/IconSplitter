// ui/SvgCodeDialog.tsx — text-only view/copy surface for sanitized SVG markup.

import { useState } from "react";
import type { SvgLoadedVersion, SvgSourceRow } from "../types";
import SvgDialog from "./SvgDialog";

export default function SvgCodeDialog({ row, version, onClose, onNotice }: {
  row: SvgSourceRow; version: SvgLoadedVersion; onClose: () => void; onNotice: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <SvgDialog title={`${row.filename} · v${version.version} SVG code`} onClose={onClose} wide>
      {version.svg ? <pre className="svg-code-block"><code>{version.svg}</code></pre>
        : <p role="alert" className="svg-error-copy">This SVG version is unavailable or failed current validation.</p>}
      <div className="svg-modal-actions">
        <button type="button" className="svg-btn" disabled={!version.svg} onClick={() => void copyCode(version.svg ?? "", setCopied, onNotice)}>
          {copied ? "Copied" : "Copy SVG code"}
        </button>
        <button type="button" className="svg-btn primary" onClick={onClose}>Done</button>
      </div>
    </SvgDialog>
  );
}

async function copyCode(svg: string, setCopied: (copied: boolean) => void, onNotice: (message: string) => void): Promise<void> {
  try { await navigator.clipboard.writeText(svg); setCopied(true); onNotice("Sanitized SVG code copied."); }
  catch { onNotice("Clipboard is unavailable; select and copy the SVG code manually."); }
}
