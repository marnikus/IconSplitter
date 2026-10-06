// SvgDialogs.tsx — the overlays of the Generate SVG tab (prompt §2/§16): the
// paginated confirmation (delegated to SvgConfirm, which owns the plan), the
// code dialog (complete validated SVG, select-all + copy, scrollable) and the
// version chooser (VersionsDialog, I-54). Escape closes any of them WITHOUT
// sending anything.

import { useEffect, useRef, useState } from "react";
import type { ModelCaps, SamplingParams } from "../lib/modelcaps";
import type { SvgConfig } from "../lib/svgconfig";
import type { DirHandleLike } from "../lib/fs";
import SvgPreviewBox from "./SvgPreview";
import SvgConfirm from "./SvgConfirm";
import VersionsDialog from "./VersionsDialog";
import type { Dialog, SvgRow } from "./types";

export interface SvgDialogsProps {
  dialog: Dialog | null;
  rows: SvgRow[];
  config: SvgConfig;
  caps: ModelCaps;
  params: SamplingParams;
  rootRef: { current: DirHandleLike | null };
  readCode: (id: string, version: number) => Promise<string | null>;
  onConfirm: () => void;
  onDismiss: () => void;
  onShowCode: (id: string, version: number) => void;
  /** Chooses which version the row shows (I-54); resolves why it failed, or null. */
  onUseVersion: (id: string, version: number) => Promise<string | null>;
  /** A request is in flight, so a confirmation appends instead of starting (I-53). */
  running: boolean;
}

export default function SvgDialogs(p: SvgDialogsProps) {
  const dialog = p.dialog;
  if (dialog === null) return null;
  if (dialog.kind === "confirm") {
    return <SvgConfirm ids={dialog.ids} rows={p.rows} config={p.config} caps={p.caps} params={p.params}
      rootRef={p.rootRef} running={p.running} onConfirm={p.onConfirm} onDismiss={p.onDismiss} />;
  }
  const row = p.rows.find((r) => r.source.id === dialog.id);
  if (!row) return null;
  if (dialog.kind === "code") return <CodeDialog row={row} version={dialog.version} p={p} />;
  return <VersionsDialog row={row} readCode={p.readCode} onShowCode={p.onShowCode}
    onUse={(version) => p.onUseVersion(row.source.id, version)} onDismiss={p.onDismiss} />;
}

/** Loads the version's document and owns the textarea + copy that use it. */
function useCodeDoc(p: SvgDialogsProps, id: string, version: number): {
  code: string | null; ref: React.RefObject<HTMLTextAreaElement | null>; copy: () => void;
} {
  const [code, setCode] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    let live = true;
    void p.readCode(id, version).then((t) => live && setCode(t));
    return () => { live = false; };
  }, [p, id, version]);
  const copy = () => {
    const text = ref.current?.value ?? "";
    void navigator.clipboard.writeText(text).then(() => undefined, () => undefined);
  };
  return { code, ref, copy };
}

function CodeDialog({ row, version, p }: { row: SvgRow; version: number; p: SvgDialogsProps }) {
  const { code, ref, copy } = useCodeDoc(p, row.source.id, version);
  return (
    <div className="svg-backdrop" data-testid="svg-code-dialog">
      <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="svg-code-title">
        <header className="svg-modal-head">
          <h2 id="svg-code-title">{row.source.stem}.svg · v{version}</h2>
          <button type="button" className="svg-btn" data-testid="svg-code-close" onClick={p.onDismiss}>Close</button>
        </header>
        <div className="svg-modal-body">
          {code === null
            ? <p className="svg-note" data-testid="svg-code-missing">This version has no readable SVG file.</p>
            : <>
              <CodeDrawing code={code} stem={row.source.stem} version={version} />
              <textarea ref={ref} className="svg-code" data-testid="svg-code-block" readOnly spellCheck={false}
                aria-label={`SVG code for ${row.source.stem} version ${version}`} value={code} />
            </>}
          <CodeActions code={code} ref={ref} copy={copy} onDone={p.onDismiss} />
        </div>
      </section>
    </div>
  );
}

/** The artwork of the version whose code sits underneath it. */
function CodeDrawing({ code, stem, version }: { code: string; stem: string; version: number }) {
  return (
    <div className="svg-code-preview">
      <SvgPreviewBox code={code} box={{ width: 140, height: 140 }} version={version} testid="svg-code-art"
        label={`${stem} version ${version} preview`} />
      <span data-testid="svg-code-preview-note">What this version draws — Copy hands over this exact document.</span>
    </div>
  );
}

/** Select-all + copy, exactly as the code dialog promises (prompt §16). */
function CodeActions({ code, ref, copy, onDone }: {
  code: string | null; ref: React.RefObject<HTMLTextAreaElement | null>;
  copy: () => void; onDone: () => void;
}) {
  return (
    <div className="svg-modal-actions">
      <button type="button" className="svg-btn" data-testid="svg-code-select"
        disabled={code === null} onClick={() => ref.current?.select()}>Select all</button>
      <button type="button" className="svg-btn primary" data-testid="svg-code-copy"
        disabled={code === null} onClick={copy}>Copy SVG code</button>
      <button type="button" className="svg-btn" data-testid="svg-code-done" onClick={onDone}>Done</button>
    </div>
  );
}
