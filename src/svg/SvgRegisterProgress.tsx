// SvgRegisterProgress.tsx — the bar the two register passes report through
// (2026-11-02). One bar per tab, in the same stack and with the same language as
// the generation and upload bars: percent, done/total, the pair being read, and a
// green finished state that also plays the completion cue — registering 200
// folders is no longer a silent wait with a toast at the end.
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { processTotals } from "../lib/processprogress";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import { useProcessSlot } from "../ui/useProcessSlot";
import { clearRegister, registerDetail, registerNote, registerSlot, registerTitle, type RegisterProgress as Snapshot } from "./registerprogress";
import type { SvgRefs } from "./types";

/** Long enough to read "complete", short enough not to sit in the way. */
const KEEP_MS = 6000;

export default function RegisterProgress({ refs }: { refs: SvgRefs }) {
  const p = useProcessSlot(registerSlot(refs));
  const done = p?.phase === "complete";
  useAutoClear(refs, p?.id ?? null, done);
  if (p === null) return null;
  return mount(<RegisterBar refs={refs} p={p} />);
}

/** A finished bar clears itself; its ✕ does the same thing at once. */
function useAutoClear(refs: SvgRefs, id: string | null, done: boolean): void {
  useEffect(() => {
    if (id === null || !done) return undefined;
    const timer = setTimeout(() => clearRegister(refs), KEEP_MS);
    return () => clearTimeout(timer);
  }, [refs, id, done]);
}

/** Same portal stack as every other process bar, so it cannot be missed. */
function mount(content: ReactNode): ReactNode {
  const target = document.getElementById("svg-progress-mount");
  return target === null ? content : createPortal(content, target);
}

function RegisterBar({ refs, p }: { refs: SvgRefs; p: Snapshot }) {
  const totals = processTotals({ done: p.done, total: p.total });
  const done = p.phase === "complete";
  return (
    <ProcessProgressBar prefix={`register-${p.kind}`} theme="svg"
      title={registerTitle(p)} detail={registerDetail(p)}
      done={totals.done} total={totals.total} remaining={totals.left} percent={done ? 100 : totals.percent}
      note={registerNote(p)}
      complete={done} cue={p.id} leading={<span aria-hidden="true">{done ? "✓" : "⤓"}</span>}
      actions={done ? <Dismiss refs={refs} kind={p.kind} /> : undefined} />
  );
}

function Dismiss({ refs, kind }: { refs: SvgRefs; kind: Snapshot["kind"] }) {
  return (
    <button type="button" className="svg-progress-close" aria-label="Dismiss register progress"
      data-testid={`register-${kind}-progress-dismiss`} onClick={() => clearRegister(refs)}>✕</button>
  );
}
