// BoundaryPreview.tsx — detected boundaries overlay
// Shows sheet image with boxes and export squares, click to toggle.

import { cropRect, squareInfo } from "../lib/render";
import type { Box } from "../lib/detect";

type Active = {
  id: string;
  name: string;
  url: string;
  img: { naturalWidth: number; naturalHeight: number };
  boxes: Box[];
  excluded: number[];
};

type Item = { i: number; sq: { total: number } };

type Props = {
  active: Active;
  activeItems: Item[];
  padding: number;
  onToggle: (id: string, idx: number) => void;
};

export default function BoundaryPreview({ active, activeItems, padding, onToggle }: Props) {
  return (
    <section className="panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="panel-title !mb-0">Detected boundaries — {active.name}</h3>
        <Legend />
      </div>
      <div className="relative mx-auto max-w-2xl overflow-hidden rounded-xl bg-white">
        <img src={active.url} alt="sheet" className="block w-full" draggable={false} />
        <svg viewBox={`0 0 ${active.img.naturalWidth} ${active.img.naturalHeight}`} className="absolute inset-0 h-full w-full">
          {active.boxes.map((b, i) => (
            <BoxOverlay key={i} idx={i} box={b} active={active} activeItems={activeItems} padding={padding} onToggle={onToggle} />
          ))}
        </svg>
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-400">
      <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm border-2 border-emerald-400" /> icon</span>
      <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm border-2 border-dashed border-indigo-400" /> export square</span>
      <span>Click a box to include / exclude</span>
    </div>
  );
}

function BoxOverlay({ idx, box, active, activeItems, padding, onToggle }: { idx: number; box: Box; active: Active; activeItems: Item[]; padding: number; onToggle: Props["onToggle"] }) {
  const off = active.excluded.includes(idx);
  const sw = active.img.naturalWidth / 380;
  const it = activeItems.find((x) => x.i === idx);
  const sqi = it ? it.sq : squareInfo(active.boxes, padding);
  const cr = cropRect(box, sqi.total);
  return (
    <g data-testid={`box-toggle-${idx}`} onClick={() => onToggle(active.id, idx)} className="cursor-pointer">
      {!off && <rect x={cr.x} y={cr.y} width={cr.size} height={cr.size} fill="none" stroke="#6366f1" strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 3}`} />}
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={off ? "rgba(100,116,139,.35)" : "rgba(16,185,129,.10)"} stroke={off ? "#94a3b8" : "#10b981"} strokeWidth={sw * 1.4} strokeDasharray={off ? `${sw * 3} ${sw * 3}` : undefined} />
      <circle cx={box.x + 14 * sw} cy={box.y + 14 * sw} r={11 * sw} fill={off ? "#64748b" : "#10b981"} />
      <text x={box.x + 14 * sw} y={box.y + 14 * sw} fontSize={13 * sw} fontWeight={700} fill="white" textAnchor="middle" dominantBaseline="central">{idx + 1}</text>
    </g>
  );
}
