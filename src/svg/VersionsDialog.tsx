// VersionsDialog.tsx — the version chooser (I-54). Every recorded version of
// one icon's SVG is listed as a tile with its OWN artwork, and any of them can
// be made the one the row shows — not only the newest. The choice is written
// into the pair's own file beside the images (so it travels with the folder and
// survives a reload), the row and its preview update immediately, and NOTHING is
// deleted: the whole history stays here, so every choice stays re-choosable.
// A failed version appears as its status, never as artwork, and a choice that
// cannot be written says so in the popup and changes nothing else.

import { useEffect, useState } from "react";
import { chosenVersion, type SvgVersion } from "../lib/svgfile";
import { costLabel, costNote, fmtTokens } from "../lib/svgusage";
import SvgPreviewBox from "./SvgPreview";
import type { SvgRow } from "./types";

export interface VersionsDialogProps {
  row: SvgRow;
  /** Reads one version's saved document (the same read the Code dialog uses). */
  readCode: (id: string, version: number) => Promise<string | null>;
  /** Chooses a version; resolves null on success, or why it could not be saved. */
  onUse: (version: number) => Promise<string | null>;
  onShowCode: (id: string, version: number) => void;
  onDismiss: () => void;
}

export default function VersionsDialog({ row, readCode, onUse, onShowCode, onDismiss }: VersionsDialogProps) {
  const versions = row.meta?.versions ?? [];
  const shown = chosenVersion(versions, row.meta?.preferred ?? null);
  const [error, setError] = useState<string | null>(null);
  const use = (version: number) => {
    void onUse(version).then((message) => setError(message));
  };
  return (
    <div className="svg-backdrop" data-testid="svg-history-dialog">
      <section className="svg-modal wide" role="dialog" aria-modal="true" aria-labelledby="svg-history-title">
        <header className="svg-modal-head">
          <h2 id="svg-history-title" data-testid="svg-history-title">{row.source.stem} · versions</h2>
          <button type="button" className="svg-btn" data-testid="svg-history-close" onClick={onDismiss}>Close</button>
        </header>
        <div className="svg-modal-body">
          <p className="svg-note" data-testid="svg-history-shown">{shownLine(shown, versions.length)}</p>
          {error !== null && <p className="svg-note svg-note-error" data-testid="svg-history-note">{error}</p>}
          <VersionList versions={versions} row={row} shown={shown} readCode={readCode} onUse={use} onShowCode={onShowCode} />
          <div className="svg-modal-actions">
            <button type="button" className="svg-btn" data-testid="svg-history-done" onClick={onDismiss}>Done</button>
          </div>
        </div>
      </section>
    </div>
  );
}

interface ListProps {
  versions: SvgVersion[];
  row: SvgRow;
  shown: SvgVersion | null;
  readCode: VersionsDialogProps["readCode"];
  onUse: (version: number) => void;
  onShowCode: (id: string, version: number) => void;
}

/** Every recorded version, in order; none of them is ever dropped (I-54). */
function VersionList({ versions, row, shown, readCode, onUse, onShowCode }: ListProps) {
  if (versions.length === 0) {
    return <p className="svg-note">No versions recorded yet — the pair’s file has no history, so this source is pending.</p>;
  }
  return (
    <div className="svg-history-tiles" data-testid="svg-history-table">
      {versions.map((v) => (
        <VersionTile key={v.version} row={row} v={v} shown={shown} readCode={readCode} onUse={onUse} onShowCode={onShowCode} />
      ))}
    </div>
  );
}

/** One honest sentence about what the row shows right now. */
function shownLine(shown: SvgVersion | null, total: number): string {
  if (shown === null) return `Nothing to show yet — ${total} recorded version${total === 1 ? "" : "s"}.`;
  return `Showing v${shown.version} of ${total} recorded version${total === 1 ? "" : "s"} — choosing another one keeps all of them.`;
}

interface TileProps {
  row: SvgRow;
  v: SvgVersion;
  shown: SvgVersion | null;
  readCode: VersionsDialogProps["readCode"];
  onUse: (version: number) => void;
  onShowCode: (id: string, version: number) => void;
}

/** One version: its artwork, its facts, and the two actions it offers. */
function VersionTile({ row, v, shown, readCode, onUse, onShowCode }: TileProps) {
  const version = v.version;
  const usable = v.status === "generated" && v.validation.ok;
  const code = useVersionDoc(readCode, row.source.id, version, usable);
  const isShown = shown?.version === version;
  return (
    <article className={`svg-history-tile${isShown ? " shown" : ""}`} data-testid={`svg-history-v${version}`}>
      <header className="svg-history-head">
        <b>v{version}</b>
        <span data-testid={`svg-history-status-${version}`}>{statusText(v)}</span>
        {isShown && <em>shown</em>}
      </header>
      <div className="svg-history-art">
        {usable && code !== null
          ? <SvgPreviewBox code={code} box={{ width: 96, height: 96 }} version={version}
            testid={`svg-history-art-${version}`} label={`${row.source.stem} version ${version}`} />
          : <span className="svg-thumb missing" data-testid={`svg-history-art-${version}`}>{usable ? "Reading…" : v.error ?? v.status}</span>}
      </div>
      <VersionFacts v={v} />
      <footer className="svg-history-pick">
        <button type="button" className="svg-btn tiny primary" data-testid={`svg-history-use-${version}`}
          disabled={!usable || isShown} onClick={() => onUse(version)}>Use this version</button>
        <button type="button" className="svg-btn tiny" data-testid={`svg-history-code-${version}`}
          disabled={v.status !== "generated"} onClick={() => onShowCode(row.source.id, version)}>Code</button>
      </footer>
    </article>
  );
}

/** The facts of one version: review, tokens, cost and when it was saved. */
function VersionFacts({ v }: { v: SvgVersion }) {
  return (
    <dl className="svg-history-facts">
      <div><dt>Review</dt><dd>{v.review}</dd></div>
      <div><dt>Tokens</dt><dd>{fmtTokens(v.usage.total)}</dd></div>
      <div className="svg-history-cost" data-testid={`svg-history-cost-${v.version}`}>
        <dt>Cost</dt>
        <dd>{costLabel(v.cost)}<small className="svg-cost-note">{costNote(v.model, v.cost)}</small></dd>
      </div>
      <div><dt>Saved</dt><dd>{v.completedAt === null ? "—" : v.completedAt.slice(0, 16).replace("T", " ")}</dd></div>
    </dl>
  );
}

/** What the header says about a version that is not a drawable document. */
function statusText(v: SvgVersion): string {
  if (v.status !== "generated") return v.error === null ? v.status : `${v.status} — ${v.error}`;
  return v.validation.ok ? "generated" : `invalid — ${v.validation.errors.join(", ")}`;
}

/** Reads one version's document, once, and only when it can be drawn. */
function useVersionDoc(
  readCode: VersionsDialogProps["readCode"], id: string, version: number, enabled: boolean,
): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!enabled) return;
    void readCode(id, version).then((text) => live && setCode(text), () => live && setCode(null));
    return () => { live = false; };
  }, [readCode, id, version, enabled]);
  return code;
}
