// Established package row: modifiers, native-control isolation and Enter/Space.
// Projection refs remain supported; checked/active state stays in each workflow.
import type { ReactNode, Ref } from "react";
import { selectIntent, type SelectIntent } from "../lib/reviewselect";
import { isRowGestureClick } from "./rowgesture";
interface RowProps {
  testid: string; name: string; rowRef?: Ref<HTMLDivElement>; className?: string; active?: boolean;
  checked?: boolean; disabled?: boolean; checkTestid?: string; detailTestid?: string;
  onSelect: (intent: SelectIntent) => void; onToggle: () => void; detail?: ReactNode; children: ReactNode;
}
export default function PackageRow(p: RowProps) {
  return <div ref={p.rowRef} role="listitem" data-testid={p.testid} tabIndex={-1} aria-current={p.active ? "true" : undefined}
    className={`up-row${p.className ? ` ${p.className}` : ""}`}
    onClick={e => { if (!p.disabled && isRowGestureClick(e)) p.onSelect(selectIntent(e)); }}
    onKeyDown={e => { if (!p.disabled && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); p.onSelect("replace"); } }}>
    <input type="checkbox" className="up-check" data-testid={p.checkTestid} aria-label={`Select ${p.name}`}
      checked={p.checked} disabled={p.disabled} onClick={e => e.stopPropagation()} onChange={p.onToggle} />
    {p.children}
    {p.detail && <div className="up-detail" data-testid={p.detailTestid}>{p.detail}</div>}
  </div>;
}
export function PackageFileCell(p: { name: string; path: string; info: ReactNode; pathTestid?: string; infoTestid?: string; infoTitle?: string; children: ReactNode }) {
  return <div className="svg-file-main">
    <div className="svg-file-name" title={p.name}>{p.name}</div>
    <div className="svg-file-sub" data-testid={p.pathTestid} title={p.path}>{p.path}</div>
    <div className="svg-persist" data-testid={p.infoTestid} title={p.infoTitle}>{p.info}</div>
    {p.children}
  </div>;
}
