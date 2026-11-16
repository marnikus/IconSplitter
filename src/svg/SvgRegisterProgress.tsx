// SvgRegisterProgress.tsx — the bar the two register passes report through
// (2026-11-02), in the shared lifecycle (ui/ProcessProgressBar, 2026-11-03):
// Cancel while it reads folders, then Review results + ✕. A finished pass STAYS
// until its ✕ or the next pass — it used to clear itself after 6 s.
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { processTotals } from "../lib/processprogress";
import ProcessProgressBar from "../ui/ProcessProgressBar";
import { useProcessSlot } from "../ui/useProcessSlot";
import {
  cancelRegister, clearRegister, registerDetail, registerNote, registerSlot, registerStatusOf, registerTitle,
} from "./registerprogress";
import type { SvgRefs } from "./types";

export default function RegisterProgress({ refs, onReview }: { refs: SvgRefs; onReview: () => void }) {
  const p = useProcessSlot(registerSlot(refs));
  if (p === null) return null;
  const totals = processTotals({ done: p.done, total: p.total });
  const status = registerStatusOf(p);
  return mount(
    <ProcessProgressBar prefix={`register-${p.kind}`} theme="svg"
      title={registerTitle(p)} detail={registerDetail(p)}
      done={totals.done} total={totals.total} remaining={totals.left} percent={status === "completed" ? 100 : totals.percent}
      note={registerNote(p)} status={status} runId={p.id} leading={<span aria-hidden="true">⤓</span>}
      onCancel={() => { cancelRegister(refs); }} onReview={onReview} onDismiss={() => clearRegister(refs)} />,
  );
}

/** Same portal stack as every other process bar, so it cannot be missed. */
function mount(content: ReactNode): ReactNode {
  const target = document.getElementById("svg-progress-mount");
  return target === null ? content : createPortal(content, target);
}
