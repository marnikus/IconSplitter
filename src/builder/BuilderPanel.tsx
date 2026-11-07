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
import { useBuilderArt, type BuilderArt } from "./useBuilderArt";
import type { BuilderShell } from "./useBuilderShell";
import { BuilderPickRoot, BuilderUnsupported } from "./BuilderEmpty";
import { useBuilderShell } from "./useBuilderShell";

export default function BuilderPanel({ active = true }: { active?: boolean }) {
  const g = useBuilderShell();
  const art = useBuilderArt(g.root, g.icons, g.config, g.selection?.slots);
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
      {g.root === null ? <BuilderPickRoot onPick={g.chooseRoot} /> : <WorkArea shell={g} art={art} />}
      {g.toast !== null && <p className="bld-note" data-testid="builder-toast" role="status">{g.toast}</p>}
    </div>
  );
}

/** The working screen once a folder is picked: controls and rail left, sheet right. */
function WorkArea({ shell, art }: { shell: BuilderShell; art: BuilderArt }) {
  return (
    <div className="bld-work">
      <div className="bld-side">
        <BuilderControls config={shell.config} onChange={shell.setConfig} />
        <BuilderRecipe recipe={shell.recipe} seed={shell.seed} result={shell.selection}
          folders={shell.facets.folders.map(([f]) => f)} tags={shell.facets.tags.map(([t]) => t)}
          onChange={shell.setRecipe} onReroll={shell.reroll} onClear={shell.clear} onSeed={shell.setSeed} />
        <BuilderLibrary shell={shell} />
      </div>
      <BuilderArtboard config={shell.config} slots={art.slots} placed={art.placed} zoom={art.zoom} />
    </div>
  );
}
