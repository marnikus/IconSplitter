import PackageList, { PackageListHead, PackageListFooter } from "../ui/PackageList";
import { cloneElement, useMemo } from "react";
import { useCheckedRows } from "../ui/checkedrows";
import { useRowPresentation } from "../ui/rowpresentation";
// UploadList.tsx — the icon list of the "SVG to upload" tab (design §4.2): head
// with the row count and the attention counters, the column header, the
// scrolling rows, and the footer line. The list holds no state of its own:
// filtering, sorting and the selection all come from the hook, so the rules
// stay in rowmodel (RULE 10).

import UploadRowView, { type UploadRowActions } from "./UploadRow";
import type { UploadApi } from "./useUpload";

export interface UploadListProps {
  g: UploadApi;
  actions: UploadRowActions;
}

export default function UploadList({ g, actions }: UploadListProps) {
  const { checked, activeId, ...presentation } = actions;
  const a = useRowPresentation(presentation);
  const register = useCheckedRows(checked, activeId, true);
  const base = useMemo(() => g.visible.map((row) => (
    <UploadRowView key={row.source.id} row={row} a={a} register={register} />
  )), [g.visible, a, register]);
  // Only the active row gets a new element (it mounts its metadata fields).
  const rows = useMemo(() => {
    const at = g.visible.findIndex((row) => row.source.id === activeId);
    if (at < 0) return base;
    const out = base.slice();
    out[at] = cloneElement(base[at], { active: true });
    return out;
  }, [base, g.visible, activeId]);
  return <PackageList testid="upload-list" header={<ListHead g={g} />} footer={<ListFooter g={g} />}
    label="Approved SVGs to export" rowsTestid="upload-rows" empty={g.visible.length === 0}
    emptyText="No approved SVG matches these filters." emptyTestid="upload-empty">{rows}</PackageList>;
}

/** The head: the visible count and the attention counters. */
function ListHead({ g }: { g: UploadApi }) {
  const running = g.rows.filter((r) => r.running !== null).length;
  const attention = g.rows.filter((r) => r.record?.status === "failed" || r.stale).length;
  return <PackageListHead title="APPROVED SVGS / EXPORT PACKAGES" count={g.visible.length} countTestid="upload-row-count" scope="one package per pair"
    attention={<div className="svg-attention"><span className="running" data-testid="upload-running-count">{running} in flight</span><span className="needs" data-testid="upload-attention-count">{attention} need attention</span></div>} />;
}

/** What the list says under itself: how much is shown, and the one hint. */
function ListFooter({ g }: { g: UploadApi }) {
  return <PackageListFooter summaryTestid="upload-footer-summary" summary={`Showing ${g.visible.length} of ${g.rows.length} approved SVGs`}
    hint="↑↓ active · E/Q check/uncheck · click a row for metadata fields · Export writes into the pair's folder" />;
}
