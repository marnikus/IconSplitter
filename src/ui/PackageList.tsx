// Existing SVG-to-upload package table; one DOM/CSS owner for both workflows.
import type { ReactNode } from "react";
interface ListProps {
  testid: string; label: string; previewLabel?: string; rowsTestid?: string;
  header: ReactNode; footer: ReactNode; empty: boolean; emptyText: string; emptyTestid?: string; children: ReactNode;
}
export default function PackageList(p: ListProps) {
  return <div className="svg-panel" data-testid={p.testid}>
    {p.header}
    <div className="pair-table">
      <PackageColumns previewLabel={p.previewLabel} />
      <div className="svg-rows" role="listbox" aria-label={p.label} data-testid={p.rowsTestid}>
        {p.children}
        {p.empty && <p className="svg-empty" data-testid={p.emptyTestid}>{p.emptyText}</p>}
      </div>
    </div>
    {p.footer}
  </div>;
}
function PackageColumns({ previewLabel = "Approved SVG" }: { previewLabel?: string }) {
  return <div className="up-columns" aria-hidden="true">
    <span /><span>{previewLabel}</span><span>File / export folder</span><span>Package</span><span>Metadata</span><span>Settings</span><span>Actions</span>
  </div>;
}
export function PackageListHead(p: { title: string; count: number; scope: string; countTestid?: string; attention?: ReactNode }) {
  return <header className="svg-head">
    <div className="svg-title"><h1>{p.title}</h1><span data-testid={p.countTestid}>{p.count}</span><span>{p.scope}</span></div>
    {p.attention}
  </header>;
}
export function PackageListFooter(p: { summary: ReactNode; hint: string; summaryTestid?: string }) {
  return <footer className="svg-list-footer"><span data-testid={p.summaryTestid}>{p.summary}</span><span className="svg-hints">{p.hint}</span></footer>;
}
