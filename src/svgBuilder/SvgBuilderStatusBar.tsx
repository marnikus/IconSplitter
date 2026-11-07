// SvgBuilderStatusBar.tsx — one honest status line: approval source, layout,
// short-pool warnings, broken-source warnings and the current action result.
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderStatusBar({ b }: { b: BuilderApi }) {
  const warnings = [
    ...b.notices,
    ...(b.layout.overflow ? ["The requested recipe exceeds this artboard's capacity"] : []),
    ...(b.document !== null && b.document.brokenIds.length > 0
      ? [`${b.document.brokenIds.length} approved SVG(s) could not be embedded`] : []),
  ];
  return <div className={`builder-statusbar${b.error ? " is-error" : ""}`} data-testid="builder-statusbar" aria-live="polite">
    <span className="builder-status-text" data-testid="builder-status-text">{b.status}</span>
    <span className="builder-status-count" data-testid="builder-status-count">
      {b.assets.length} approved · {b.checked.length}/{b.layout.capacity} placed · {b.config.artboard.width}×{b.config.artboard.height}
    </span>
    {b.busy !== null && <span className="builder-busy" data-testid="builder-busy">{b.busy}</span>}
    {warnings.length > 0 && <span className="builder-warning" data-testid="builder-warning">{warnings.join(" · ")}</span>}
    <span className={`builder-toast${b.error ? " is-error" : ""}`} data-testid="builder-toast">{b.status}</span>
  </div>;
}
