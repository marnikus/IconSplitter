// DetailHead.tsx — the comparison header (design): pair name + review status,
// the stable pair token with its folder, the sync badge, Decline / Approve
// above the AI result (spec §6) and the "next pending" roll-over switch.

import { pairToken } from "../lib/reviewformat";
import type { Decision } from "../lib/reviewfile";
import type { ReviewItem } from "../lib/reviewmerge";
import Glyph from "../ui/Glyph";
import StatusBadge from "./StatusBadge";

export interface DetailHeadProps {
  item: ReviewItem;
  zoom: "fit" | "100";
  autoNext: boolean;
  onSetAutoNext: (on: boolean) => void;
  decide: (decision: Decision) => void;
}

export default function DetailHead(props: DetailHeadProps) {
  const { item } = props;
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-semibold" data-testid="detail-name">{item.ai?.name ?? item.source?.name ?? item.base}</h2>
          <StatusBadge status={item.status} long />
        </div>
        <p className="truncate text-xs text-slate-500" data-testid="detail-pair">
          {pairToken(item.id)} · {item.dirPath === "" ? "root" : item.dirPath}
        </p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SyncBadge zoom={props.zoom} />
        <DecideButtons status={item.status} decide={props.decide} />
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" data-testid="next-pending" checked={props.autoNext}
            onChange={(e) => props.onSetAutoNext(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
          Next pending
        </label>
      </div>
    </header>
  );
}

function SyncBadge({ zoom }: { zoom: "fit" | "100" }) {
  return (
    <span data-testid="zoom-badge" className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-200">
      <Glyph name="sync" />
      {zoom === "100" ? "1:1 SYNC" : "FIT SYNC"}
    </span>
  );
}

function DecideButtons({ status, decide }: { status: Decision; decide: (decision: Decision) => void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button" data-testid="review-decline" aria-pressed={status === "declined"} onClick={() => decide("declined")}
        className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-500 focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:outline-none"
      >
        <Glyph name="declined" /> Decline
      </button>
      <button
        type="button" data-testid="review-approve" aria-pressed={status === "approved"} onClick={() => decide("approved")}
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none"
      >
        <Glyph name="approved" /> Approve
      </button>
    </div>
  );
}
