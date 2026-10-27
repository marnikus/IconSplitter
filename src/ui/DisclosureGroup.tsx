// Original Export settings disclosure. Native keyboard and mounted contents.
import type { ReactNode } from "react";
export default function DisclosureGroup(p: { label: string; children: ReactNode; testid?: string; summaryTestid?: string }) {
  return <details className="up-shadow-dialog" data-testid={p.testid}>
    <summary className="up-set-group-summary" data-testid={p.summaryTestid}>{p.label}</summary>
    <div className="up-set-group-content">{p.children}</div>
  </details>;
}
