// VersionsDialog.tsx — every generated version of ONE icon, and the pick
// (prompt §12/§16, RUN-3 2026-10-05). Owns: the popup that lists the pair's
// whole history — failed attempts included, each valid version drawing its own
// document — the "preferred" choice the row then previews, codes and copies,
// and the way back to the newest. Choosing changes ONE field of the pair file:
// no version is ever deleted, and every version stays re-choosable.
//
// Failed versions are listed but cannot be preferred: they have no document to
// show. Artwork goes through SvgPreviewBox, so every version is sanitized in
// its own shadow root exactly like the row preview (RULE 20).

import { useEffect, useState } from "react";
import { costLabel, costNote, fmtTokens } from "../lib/svgusage";
import type { SvgVersion } from "../lib/svgfile";
import { isUsableVersion } from "../lib/svgfile";
import SvgPreviewBox from "./SvgPreview";
import { isPreferredTarget, targetVersionOf } from "./rowmodel";
import type { SvgRow } from "./types";

export interface VersionsDialogProps {
  row: SvgRow;
  readCode: (id: string, version: number) => Promise<string | null>;
  onPrefer: (id: string, version: number | null) => void;
  onShowCode: (id: string, version: number) => void;
  onDismiss: () => void;
}

export default function VersionsDialog(p: VersionsDialogProps) {
  const versions = p.row.meta?.versions ?? [];
  const target = targetVersionOf(p.row);
  return (
    <div className="svg-backdrop" data-testid="svg-history-dialog">
      <section className="svg-modal wide" role="dialog" aria-modal="true" aria-labelledby="svg-history-title">
        <header className="svg-modal-head">
          <h2 id="svg-history-title">{p.row.source.stem} · versions</h2>
          <button type="button" className="svg-btn" data-testid="svg-history-close" onClick={p.onDismiss}>Close</button>
        </header>
        <div className="svg-modal-body">
          <PreferredNote row={p.row} target={target?.version ?? null} />
          {versions.length === 0
            ? <p className="svg-note">No versions recorded yet — the pair’s file has no history, so this source is pending.</p>
            : <VersionTable p={p} versions={versions} />}
          <div className="svg-modal-actions">
            <button type="button" className="svg-btn" data-testid="svg-prefer-newest"
              disabled={!isPreferredTarget(p.row)} onClick={() => p.onPrefer(p.row.source.id, null)}>
              Use the newest version
            </button>
            <button type="button" className="svg-btn" data-testid="svg-history-done" onClick={p.onDismiss}>Done</button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** One honest line: what the row, its Code button and Copy hand out now. */
function PreferredNote({ row, target }: { row: SvgRow; target: number | null }) {
  if (target === null) return <p className="svg-note" data-testid="svg-preferred-note">Nothing generated yet.</p>;
  const preferred = isPreferredTarget(row);
  return (
    <p className="svg-note" data-testid="svg-preferred-note">
      Preview, Code and Copy use <strong>v{target}</strong>
      {preferred ? " — the version you chose." : " — the newest valid one."} Choosing another version keeps every file.
    </p>
  );
}

function VersionTable({ p, versions }: { p: VersionsDialogProps; versions: SvgVersion[] }) {
  const target = targetVersionOf(p.row);
  return (
    <table className="svg-history" data-testid="svg-history-table">
      <thead>
        <tr><th>Version</th><th>Artwork</th><th>Status</th><th>Review</th><th>Tokens</th><th>Cost</th><th>Saved</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {versions.map((v) => (
          <VersionRow key={v.version} p={p} v={v} preferred={target?.version === v.version && isPreferredTarget(p.row)} />
        ))}
      </tbody>
    </table>
  );
}

function VersionRow({ p, v, preferred }: { p: VersionsDialogProps; v: SvgVersion; preferred: boolean }) {
  const className = `${v.status === "generated" ? "" : "failed"}${preferred ? " preferred" : ""}`;
  return (
    <tr className={className} data-testid={`svg-history-v${v.version}`}>
      <td>v{v.version}{preferred && <strong className="svg-preferred-mark" data-testid={`svg-preferred-mark-${v.version}`}> · Preferred</strong>}</td>
      <td><VersionArt id={p.row.source.id} v={v} readCode={p.readCode} /></td>
      <td>{v.status === "generated" ? "generated" : v.status}{v.validation.ok ? "" : " ⚠"}</td>
      <td>{v.review}</td>
      <td>{fmtTokens(v.usage.total)}</td>
      <td className="svg-history-cost" data-testid={`svg-history-cost-${v.version}`}>
        {costLabel(v.cost)}
        <small className="svg-cost-note">{costNote(v.model, v.cost)}</small>
      </td>
      <td>{v.completedAt === null ? "—" : v.completedAt.slice(0, 16).replace("T", " ")}</td>
      <td className="svg-version-actions">
        <button type="button" className="svg-btn tiny" data-testid={`svg-prefer-${v.version}`}
          disabled={!isUsableVersion(v) || preferred}
          onClick={() => p.onPrefer(p.row.source.id, v.version)}>Use this version</button>
        <button type="button" className="svg-btn tiny" disabled={!isUsableVersion(v)}
          onClick={() => p.onShowCode(p.row.source.id, v.version)}>Code</button>
      </td>
    </tr>
  );
}

/** The version's own document, drawn by the same sanitizing preview as a row. */
function VersionArt({ id, v, readCode }: { id: string; v: SvgVersion; readCode: VersionsDialogProps["readCode"] }) {
  const code = useVersionCode(id, v, readCode);
  if (!isUsableVersion(v)) return <span className="svg-note">—</span>;
  if (code === null) return <span className="svg-thumb loading" data-testid={`svg-version-art-${v.version}`} aria-hidden="true" />;
  return <SvgPreviewBox code={code} maxH={96} testid={`svg-version-art-${v.version}`}
    label={`${id} version ${v.version} artwork`} version={v.version} />;
}

/** Reads one version's document once; a failed read shows the empty frame. */
function useVersionCode(id: string, v: SvgVersion, readCode: VersionsDialogProps["readCode"]): string | null {
  const [code, setCode] = useState<string | null>(null);
  const usable = isUsableVersion(v);
  useEffect(() => {
    let live = true;
    if (usable) void readCode(id, v.version).then((t) => live && setCode(t), () => live && setCode(""));
    return () => { live = false; };
  }, [id, v.version, usable, readCode]);
  return code;
}
