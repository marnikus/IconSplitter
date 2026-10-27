// The existing SVG provider card, controlled by its owning workflow.
import type { ReactNode } from "react";
interface Props {
  open: boolean; onOpen: (open: boolean) => void; title: ReactNode; details?: ReactNode; children: ReactNode;
  testid?: string; toggleTestid?: string; label?: string; toggleLabel?: string;
}
export default function ProviderCardShell(p: Props) {
  return <div className={`svg-provider${p.open ? "" : " closed"}`} data-testid={p.testid} aria-label={p.label}>
    <div className="svg-provider-top">
      <span>{p.title}</span>{p.details}
      <button type="button" className="svg-link" data-testid={p.toggleTestid} aria-expanded={p.open}
        aria-label={`${p.open ? "Minimize" : "Restore"} ${p.toggleLabel ?? "provider settings"}`}
        onClick={() => p.onOpen(!p.open)}>{p.open ? "Minimize" : "Restore"}</button>
    </div>
    {p.open && p.children}
  </div>;
}
