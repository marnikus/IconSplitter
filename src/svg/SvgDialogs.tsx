// SvgDialogs.tsx — the three overlays of the Generate SVG tab (prompt §2/§3/§16):
// the confirmation that must precede any send (count, provider+model, the
// ordered position manifest, the request count and the contact-sheet preview),
// the code dialog (complete validated SVG, select-all + copy, scrollable), and
// the version history. Escape closes any of them WITHOUT sending anything.

import { useEffect, useRef, useState } from "react";
import { planBatches } from "../lib/svgbatch";
import { paramsLabel, type ModelCaps, type SamplingParams } from "../lib/modelcaps";
import type { SvgConfig } from "../lib/svgconfig";
import { costLabel, costNote, fmtTokens } from "../lib/svgusage";
import type { DirHandleLike } from "../lib/fs";
import { buildComposite, type BuiltComposite } from "./composite";
import SvgPreviewBox from "./SvgPreview";
import { toBatchSource } from "./sources";
import type { SvgVersion } from "../lib/svgfile";
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
}

export default function SvgDialogs(p: SvgDialogsProps) {
  const dialog = p.dialog;
  if (dialog === null) return null;
  if (dialog.kind === "confirm") {
    return <ConfirmDialog ids={dialog.ids} batches={dialog.batches} perRequest={dialog.perRequest} p={p} />;
  }
  const row = p.rows.find((r) => r.source.id === dialog.id);
  if (!row) return null;
  if (dialog.kind === "code") return <CodeDialog row={row} version={dialog.version} p={p} />;
  return <HistoryDialog row={row} p={p} />;
}

function ConfirmDialog({ ids, batches, perRequest, p }: { ids: string[]; batches: number; perRequest: number; p: SvgDialogsProps }) {
  const picked = p.rows.filter((r) => ids.includes(r.source.id));
  const plans = planBatches(picked.map((r) => toBatchSource(r.source)), perRequest);
  return (
    <div className="svg-backdrop" data-testid="svg-confirm">
      <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="svg-confirm-title">
        <header className="svg-modal-head">
          <h2 id="svg-confirm-title">Confirm SVG generation</h2>
          <button type="button" className="svg-btn" data-testid="svg-confirm-close" onClick={p.onDismiss}>Close</button>
        </header>
        <div className="svg-modal-body">
          <Facts ids={ids.length} batches={batches} perRequest={perRequest} model={p.config.model}
            sampling={paramsLabel(p.caps, p.params)} />
          <p className="svg-note">
            The saved local prompt is sent with every request. Existing SVG versions are never overwritten —
            each result is saved as the next version. A rate limit reports its retry-after delay, and nothing
            is resent while a request&apos;s outcome is unknown.
          </p>
          <Manifest plans={plans} />
          <CompositePreview p={p} picked={picked} perRequest={perRequest} />
          <div className="svg-modal-actions">
            <button type="button" className="svg-btn" data-testid="svg-confirm-cancel" onClick={p.onDismiss}>Cancel</button>
            <button type="button" className="svg-btn primary" data-testid="svg-confirm-generate" onClick={p.onConfirm}>Generate now</button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** The facts a confirmation must state before anything is sent. */
function Facts({ ids, batches, perRequest, model, sampling }: {
  ids: number; batches: number; perRequest: number; model: string; sampling: string;
}) {
  return (
    <div className="svg-facts">
      <Fact label="Selected images" value={String(ids)} testid="svg-confirm-count" />
      <Fact label="Requests" value={`${batches} × ${perRequest} max`} testid="svg-confirm-requests" />
      <Fact label="Provider / model" value={model} testid="svg-confirm-model" />
      <Fact label="Model settings" value={sampling} testid="svg-confirm-sampling" />
      <Fact label="Output policy" value="Versioned SVG + per-file sidecar" />
    </div>
  );
}

/** The ordered position manifest the provider answers with (prompt §3). */
function Manifest({ plans }: { plans: ReturnType<typeof planBatches> }) {
  return (
    <div className="svg-manifest" data-testid="svg-manifest">
      <div className="svg-field-label"><span>Ordered positions per request</span><span>{plans.length} request(s)</span></div>
      <ol>
        {plans.map((plan) => (
          <li key={plan.id}>
            <strong>{plan.id}</strong> · {plan.cols}×{plan.rows} grid
            <span className="svg-manifest-positions">
              {plan.items.map((i) => <span key={i.position}>{i.position} — {i.name}</span>)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Builds and shows the contact sheet of the first batch — memory only. */
function CompositePreview({ p, picked, perRequest }: { p: SvgDialogsProps; picked: SvgRow[]; perRequest: number }) {
  const [built, setBuilt] = useState<BuiltComposite | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The same derived batch size the run will use, so request 1 is request 1.
  const first = picked.slice(0, perRequest);
  const requests = Math.max(1, Math.ceil(picked.length / perRequest));
  const build = () => {
    const root = p.rootRef.current;
    if (root === null) return setError("Pick the source folder first");
    setError(null);
    void buildComposite(root, first.map((r) => r.source)).then(setBuilt).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "the contact sheet could not be built — no request was sent"));
  };
  return (
    <div className="svg-composite" data-testid="svg-composite">
      <div className="svg-field-label">
        <span>Contact sheet · request 1 of {requests}</span>
        <button type="button" className="svg-link" data-testid="svg-composite-build" onClick={build}>Build preview</button>
      </div>
      {error !== null && <p className="svg-note error" data-testid="svg-composite-error">{error}</p>}
      <CompositeBody built={built} />
    </div>
  );
}

/** The contact sheet once it exists, or the note that nothing was written. */
function CompositeBody({ built }: { built: BuiltComposite | null }) {
  if (built === null) {
    return <p className="svg-note">Built in memory only — never written into your SVG output folder.</p>;
  }
  return (
    <>
      <img className="svg-composite-img" data-testid="svg-composite-img" src={built.dataUrl} alt="Contact sheet sent with the first request" />
      <p className="svg-note" data-testid="svg-composite-meta">
        {built.layout.cols}×{built.layout.rows} grid · {built.layout.size}px · {built.layout.empty.length} empty cell(s) · hash {built.hash.slice(0, 12)}
      </p>
    </>
  );
}

function Fact({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="svg-fact">
      <span>{label}</span>
      <strong data-testid={testid}>{value}</strong>
    </div>
  );
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
