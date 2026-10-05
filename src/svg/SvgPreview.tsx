// SvgPreview.tsx — the frame a saved SVG is shown in (RULE 4/20/24).
// Owns: the empty-vs-broken distinction (no SVG yet is not the same as a file
// that cannot be drawn), and the isolated shadow root the artwork is rendered
// into, so a saved document can never restyle the app or reach the network.
// Every rule about the document itself lives in lib/svgpreview.

import { useEffect, useMemo, useRef } from "react";
import { buildSvgPreview, PREVIEW_CSS } from "../lib/svgpreview";

export interface SvgPreviewProps {
  code: string | null;
  /** The frame's box in px — its own ratio at the row's zoom height (I-55). */
  box: { width: number; height: number };
  testid: string;
  label: string;
  /** Recorded so a test can prove preview and Copy show the same version. */
  version: number;
}

export default function SvgPreviewBox({ code, box, testid, label, version }: SvgPreviewProps) {
  const preview = useMemo(() => buildSvgPreview(code), [code]);
  if (code === null || code.trim() === "") {
    return <Chip className="svg-thumb missing" box={box} testid={testid}>No SVG</Chip>;
  }
  if (!preview.ok) {
    return <Chip className="svg-thumb missing error" box={box} testid={testid} error={preview.error}>Preview failed</Chip>;
  }
  return <ShadowSvg html={preview.html} box={box} testid={testid} label={label} version={version} />;
}

interface ChipProps {
  className: string;
  box: { width: number; height: number };
  testid: string;
  error?: string | null;
  children: string;
}

/** The honest fallback: says which of the two failures it is. */
function Chip({ className, box, testid, error, children }: ChipProps) {
  return (
    <span className={className} style={{ width: box.width, height: box.height }} title={error ?? undefined}
      data-testid={testid} data-error={error ?? undefined}>{children}</span>
  );
}

interface ShadowProps {
  html: string;
  box: { width: number; height: number };
  testid: string;
  label: string;
  version: number;
}

function ShadowSvg({ html, box, testid, label, version }: ShadowProps) {
  const host = useRef<HTMLDivElement | null>(null);
  useShadowArt(html, host);
  return (
    <div ref={host} className="svg-preview" style={{ width: box.width, height: box.height }}
      role="img" aria-label={label} data-testid={testid} data-version={version} />
  );
}

/** Paints the sanitized document inside its own shadow root (RULE 20). */
function useShadowArt(html: string, host: { current: HTMLDivElement | null }): void {
  useEffect(() => {
    const node = host.current;
    if (node === null) return;
    const root = node.shadowRoot ?? node.attachShadow({ mode: "open" });
    root.innerHTML = `${PREVIEW_CSS}${html}`;
  }, [html, host]);
}
