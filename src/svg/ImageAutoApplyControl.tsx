export default function ImageAutoApplyControl(p: { checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="svg-img-count-control">
    <label><input type="checkbox" data-testid="svg-img-auto-apply" checked={p.checked}
      onChange={(e) => p.onChange(e.target.checked)} /> Regenerate images: apply automatically</label>
    <p className="svg-note" data-testid="svg-img-auto-apply-note">{p.checked
      ? "Save returned icons as new main-image versions without the Apply/Discard dialog. Check your results afterwards: moved or swapped artwork cannot be detected automatically."
      : "Review multi-icon results before applying new versions. Single-icon results are saved automatically."}</p>
  </div>;
}
