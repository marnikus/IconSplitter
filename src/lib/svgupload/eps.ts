// eps.ts — the optional EPS output, and the honesty the request demands about it
// (design §13, C10; merge report §3.2/§9). EPS is PostScript, so the tab's FIRST
// answer is its own writer (`lib/svgupload/epswrite`) for the subset icons are
// made of. This module owns the OTHER two things: the converter gate for
// documents that subset cannot draw, and the check that whatever comes back
// really is Encapsulated PostScript (the `%!PS-Adobe` header plus an EPSF
// bounding box) before a single `.eps` byte is written. A PDF, a renamed SVG or
// an HTML error page is refused, never renamed into place; when neither the local
// writer nor a converter can produce the file, the export is SVG+JPEG and is
// reported PARTIAL, never green.

export interface EpsPlan {
  /** True when the user asked for EPS and a converter is configured. */
  requested: boolean;
  converter: string | null;
  /** Why EPS will not be produced — stated before any work starts (preflight). */
  reason: string | null;
}

export const NO_CONVERTER_REASON =
  "The EPS could not be written from the SVG's own geometry and no EPS converter is configured — the SVG and the JPEG were still exported (this export is Partial, not Processed).";

/**
 * Is a converter available at all? The local writer needs no configuration, so
 * a null converter is no longer a refusal by itself — only the fallback.
 */
export function planEps(includeEps: boolean, converter: string | null): EpsPlan {
  if (!includeEps) return { requested: false, converter: null, reason: null };
  const url = converter?.trim() ?? "";
  if (url === "") return { requested: true, converter: null, reason: NO_CONVERTER_REASON };
  return { requested: true, converter: url, reason: null };
}

/** The request the converter receives: the export SVG plus the artboard size. */
export function epsRequest(converter: string, svg: string, size: { width: number; height: number }): {
  url: string; init: { method: string; headers: Record<string, string>; body: string };
} {
  return {
    url: converter,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/postscript, application/eps" },
      body: JSON.stringify({ format: "eps", width: size.width, height: size.height, svg }),
    },
  };
}

/** A genuine EPS begins with the PostScript magic and declares its bounding box. */
export function isGenuineEps(bytes: Uint8Array): boolean {
  if (bytes.length < 32) return false;
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  if (!head.startsWith("%!PS-Adobe")) return false;
  return /%%BoundingBox\s*:\s*-?\d+\s+-?\d+\s+-?\d+\s+-?\d+/.test(head);
}

export interface EpsCheck {
  ok: boolean;
  errors: string[];
}

/** The verification a written EPS must pass before it is reported as produced. */
export function verifyEps(bytes: Uint8Array): EpsCheck {
  const errors: string[] = [];
  if (!isGenuineEps(bytes)) {
    errors.push("The converter's answer is not Encapsulated PostScript (no %!PS-Adobe header with a BoundingBox).");
    return { ok: false, errors };
  }
  const tail = new TextDecoder("latin1").decode(bytes.slice(-2048));
  if (!tail.includes("%%EOF")) errors.push("The EPS file has no %%EOF trailer — it is probably truncated.");
  return { ok: errors.length === 0, errors };
}

/** Why a converter call failed, in the words the row and the JSON both use. */
export function epsFailureReason(status: number, body: string): string {
  if (status === 0) return `The EPS converter could not be reached${body === "" ? "" : `: ${body}`}.`;
  if (status === 404 || status === 405) return `The EPS converter answered ${status} — the configured URL does not accept EPS conversions.`;
  if (status >= 500) return `The EPS converter failed (${status})${body === "" ? "" : `: ${clip(body)}`}.`;
  return `The EPS converter rejected the request (${status})${body === "" ? "" : `: ${clip(body)}`}.`;
}

function clip(text: string): string {
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}
