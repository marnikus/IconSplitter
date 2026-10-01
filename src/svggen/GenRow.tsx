// GenRow.tsx — one approved source row (template columns): AI thumb + newest
// SVG, file/persistence, generation, review, version/tokens/cost, files/code/
// history, generate/decision. Statuses are glyph AND text (RULE 4).

import type { SvgRow } from "./rows";

export interface GenRowMods {
  checked: boolean;
  onCheck: (id: string) => void;
  onGenerate: (id: string) => void;
  onReview: (id: string, r: "approved" | "declined") => void;
  onCopy: (id: string) => void;
  onCode: (id: string) => void;
  onHistory: (id: string) => void;
}

const GEN_GLYPH: Record<SvgRow["generation"], string> = {
  "not-generated": "○", generating: "◌", generated: "✓", failed: "", interrupted: "",
};

export default function GenRow({ row, mods }: { row: SvgRow; mods: GenRowMods }) {
  const hasSvg = row.version !== null;
  return (
    <div data-testid={`sg-row-${row.pairId}`} className="grid grid-cols-[auto_2fr_2fr_1fr_1fr_1fr_auto_auto] items-center gap-3 border-b border-white/5 px-3 py-2 text-xs">
      <input
        type="checkbox" data-testid={`sg-check-${row.pairId}`} checked={mods.checked}
        onChange={() => mods.onCheck(row.pairId)} aria-label={`Select ${row.name}`}
      />
      <FileCell row={row} hasSvg={hasSvg} />
      <GenCell row={row} />
      <div data-testid={`sg-review-${row.pairId}`}>{row.review ?? "— no decision"}</div>
      <UsageCell row={row} />
      <FilesCell row={row} hasSvg={hasSvg} mods={mods} />
      <ActionsCell row={row} hasSvg={hasSvg} mods={mods} />
    </div>
  );
}

function FileCell({ row, hasSvg }: { row: SvgRow; hasSvg: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-slate-100">{row.name}</div>
      <div className="truncate text-slate-500">{row.relDir}</div>
      <div className={row.sidecarError ? "text-amber-300" : "text-slate-500"}>
        {row.sidecarError ? "Sidecar write awaiting retry" : hasSvg ? `Saved · v${row.version}` : "Missing sidecar · ready to generate"}
      </div>
    </div>
  );
}

function GenCell({ row }: { row: SvgRow }) {
  return (
    <div>
      <span data-testid={`sg-gen-${row.pairId}`} className="rounded-full bg-white/10 px-2 py-0.5">
        {GEN_GLYPH[row.generation]} {row.generation}
      </span>
      {row.warnings.length > 0 && <div className="mt-1 text-amber-300">⚠ {row.warnings[0]}</div>}
    </div>
  );
}

function UsageCell({ row }: { row: SvgRow }) {
  return (
    <div className="text-slate-400">
      <div>{row.version !== null ? `v${row.version} · newest` : "no version"}</div>
      <div>{row.tokensTotal !== null ? `${row.tokensTotal.toLocaleString()} tokens` : "no usage"}</div>
      <div>{row.cost !== null ? `$${row.cost.toFixed(3)} ${row.costKind === "actual" ? "actual" : "estimated"}` : "—"}</div>
    </div>
  );
}

function FilesCell({ row, hasSvg, mods }: { row: SvgRow; hasSvg: boolean; mods: GenRowMods }) {
  return (
    <div className="flex gap-1">
      <button type="button" data-testid={`sg-copy-${row.pairId}`} disabled={!hasSvg} onClick={() => mods.onCopy(row.pairId)} className={BTN}>Copy</button>
      <button type="button" data-testid={`sg-code-${row.pairId}`} disabled={!hasSvg} onClick={() => mods.onCode(row.pairId)} className={BTN} aria-label={`View SVG code for ${row.name}`}>Code</button>
      <button type="button" data-testid={`sg-history-${row.pairId}`} disabled={!hasSvg} onClick={() => mods.onHistory(row.pairId)} className={BTN}>History</button>
    </div>
  );
}

function ActionsCell({ row, hasSvg, mods }: { row: SvgRow; hasSvg: boolean; mods: GenRowMods }) {
  return (
    <div className="flex gap-1">
      <button type="button" data-testid={`sg-generate-${row.pairId}`} onClick={() => mods.onGenerate(row.pairId)}
        className="rounded-lg bg-indigo-500 px-2 py-1 text-white hover:bg-indigo-400">
        {hasSvg ? "Regenerate" : "Generate"}
      </button>
      <button type="button" data-testid={`sg-approve-${row.pairId}`} disabled={!hasSvg} onClick={() => mods.onReview(row.pairId, "approved")} className={`${BTN} text-emerald-300`} aria-label={`Approve ${row.name}`}>✓</button>
      <button type="button" data-testid={`sg-decline-${row.pairId}`} disabled={!hasSvg} onClick={() => mods.onReview(row.pairId, "declined")} className={`${BTN} text-rose-300`} aria-label={`Decline ${row.name}`}>✕</button>
    </div>
  );
}

const BTN = "rounded-lg border border-white/10 px-2 py-1 enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
