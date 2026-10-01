// ui/SvgOverlayHost.tsx — one modal owner for key editing, generation consent,
// sanitized code inspection and per-source version/request history.

import type { DirHandleLike } from "../../lib/fs";
import type { SvgReviewDecision, SvgSourceRow, SvgLoadedVersion } from "../types";
import type { useRequestyKey } from "./useRequestyKey";
import type { useSvgRun } from "./useSvgRun";
import type { SvgRunPlan } from "./useSvgRun";
import SvgConfirmDialog from "./SvgConfirmDialog";
import SvgCodeDialog from "./SvgCodeDialog";
import SvgHistoryDialog from "./SvgHistoryDialog";
import SvgKeyDialog from "./SvgKeyDialog";

export type SvgDialogState =
  | { kind: "key" }
  | { kind: "confirm" }
  | { kind: "code"; sourceId: string; version: number }
  | { kind: "history"; sourceId: string };

interface SvgOverlayHostProps {
  dialog: SvgDialogState | null;
  rows: SvgSourceRow[];
  root: { current: DirHandleLike | null };
  plan: SvgRunPlan | null;
  credentials: ReturnType<typeof useRequestyKey>;
  run: ReturnType<typeof useSvgRun>["run"];
  onClose: () => void;
  onConfirm: () => void;
  onCode: (row: SvgSourceRow, version: SvgLoadedVersion) => void;
  onReview: (row: SvgSourceRow, version: number, decision: SvgReviewDecision) => void;
  onNotice: (message: string) => void;
}

export default function SvgOverlayHost(p: SvgOverlayHostProps) {
  const dialog = p.dialog;
  if (!dialog) return null;
  if (dialog.kind === "key") return <SvgKeyDialog available={p.credentials.available} error={p.credentials.error}
    onSave={p.credentials.save} onRemove={p.credentials.remove} onClose={p.onClose} />;
  if (dialog.kind === "confirm") return p.plan
    ? <SvgConfirmDialog plan={p.plan} onConfirm={p.onConfirm} onClose={p.onClose} /> : null;
  const row = p.rows.find((item) => item.sourceId === dialog.sourceId);
  if (!row) return null;
  if (dialog.kind === "history") return <SvgHistoryDialog row={row} root={p.root} onClose={p.onClose}
    onCode={(version) => p.onCode(row, version)} onReview={(version, decision) => p.onReview(row, version, decision)} />;
  const version = row.versions.find((item) => item.version === dialog.version);
  return version ? <SvgCodeDialog row={row} version={version} onClose={p.onClose} onNotice={p.onNotice} /> : null;
}
