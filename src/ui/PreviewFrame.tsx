// Existing exported-art preview frame; only the media inside differs by workflow.
import type { ReactNode } from "react";
import type { ZoomBox } from "../lib/zoom";
export default function PreviewFrame(p: { box: ZoomBox; color?: string; outline?: boolean; testid?: string; children: ReactNode }) {
  return <div className={`svg-preview-frame${p.outline ? " contrast" : ""}`} data-testid={p.testid}
    style={{ width: p.box.width, height: p.box.height, background: p.color }} data-bg={p.color}>{p.children}</div>;
}
