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
import { BuilderPickRoot, BuilderUnsupported } from "./BuilderEmpty";
import { useBuilderShell } from "./useBuilderShell";

export default function BuilderPanel({ active = true }: { active?: boolean }) {
  const g = useBuilderShell();
  useBusyActivity("builder", g.busy);
  // A reload must not land inside a sheet-metadata request.
  useRunning("builder", false);
  if (!g.supported) {
    return <div className="svg bld" data-testid="builder-panel-unsupported"><BuilderUnsupported onPick={g.chooseRoot} /></div>;
  }
  return (
    <div className="svg bld" data-testid="builder-panel" data-active={active ? "true" : "false"}>
      <BuilderSourceBar rootName={g.rootName} root={null} scope={g.scope} busy={g.busy}
        onChooseRoot={g.chooseRoot} onRescan={g.rescan} />
      <BuilderPickRoot onPick={g.chooseRoot} />
      {g.toast !== null && (
        <p className="bld-note" data-testid="builder-toast" role="status">{g.toast}</p>
      )}
    </div>
  );
}
