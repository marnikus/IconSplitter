// Native disclosures keep decoration controls mounted, but out of the way.
import type { ReactNode } from "react";

export default function UploadSettingsGroup({ name, label, children }: {
  name: "badge" | "sizeguide" | "shadow";
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="up-shadow-dialog" data-testid={`upload-set-${name}-section`}>
      <summary className="up-set-group-summary" data-testid={`upload-set-${name}-summary`}>{label}</summary>
      <div className="up-set-group-content">{children}</div>
    </details>
  );
}
