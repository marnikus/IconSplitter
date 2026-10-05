// SvgDialogs.tsx — the overlays of the Generate SVG tab (prompt §2/§16): the
// paginated confirmation (delegated to SvgConfirm, which owns the plan), the
// code dialog (complete validated SVG, select-all + copy, scrollable) and the
// version history. Escape closes any of them WITHOUT sending anything.

import { useEffect, useRef, useState } from "react";
import type { ModelCaps, SamplingParams } from "../lib/modelcaps";
import type { SvgConfig } from "../lib/svgconfig";
import { costLabel, costNote, fmtTokens } from "../lib/svgusage";
import type { DirHandleLike } from "../lib/fs";
import SvgPreviewBox from "./SvgPreview";
import SvgConfirm from "./SvgConfirm";
import type { SvgVersion } from "../lib/svgfile";
import type { Dialog, SvgRow } from "./types";

export interface SvgDialogsProps {
  dialog: Dialog | null;
  rows: SvgRow[];
  config: SvgConfig;
  caps: ModelCaps;
  params: SamplingParams;
  /** The stored prompt the confirmation previews and the runner sends. */
  prompt: string;
  rootRef: { current: DirHandleLike | null };
  readCode: (id: string, version: number) => Promise<string | null>;
  onConfirm: () => void;
  onDismiss: () => void;
  onShowCode: (id: string, version: number) => void;
}

export default function SvgDialogs(p: SvgDialogsProps) {
  const dialog = p.dialog;
  if (dialog === null) return null;
  if (dialog.kind === "confirm") {
    return <SvgConfirm ids={dialog.ids} rows={p.rows} config={p.config} caps={p.caps} params={p.params}
      prompt={p.prompt} rootRef={p.rootRef} onConfirm={p.onConfirm} onDismiss={p.onDismiss} />;
  }
  const row = p.rows.find((r) => r.source.id === dialog.id);
  if (!row) return null;
  if (dialog.kind === "code") return <CodeDialog row={row} version={dialog.version} p={p} />;
  return <HistoryDialog row={row} p={p} />;
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
      <SvgPreviewBox code={code} size={140} version={version} testid="svg-code-art"
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

function HistoryDialog({ row, p }: { row: SvgRow; p: SvgDialogsProps }) {
  const versions = row.sidecar?.versions ?? [];
  return (
    <div className="svg-backdrop" data-testid="svg-history-dialog">
      <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="svg-history-title">
        <header className="svg-modal-head">
          <h2 id="svg-history-title">{row.source.stem} · version history</h2>
          <button type="button" className="svg-btn" data-testid="svg-history-close" onClick={p.onDismiss}>Close</button>
        </header>
        <div className="svg-modal-body">
          {versions.length === 0
            ? <p className="svg-note">No versions recorded yet — the sidecar is missing, so this source is pending.</p>
            : <VersionTable row={row} versions={versions} onShowCode={p.onShowCode} />}
          <div className="svg-modal-actions">
            <button type="button" className="svg-btn" data-testid="svg-history-done" onClick={p.onDismiss}>Done</button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Every recorded version, failed ones included, with a code shortcut. */
function VersionTable({ row, versions, onShowCode }: {
  row: SvgRow; versions: SvgVersion[]; onShowCode: (id: string, version: number) => void;
}) {
  return (
    <table className="svg-history" data-testid="svg-history-table">
      <thead><tr><th>Version</th><th>Status</th><th>Review</th><th>Tokens</th><th>Cost</th><th>Saved</th><th>Code</th></tr></thead>
      <tbody>
        {versions.map((v) => (
          <tr key={v.version} className={v.status === "generated" ? "" : "failed"} data-testid={`svg-history-v${v.version}`}>
            <td>v{v.version}</td>
            <td>{v.status === "generated" ? "generated" : v.status}{v.validation.ok ? "" : " ⚠"}</td>
            <td>{v.review}</td>
            <td>{fmtTokens(v.usage.total)}</td>
            <td className="svg-history-cost" data-testid={`svg-history-cost-${v.version}`}>
              {costLabel(v.cost)}
              <small className="svg-cost-note">{costNote(v.model, v.cost)}</small>
            </td>
            <td>{v.completedAt === null ? "—" : v.completedAt.slice(0, 16).replace("T", " ")}</td>
            <td>
              <button type="button" className="svg-btn tiny" disabled={v.status !== "generated"}
                onClick={() => onShowCode(row.source.id, v.version)}>Code</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
