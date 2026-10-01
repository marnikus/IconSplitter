// Warnings.tsx — the honest error surfaces of the Selection tab (spec §8, §10;
// RULE 2/4): unsupported browser, unreadable decision file, failed write and the
// count of pairs whose sides are not both present.

import { useMemo } from "react";
import type { ReviewApi } from "./api";

export default function Warnings({ r }: { r: ReviewApi }) {
  const unpaired = useMemo(() => r.s.items.filter((i) => i.kind !== "paired").length, [r.s.items]);
  return (
    <>
      {!r.supported && (
        <p data-testid="review-fs-warning" className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Selection review needs Chrome or Edge (File System Access API) to read images and write the review file.
        </p>
      )}
      {(r.s.fileStatus === "corrupt" || r.s.fileStatus === "write-error") && <FileWarning r={r} />}
      {unpaired > 0 && (
        <p data-testid="review-unpaired" className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
          {unpaired} entr{unpaired === 1 ? "y has" : "ies have"} no matching side — each row is labelled “AI result missing”
          or “Original missing”, and its decision is still stored.
        </p>
      )}
    </>
  );
}

function FileWarning({ r }: { r: ReviewApi }) {
  const corrupt = r.s.fileStatus === "corrupt";
  return (
    <div data-testid="review-file-warning" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
      <span aria-hidden="true">⚠</span>
      <p className="min-w-0 flex-1">
        <b>{corrupt ? "Decision file could not be read." : "Decision file could not be written."}</b>{" "}
        {r.s.fileNote ?? "Unknown error"}{" "}
        {corrupt
          ? "The file is left untouched — your decisions are retained in memory."
          : "Your pending change is retained in memory."}{" "}
        <span className="font-mono text-xs text-amber-200/80">review-decisions.json</span>
      </p>
      <button type="button" className="btn-mini" data-testid="review-file-retry" onClick={r.retry}>↻ {corrupt ? "Retry read" : "Retry write"}</button>
      {corrupt && (
        <button type="button" className="btn-mini" data-testid="review-file-reset" onClick={r.resetFile}>
          Back up corrupt file &amp; start fresh
        </button>
      )}
    </div>
  );
}
