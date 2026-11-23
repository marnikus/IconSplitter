// SvgBuilderExportProgress.tsx — top-of-shell ProcessProgressBar for SVG builder
// artboard export (`builder-progress-mount`, prefix `builder-export`).
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { setAppState } from "../state/appstore";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import { useProcessSlot } from "../ui/useProcessSlot";
import {
  builderExportCopy,
  builderExportSlot,
  cancelBuilderExport,
  dismissBuilderExport,
  resetBuilderExport,
} from "./exportprogress";

function reviewExportedArtboards(): void {
  setAppState({ tab: "svgBuilder" });
  requestAnimationFrame(() => {
    document.querySelector('[data-testid="builder-artboards"]')?.scrollIntoView({ block: "nearest" });
  });
}

export default function SvgBuilderExportProgress() {
  const p = useProcessSlot(builderExportSlot);
  useEffect(() => () => resetBuilderExport(), []);
  if (p === null || p.total <= 0) return null;
  const { title, detail, totals } = builderExportCopy(p);
  const bar = (
    <ProcessProgressBar
      prefix="builder-export"
      theme="svg"
      title={title}
      detail={detail}
      done={totals.done}
      total={totals.total}
      remaining={totals.left}
      percent={totals.percent}
      status={p.status}
      runId={p.runId}
      leading={<div className="svg-progress-icon" aria-hidden="true">⇪</div>}
      cancelDisabled={p.cancelling}
      onCancel={cancelBuilderExport}
      onReview={reviewExportedArtboards}
      onDismiss={dismissBuilderExport}
    />
  );
  const mount = document.getElementById("builder-progress-mount");
  return mount ? createPortal(bar, mount) : bar;
}
