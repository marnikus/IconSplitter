// SvgImgReview.tsx — a returned mosaic is not a trustworthy identity map
// until the user sees its proposed named crops and explicitly applies them.

import type { ImageReview } from "./types";

export default function SvgImgReview({ review, onApply, onDiscard }: {
  review: ImageReview;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="svg-backdrop" data-testid="svg-img-review">
      <section className="svg-modal img-regen" role="dialog" aria-modal="true" aria-label="Review edited icon grid">
        <header className="svg-modal-head"><h2>Review edited icons · request {review.group} of {review.total}</h2></header>
        <div className="svg-modal-body">
          <p>Check every icon is still in its original position. Resizing is handled; moved or swapped artwork cannot be detected automatically.</p>
          <div className="svg-img-result-grid">
            <figure><img src={review.mosaic} alt="Edited composite returned by image provider" /><figcaption>Returned square</figcaption></figure>
            <div className="svg-img-result-cells">{review.cells.map((cell) => <figure key={cell.id}>
              <img src={cell.url} alt={`Proposed image for ${cell.name}`} /><figcaption>{cell.name}</figcaption>
            </figure>)}</div>
          </div>
          <div className="svg-modal-actions">
            <button type="button" className="svg-btn" data-testid="svg-img-discard" disabled={review.busy} onClick={onDiscard}>Discard these results</button>
            <button type="button" className="svg-btn primary" data-testid="svg-img-apply" disabled={review.busy} onClick={onApply}>Apply as new versions</button>
          </div>
        </div>
      </section>
    </div>
  );
}
