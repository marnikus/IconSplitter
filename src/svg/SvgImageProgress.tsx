// SvgImageProgress.tsx — the AI image run's bar, in the shared lifecycle
// (ui/ProcessProgressBar): Stop while it runs, then Review results + ✕; it
// stays until dismissed or until the next image run replaces it.
import { useState } from "react";
import { createPortal } from "react-dom";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import { useProcessSlot } from "../ui/useProcessSlot";
import { imageProgressStore, imageStatusOf, type ImageProcess } from "./imgprogress";
import type { SvgRefs } from "./types";

interface Props { refs: SvgRefs; onStop: () => void; onReview: () => void }

export default function SvgImageProgress({ refs, onStop, onReview }: Props) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const process = useProcessSlot(imageProgressStore(refs));
  if (!process || process.id === dismissed) return null;
  const done = process.saved + process.failed + process.discarded;
  const content = <ProcessProgressBar prefix="svg-image" theme="svg" title={titleOf(process)}
    detail={`Request ${process.request} of ${process.requests} · ${process.saved} saved · ${process.failed} failed · ${process.discarded} discarded`}
    done={done} total={process.total} remaining={Math.max(0, process.total - done)}
    percent={process.total > 0 ? Math.round(done / process.total * 100) : 0} leading={<span aria-hidden="true">▧</span>}
    status={imageStatusOf(process)} runId={process.id}
    onCancel={onStop} cancelLabel="Stop image run" cancelDisabled={process.stopping}
    onReview={onReview} onDismiss={() => setDismissed(process.id)} />;
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
