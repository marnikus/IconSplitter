// BuilderPanel.tsx — the "SVG builder" tab (design docs/archive/2026-11-07-svg-builder
// §5.8). The screen owns no rule of its own: the scan, the sheet model, the layout
// math, the selection recipes, the serializer and the provider live in tested
// modules; this file is the wiring that makes them one screen.
//
// `active` (same contract as SvgPanel/UploadPanel): the Workbench keeps this panel
// mounted on every tab and parks it hidden, so a composed sheet — and any request in
// flight — is never unmounted by a tab switch.

import { useBusyActivity } from "../ui/useBusyActivity";
import { useRunning } from "../ui/rebuildwatch";
import BuilderSourceBar from "./BuilderSourceBar";
import BuilderLibrary from "./BuilderLibrary";
import BuilderArtboard from "./BuilderArtboard";
import BuilderControls from "./BuilderControls";
import BuilderRecipe from "./BuilderRecipe";
import BuilderExport from "./BuilderExport";
import { useBuilderExport } from "./useBuilderExport";
import { computeLayout } from "../lib/builder/layout";
import { useBuilderArt, type BuilderArt } from "./useBuilderArt";
import type { BuilderShell } from "./useBuilderShell";
import type { BuilderExportState } from "./useBuilderExport";
import type { Placement } from "../lib/builder/serialize";
import type { SheetLayout } from "../lib/builder/layout";
import { BuilderPickRoot, BuilderUnsupported } from "./BuilderEmpty";
import { useBuilderShell } from "./useBuilderShell";

export default function BuilderPanel({ active = true }: { active?: boolean }) {
  const g = useBuilderShell();
  const art = useBuilderArt(g.root, g.icons, g.config, g.selection?.slots);
  const layout = computeLayout(g.config);
  const placements = placementsOf(art, layout);
  const exp = useBuilderExport({
    root: g.root, config: g.config, layout, placements,
    title: g.config.banner.title, subtitle: g.config.banner.subtitle,
    seed: g.seed, slots: g.selection?.slots ?? [], locked: [],
  });
  useBusyActivity("builder", g.busy);
  // A reload must not land inside a sheet-metadata request.
  useRunning("builder", false);
  if (!g.supported) {
    return <div className="svg bld" data-testid="builder-panel-unsupported"><BuilderUnsupported onPick={g.chooseRoot} /></div>;
  }
  return (
    <div className="svg bld" data-testid="builder-panel" data-active={active ? "true" : "false"}>
      <BuilderSourceBar rootName={g.rootName} root={g.root} scope={g.scope} busy={g.busy}
        onChooseRoot={g.chooseRoot} onRescan={g.rescan} />
      {g.root === null ? <BuilderPickRoot onPick={g.chooseRoot} /> : <WorkArea shell={g} art={art} exp={exp} />}
      {g.toast !== null && <p className="bld-note" data-testid="builder-toast" role="status">{g.toast}</p>}
    </div>
  );
}

/** The working screen once a folder is picked: controls and rail left, sheet right. */
function WorkArea({ shell, art, exp }: { shell: BuilderShell; art: BuilderArt; exp: BuilderExportState }) {
  return (
    <div className="bld-work">
      <div className="bld-side">
        <BuilderControls config={shell.config} onChange={shell.setConfig} />
        <BuilderRecipe recipe={shell.recipe} seed={shell.seed} result={shell.selection}
          folders={shell.facets.folders.map(([f]) => f)} tags={shell.facets.tags.map(([t]) => t)}
          onChange={shell.setRecipe} onReroll={shell.reroll} onClear={shell.clear} onSeed={shell.setSeed} />
        <BuilderExport config={shell.config} busy={exp.busy} last={exp.last} canCommit={shell.root !== null}
          scale={exp.scale} onScale={exp.setScale} onDownloadSvg={exp.downloadSvg}
          onDownloadPng={exp.downloadPng} onDownloadZip={() => void exp.downloadZip()} onCommit={() => void exp.commit()} />
        <BuilderLibrary shell={shell} />
      </div>
      <BuilderArtboard config={shell.config} slots={art.slots} placed={art.placed} zoom={art.zoom} />
    </div>
  );
}

/**
 * The sheet on screen as serializer placements: the SAME `computeLayout` cells the
 * artboard drew, so the export cannot land anywhere else. An icon still being read
 * is left out (it has nothing to place yet); a refused icon is kept so the
 * serializer can exclude it deliberately.
 */
function placementsOf(art: BuilderArt, layout: SheetLayout): Placement[] {
  return art.slots.flatMap((icon, index) => {
    const cell = layout.cells[index];
    if (icon === null || cell === undefined) return [];
    const result = art.placed.get(icon.id);
    if (result === undefined) return [];
    return [{ iconId: icon.id, cell, art: result, caption: icon.name }];
  });
}
