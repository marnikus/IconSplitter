// SidePane.tsx — one side of the comparison (spec §5): a labelled, fixed-height
// preview that never stretches (object-contain at "fit", true pixels at 1:1),
// with dimensions, format, file size and path, and the browser-safe
// "Open in File Explorer" action.

import { dimensions, formatBytes, windowsPath } from "../lib/reviewformat";
import Glyph from "../ui/Glyph";
import type { SideInfo, SideView } from "./sides";

export interface SidePaneProps {
  title: "Original" | "AI result";
  side: SideView | null;
  missingNote: string;
  rootName: string;
  zoom: "fit" | "100";
  openPath: (relPath: string) => void;
}

export default function SidePane({ title, side, missingNote, rootName, zoom, openPath }: SidePaneProps) {
  const testid = title === "Original" ? "compare-original" : "compare-ai";
  return (
    <section data-testid={testid} className="flex min-w-0 flex-col rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-slate-400"><Glyph name={title === "Original" ? "image" : "sync"} /></span>
        <h3 className="text-xs font-semibold tracking-wide text-slate-200 uppercase">{title}</h3>
        {side?.info && (
          <button type="button" className="btn-mini ml-auto" title="Opens your clipboard — browsers cannot launch Explorer"
            onClick={() => openPath(side.info!.relPath)}>
            Open in File Explorer
          </button>
        )}
      </div>
      <div className="grid h-72 place-items-center overflow-auto rounded-lg border border-white/5 bg-slate-950/70 lg:h-[26rem]">
        <Preview side={side} title={title} missingNote={missingNote} zoom={zoom} />
      </div>
      {side?.info && <Meta info={side.info} rootName={rootName} />}
    </section>
  );
}

function Preview({ side, title, missingNote, zoom }: { side: SideView | null; title: string; missingNote: string; zoom: "fit" | "100" }) {
  if (!side) return <p className="p-4 text-center text-sm text-amber-300">⚠ {missingNote}</p>;
  if (side.error) return <p className="p-4 text-center text-sm text-rose-300">{side.error}</p>;
  if (!side.url || !side.info) return <p className="animate-pulse p-4 text-center text-sm text-slate-400">Loading preview…</p>;
  if (zoom === "100") {
    return <img src={side.url} alt={`${title} preview`} style={{ width: side.info.width, height: side.info.height }} className="max-w-none" />;
  }
  return <img src={side.url} alt={`${title} preview`} className="h-full w-full object-contain" />;
}

function Meta({ info, rootName }: { info: SideInfo; rootName: string }) {
  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="truncate font-mono text-xs text-slate-200">{info.relPath.split("/").pop()}</p>
        <p className="ml-auto text-xs text-slate-400">
          {dimensions(info.width, info.height)} · {info.format} · {formatBytes(info.size)}
        </p>
      </div>
      <p className="truncate font-mono text-[11px] text-slate-500" title={info.relPath}>
        {windowsPath(rootName, info.relPath)}
      </p>
    </div>
  );
}
