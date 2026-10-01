// SvgPreview.tsx — the frame a saved SVG is shown in (RULE 4/20/24).
// Owns: the empty-vs-broken distinction (no SVG yet is not the same as a file
// that cannot be drawn), and the isolated shadow root the artwork is rendered
// into, so a saved document can never restyle the app or reach the network.
// Every rule about the document itself lives in lib/svgpreview.

import { useEffect, useMemo, useRef } from "react";
import { buildSvgPreview, PREVIEW_CSS } from "../lib/svgpreview";

export interface SvgPreviewProps {
  code: string | null;
  /** Side of the square frame, in px — the row's thumb size. */
  size: number;
  testid: string;
  label: string;
  /** Recorded so a test can prove preview and Copy show the same version. */
  version: number;
}

export default function SvgPreviewBox({ code, size, testid, label, version }: SvgPreviewProps) {
  const preview = useMemo(() => buildSvgPreview(code), [code]);
  if (code === null || code.trim() === "") {
    return <Chip className="svg-thumb missing" size={size} testid={testid}>No SVG</Chip>;
  }
  if (!preview.ok) {
    return <Chip className="svg-thumb missing error" size={size} testid={testid} error={preview.error}>Preview failed</Chip>;
  }
  return <ShadowSvg html={preview.html} size={size} testid={testid} label={label} version={version} />;
}

interface ChipProps {
  className: string;
  size: number;
  testid: string;
  error?: string | null;
  children: string;
}

/** The honest fallback: says which of the two failures it is. */
function Chip({ className, size, testid, error, children }: ChipProps) {
  return (
    <span className={className} style={{ height: size }} title={error ?? undefined}
      data-testid={testid} data-error={error ?? undefined}>{children}</span>
  );
}

interface ShadowProps {
  html: string;
  size: number;
  testid: string;
  label: string;
  version: number;
}

function ShadowSvg({ html, size, testid, label, version }: ShadowProps) {
  const host = useRef<HTMLDivElement | null>(null);
  useShadowArt(html, host);
  return (
    <div ref={host} className="svg-preview" style={{ width: size, height: size }}
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
