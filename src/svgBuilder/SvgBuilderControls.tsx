// SvgBuilderControls.tsx — the folder bar above the workspace (like the other
// tabs): Open folder, Rescan, scope copy, approved count, audit line and path.
// The indexing controls live in the header row (SvgBuilderHeader).
import { FolderPathRow, OpenFolderButton } from "../ui/FolderBar";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderControls({ b }: { b: BuilderApi }) {
  return <section className="bld-folder" data-testid="builder-folder-widget" aria-label="Approved SVG folder">
    <div className="bld-folder-row">
      <OpenFolderButton testid="builder-open-folder" onClick={b.actions.openFolder} />
      <button type="button" className="svg-btn" data-testid="builder-rescan" onClick={b.actions.rescan}>↻ Rescan</button>
      <span className="v2-chip" data-testid="builder-scope-copy">Approved SVGs only · all folders · read-only</span>
      <span className="v2-chip approved" data-testid="builder-approved-count"><strong>{b.assets.length}</strong> approved</span>
      <span className="bld-audit" data-testid="builder-audit">{b.auditLine}</span>
    </div>
    <FolderPathRow root={b.root} testid="builder-folder-path" />
    <IconMapRow b={b} />
  </section>;
}

/**
 * Where icon-map.json is (2026-11-13): every named icon → id, folder and files,
 * rewritten after each scan, so an AI can find an icon's folder by its name or id.
 */
function IconMapRow({ b }: { b: BuilderApi }) {
  const map = b.iconMap;
  if (map === null) return null;
  const copy = () => {
    void navigator.clipboard.writeText(map.path).then(() => b.actions.say("icon-map.json path copied"),
      () => b.actions.say("The clipboard refused the path — select it and copy it by hand", true));
  };
  return <div className={`bld-icon-map${map.error === null ? "" : " is-error"}`} data-testid="builder-icon-map"
    title="Every icon with an Icon Name, mapped to its id, folder, SVG, pair file, preview, export record, similarity index and usage count — rewritten after each scan">
    <span className="bld-icon-map-label">ICON MAP</span>
    <code data-testid="builder-icon-map-path">{map.path}</code>
    <span className="bld-icon-map-count" data-testid="builder-icon-map-count">{map.error ?? `${map.count} named icon(s) · name → id → folder`}</span>
    <button type="button" className="svg-btn tiny" data-testid="builder-icon-map-copy" onClick={copy}>Copy path</button>
  </div>;
}

/**
 * "Icons indexing": counts while idle; model download, then icon progress and
 * Cancel while running. Shown in the header row beside the sheet title (user,
 * 2026-11-13), no longer in the folder bar.
 */
export function IndexingControl({ b }: { b: BuilderApi }) {
  const run = b.indexing;
  const { indexed, pending } = b.indexStats;
  if (run === null) return <>
    <button type="button" className="svg-btn primary" data-testid="builder-index-start" disabled={b.assets.length === 0}
      title="Vectorise every approved icon (image + meaning) once; only new or changed icons are redone"
      onClick={b.actions.startIndexing}>◈ Icons indexing</button>
    <span className={`v2-chip${pending > 0 ? " pending" : " approved"}`} data-testid="builder-index-count">
      <strong>{indexed}</strong>/{b.assets.length} indexed{pending > 0 ? ` · ${pending} to do` : ""}</span>
  </>;
  return <>
    <span className="v2-chip pending" data-testid="builder-index-progress" aria-live="polite">{progressText(run)}</span>
    <button type="button" className="svg-btn danger" data-testid="builder-index-cancel" onClick={b.actions.cancelIndexing}>Cancel</button>
  </>;
}

function progressText(run: NonNullable<BuilderApi["indexing"]>): string {
  if (run.phase === "models") {
    const m = run.model;
    const mb = (n: number) => (n / 1048576).toFixed(0);
    return m === null || m.total === 0 ? "Loading AI models (first run downloads once)…" : `Loading AI models · ${m.file.split("/").pop()} ${mb(m.loaded)}/${mb(m.total)} MB`;
  }
  return `Indexing ${run.done}/${run.total}${run.failed > 0 ? ` · ${run.failed} failed` : ""}…`;
}
