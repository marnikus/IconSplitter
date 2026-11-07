// BuilderLibrary.tsx — the left rail: every approved icon the scan found, the
// filters that narrow it, and the one honest sentence when there is nothing to
// show. The rows come from lib/builder/rows (pure filtering) — this file only
// renders them, so the rail can never disagree with the rail's rule.
//
// Nothing here places an icon yet: P2 adds the sheet, and the sheet reads the
// library through this same list (design §8).

import type { BuilderIcon } from "../lib/builder/rows";
import type { BuilderShell } from "./useBuilderShell";
import SearchField from "../ui/SearchField";

export interface BuilderLibraryProps {
  shell: BuilderShell;
}

export default function BuilderLibrary({ shell }: BuilderLibraryProps) {
  if (shell.icons.length === 0) return <EmptyLibrary excluded={shell.scope?.excluded ?? 0} />;
  return (
    <section className="bld-rail" data-testid="builder-library" aria-label="Approved icons">
      <div className="bld-rail-top">
        <SearchField testid="builder-search" look="svg" value={shell.filter.search}
          placeholder="Name, folder or tag…" onChange={(search) => shell.setFilter({ search })} />
        <button type="button" className="bld-link" data-testid="builder-search-clear"
          onClick={() => shell.setFilter({ search: "", folder: "", tag: "" })}>Clear</button>
      </div>
      <div className="bld-facets">
        {shell.facets.folders.map(([folder, count]) => (
          <button key={folder} type="button" className="bld-chip" data-testid="builder-facet-folder"
            aria-pressed={shell.filter.folder === folder}
            onClick={() => shell.setFilter({ folder: shell.filter.folder === folder ? "" : folder })}>
            {folder} <span className="bld-chip-n">{count}</span>
          </button>
        ))}
      </div>
      <ul className="bld-list">
        {shell.visible.map((icon) => <IconRow key={icon.id} icon={icon} />)}
      </ul>
      {shell.visible.length === 0 && (
        <p className="bld-note" data-testid="builder-no-match">
          No icon matches this filter — clear it to see all {shell.icons.length}.
        </p>
      )}
    </section>
  );
}

/** One icon: its name, its folder, and where its tags came from. */
function IconRow({ icon }: { icon: BuilderIcon }) {
  return (
    <li className="bld-row" data-testid="builder-icon" data-icon-id={icon.id} title={tooltip(icon)}>
      <span className="bld-row-name" data-testid="builder-icon-name">{icon.name}</span>
      <span className="bld-row-folder">{icon.folder === "" ? "root" : icon.folder}</span>
      {icon.tagSource !== "metadata" && <span className="bld-row-tags">filename tags</span>}
    </li>
  );
}

/** A guess is never shown as metadata: the tooltip names the source (Q6). */
function tooltip(icon: BuilderIcon): string {
  const where = icon.tagSource === "metadata" ? "tags from metadata" : icon.tagSource === "filename" ? "tags from the file name" : "no tags";
  return `${icon.name} · ${icon.svgPath} · v${icon.version} · ${where}`;
}

/**
 * An empty library is not an error and not a blank rail: it says what was walked
 * and the one action that would change the answer (approve an icon in Generate SVG).
 */
function EmptyLibrary({ excluded }: { excluded: number }) {
  return (
    <div className="bld-empty" data-testid="builder-library-empty">
      <p className="bld-empty-title">No approved icons in this folder</p>
      <p className="bld-empty-note">
        The builder lists only icons whose item is approved and whose SVG file is valid.
        {excluded > 0
          ? ` ${excluded} ${excluded === 1 ? "pair was" : "pairs were"} found but not approved — approve one in Generate SVG, then Rescan.`
          : " Approve icons in Generate SVG, then Rescan."}
      </p>
    </div>
  );
}
