// DetailPane.tsx — the comparison card (spec §5, §6; design right column):
// header with the decisions, Original and AI result side by side, the discovery
// line and the keyboard legend. Purely presentational — the panel owns state.

import { formatLongDateTime } from "../lib/reviewformat";
import type { Decision } from "../lib/reviewfile";
import type { ReviewItem } from "../lib/reviewmerge";
import DetailHead from "./DetailHead";
import SidePane from "./SidePane";
import type { SideView } from "./sides";

export interface DetailPaneProps {
  item: ReviewItem;
  rootName: string;
  sides: { source: SideView | null; ai: SideView | null; busy: boolean };
  zoom: "fit" | "100";
  autoNext: boolean;
  decide: (decision: Decision) => void;
  setAutoNext: (on: boolean) => void;
  openPath: (relPath: string) => void;
}

export default function DetailPane(props: DetailPaneProps) {
  const { item, rootName, sides, zoom } = props;
  return (
    <section className="panel flex min-w-0 flex-col gap-3" data-testid="compare-view" aria-label="Image comparison">
      <DetailHead item={item} zoom={zoom} autoNext={props.autoNext}
        onSetAutoNext={props.setAutoNext} decide={props.decide} />
      <div className="grid gap-3 lg:grid-cols-2">
        <SidePane title="Original" side={sides.source} missingNote="Original missing" rootName={rootName} zoom={zoom} openPath={props.openPath} />
        <SidePane title="AI result" side={sides.ai} missingNote="AI result missing" rootName={rootName} zoom={zoom} openPath={props.openPath} />
      </div>
      <footer className="flex flex-wrap items-start gap-4 border-t border-white/10 pt-3">
        <Discovery item={item} busy={sides.busy} />
        <Legend />
      </footer>
    </section>
  );
}

function Discovery({ item, busy }: { item: ReviewItem; busy: boolean }) {
  return (
    <div className="min-w-0 text-xs">
      <p className="mb-1 text-[11px] tracking-wide text-slate-500 uppercase">DISCOVERY</p>
      <p className="text-slate-300" data-testid="detail-discovery">
        {item.source && <>Created {formatLongDateTime(item.source.mtime)}</>}
        {item.source && item.ai && " · "}
        {item.ai && <>Generated {formatLongDateTime(item.ai.mtime)}</>}
        {busy && <span className="ml-2 animate-pulse text-slate-400">reading…</span>}
      </p>
      <p className="text-slate-500">{matchNote(item)}</p>
    </div>
  );
}

function matchNote(item: ReviewItem): string {
  if (item.kind === "paired") return "Matched by suffix: _AI · source hierarchy preserved";
  if (item.kind === "ai-only") return "Matched by suffix: _AI · original image missing";
  return "No _AI result found for this source — approve or decline it as unusable";
}

function Legend() {
  return (
    <div className="ml-auto text-right text-xs">
      <p className="mb-1 text-[11px] tracking-wide text-slate-500 uppercase">KEYBOARD</p>
      <p className="text-slate-300">
        <Key k="A" /> Approve <Key k="D" /> Decline <Key k="↑↓" /> Navigate <Key k="Space" /> Fit / 100%
      </p>
      <p className="text-slate-500">Decisions persist by stable pair ID and timestamp</p>
    </div>
  );
}

function Key({ k }: { k: string }) {
  return <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-200">{k}</kbd>;
}
