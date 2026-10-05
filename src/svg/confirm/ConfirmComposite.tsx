// ConfirmComposite.tsx — builds and shows the contact sheet of the request on
// screen, in memory only: it is never written into the user's output folder. It
// uses that request's own plan items, so the preview and the run draw the same
// images, and it is remounted (see SvgConfirm's key) when another request is
// shown, so a built sheet never sits under the wrong request.

import { useState } from "react";
import type { DirHandleLike } from "../../lib/fs";
import { buildComposite, type BuiltComposite, type CompositeSource } from "../composite";

interface CompositeProps {
  rootRef: { current: DirHandleLike | null };
  items: readonly CompositeSource[];
  /** 0-based position of the request on screen, and how many there are. */
  index: number;
  total: number;
}

export default function CompositePreview({ rootRef, items, index, total }: CompositeProps) {
  const { built, error, build } = useComposite(rootRef, items);
  return (
    <div className="svg-composite" data-testid="svg-composite">
      <div className="svg-field-label">
        <span>Contact sheet · request {index + 1} of {total}</span>
        <button type="button" className="svg-link" data-testid="svg-composite-build" onClick={build}>Build preview</button>
      </div>
      {error !== null && <p className="svg-note error" data-testid="svg-composite-error">{error}</p>}
      {built === null
        ? <p className="svg-note">Built in memory only — never written into your SVG output folder.</p>
        : <>
          <img className="svg-composite-img" data-testid="svg-composite-img" src={built.dataUrl} alt="Contact sheet sent with this request" />
          <p className="svg-note" data-testid="svg-composite-meta">
            {built.layout.cols}×{built.layout.rows} grid · {built.layout.size}px · {built.layout.empty.length} empty cell(s) · hash {built.hash.slice(0, 12)}
          </p>
        </>}
    </div>
  );
}

function useComposite(rootRef: CompositeProps["rootRef"], items: readonly CompositeSource[]) {
  const [built, setBuilt] = useState<BuiltComposite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const build = () => {
    const root = rootRef.current;
    if (root === null) return setError("Pick the source folder first");
    setError(null);
    void buildComposite(root, items).then(setBuilt).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "the contact sheet could not be built — no request was sent"));
  };
  return { built, error, build };
}
