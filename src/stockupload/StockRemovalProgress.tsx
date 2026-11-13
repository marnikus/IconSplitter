// StockRemovalProgress.tsx — the job bar of "Remove unsuccessful uploads": which
// stock, how far, and — when finished — how many badges and history files went.
// Portalled to the stock-upload mount so it shows from every tab.
import { createPortal } from "react-dom";
import { setAppState } from "../state/appstore";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import { useProcessSlot } from "../ui/useProcessSlot";
import { dismissRemoval, removalBarOf, removalSlot } from "./removalprogress";
import { processTotals } from "../lib/processprogress";

export default function StockRemovalProgress() {
  const p = useProcessSlot(removalSlot);
  if (p === null) return null;
  const { title, detail } = removalBarOf(p);
  const t = processTotals(p);
  const content = (
    <ProcessProgressBar prefix="stock-removal" theme="svg" title={title} detail={detail}
      done={t.done} total={t.total} remaining={t.left} percent={t.percent} status={p.status} runId={p.runId}
      leading={<span className="svg-progress-check" aria-hidden="true">◍</span>}
      onCancel={() => {}} cancelDisabled
      onReview={() => setAppState({ tab: "stockUpload" })} onDismiss={dismissRemoval} />
  );
  const mount = document.getElementById("stock-upload-progress-mount");
  return mount ? createPortal(content, mount) : content;
}
