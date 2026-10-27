import DisclosureGroup from "../ui/DisclosureGroup";
// Native disclosures keep decoration controls mounted, but out of the way.
import type { ReactNode } from "react";

export default function UploadSettingsGroup({ name, label, children }: {
  name: "badge" | "sizeguide" | "shadow";
  label: string;
  children: ReactNode;
}) {
  return <DisclosureGroup label={label} testid={`upload-set-${name}-section`} summaryTestid={`upload-set-${name}-summary`}>{children}</DisclosureGroup>;
}
