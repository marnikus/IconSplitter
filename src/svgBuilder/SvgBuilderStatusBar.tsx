// SvgBuilderStatusBar.tsx — the one action-result line, shown as a bottom-centre
// toast for 4.2 s after each change (reference), plus the busy state. Errors
// stay until the next message so a refusal is never missed (RULE 2/4).
import { useEffect, useState } from "react";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderStatusBar({ b }: { b: BuilderApi }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(true);
    if (b.error) return;
    const t = setTimeout(() => setShown(false), 4200);
    return () => clearTimeout(t);
  }, [b.status, b.error]);
  return <div className="bld-toast-zone" aria-live="polite">
    {b.busy !== null && <span className="bld-toast is-busy" data-testid="builder-busy">{b.busy}</span>}
    <span className={`bld-toast${b.error ? " is-error" : ""}`} data-testid="builder-toast" data-shown={shown} hidden={!shown}>{b.status}</span>
    <span className="bld-sr" data-testid="builder-status-text">{b.status}</span>
  </div>;
}
