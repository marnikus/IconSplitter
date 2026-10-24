import { useCallback, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import { imageProgressStore, type ImageProcess } from "./imgprogress";
import type { SvgRefs } from "./types";

export default function SvgImageProgress({ refs, onStop }: { refs: SvgRefs; onStop: () => void }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const store = imageProgressStore(refs);
  const subscribe = useCallback((fn: () => void) => {
    store.listeners.add(fn);
    return () => { store.listeners.delete(fn); };
  }, [store]);
  const process = useSyncExternalStore(subscribe, () => store.value);
  if (!process || process.id === dismissed) return null;
  const done = process.saved + process.failed + process.discarded;
  const active = process.phase !== "complete" && process.phase !== "stopped";
  const content = <ProcessProgressBar prefix="svg-image" theme="svg" title={titleOf(process)}
    detail={`Request ${process.request} of ${process.requests} · ${process.saved} saved · ${process.failed} failed · ${process.discarded} discarded`}
    done={done} total={process.total} remaining={Math.max(0, process.total - done)}
    percent={process.total > 0 ? Math.round(done / process.total * 100) : 0} leading={<span aria-hidden="true">▧</span>}
    complete={!active} actions={active
      ? <button className="svg-btn tiny" data-testid="svg-image-progress-stop" disabled={process.stopping} onClick={onStop}>Stop image run</button>
      : <button className="svg-btn tiny" data-testid="svg-image-progress-dismiss" onClick={() => setDismissed(process.id)}>Dismiss</button>} />;
  const mount = document.getElementById("svg-progress-mount");
  return mount ? createPortal(content, mount) : content;
}
function titleOf(p: ImageProcess): string {
  if (p.phase === "stopped") return "AI image regeneration stopped";
  if (p.phase === "complete") return p.failed > 0 || p.saved + p.discarded < p.total ? "AI image regeneration ended — check results" : "AI image regeneration complete";
  if (p.stopping) return "Stopping AI image regeneration — sent results will finish";
  if (p.phase === "review") return "AI image regeneration — waiting for Apply / Discard";
  return p.phase === "saving" ? "AI image regeneration — saving new versions" : "Regenerating AI images";
}
