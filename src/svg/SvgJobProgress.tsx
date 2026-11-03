import type { SvgGenApi } from "./useSvgGen";
import type { DirHandleLike } from "../lib/fs";
import { setAppState } from "../state/appstore";
import SvgRegisterProgress from "./SvgRegisterProgress";
import SvgImageProgress from "./SvgImageProgress";
import SvgProgressHeader from "./SvgProgressHeader";
import { useJobViews } from "./useJobViews";
import { processTotals } from "./jobprogress";

export default function SvgJobProgress({ g, rootRef }: { g: SvgGenApi; rootRef: { current: DirHandleLike | null } }) {
  const jobs = useJobViews(g.refs);
  return <><SvgRegisterProgress refs={g.refs} onReview={reviewSvg} /><SvgImageProgress refs={g.refs} onStop={g.stopImageRegen} onReview={reviewSvg} /><SvgProgressHeader progress={g.progress} running={g.running} queue={g.queue} chain={g.chain}
    currentId={g.currentId} rows={g.rows} rootRef={rootRef} aggregate={processTotals(jobs, g.queue)}
    onCancel={() => g.cancelRun()} onDismiss={() => g.dispatch({ type: "progress", progress: null })}
    onReview={reviewSvg} /></>;
}

/** Every Generate SVG bar reviews in the same place: the Generate SVG tab. */
function reviewSvg(): void {
  setAppState({ tab: "generateSvg" });
}
