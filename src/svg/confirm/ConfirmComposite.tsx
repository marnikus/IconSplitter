// ConfirmComposite.tsx — builds and shows the contact sheet of the first
// request, in memory only: it is never written into the user's output folder.

import { useState } from "react";
import type { DirHandleLike } from "../../lib/fs";
import { buildComposite, type BuiltComposite } from "../composite";
import type { SvgRow } from "../types";

interface CompositeProps {
  rootRef: { current: DirHandleLike | null };
  picked: SvgRow[];
  perRequest: number;
}

export default function CompositePreview({ rootRef, picked, perRequest }: CompositeProps) {
  const { built, error, build } = useComposite(rootRef, picked.slice(0, perRequest));
  const requests = Math.max(1, Math.ceil(picked.length / perRequest));
  return (
    <div className="svg-composite" data-testid="svg-composite">
      <div className="svg-field-label">
        <span>Contact sheet · request 1 of {requests}</span>
        <button type="button" className="svg-link" data-testid="svg-composite-build" onClick={build}>Build preview</button>
      </div>
      {error !== null && <p className="svg-note error" data-testid="svg-composite-error">{error}</p>}
      {built === null
        ? <p className="svg-note">Built in memory only — never written into your SVG output folder.</p>
        : <>
          <img className="svg-composite-img" data-testid="svg-composite-img" src={built.dataUrl} alt="Contact sheet sent with the first request" />
          <p className="svg-note" data-testid="svg-composite-meta">
            {built.layout.cols}×{built.layout.rows} grid · {built.layout.size}px · {built.layout.empty.length} empty cell(s) · hash {built.hash.slice(0, 12)}
          </p>
        </>}
    </div>
  );
}

function useComposite(rootRef: CompositeProps["rootRef"], first: SvgRow[]) {
  const [built, setBuilt] = useState<BuiltComposite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const build = () => {
    const root = rootRef.current;
    if (root === null) return setError("Pick the source folder first");
    setError(null);
    void buildComposite(root, first.map((r) => r.source)).then(setBuilt).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "the contact sheet could not be built — no request was sent"));
  };
  return { built, error, build };
}
