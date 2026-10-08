// inkscape.ts — the Inkscape CLI converter (2026-10-09): a thin client to the
// local helper (`tools/bridge/`, 127.0.0.1) that runs Inkscape on the user's
// own machine. The browser sends the prepared SVG and receives the EPS; it
// stays the ONLY writer of the package (RULE 15/23), and the helper never
// sees anything but that text (RULE 20). Every failure is named with its fix:
// the helper is down, Inkscape is not installed, Inkscape failed, the answer
// is not an EPS.

import type { ConvertResult, ConverterDeps, ConverterState, EpsConverter, EpsConvertInput } from "./types";

export const START_HELPER_FIX = "start run_inkscape_bridge.bat (or run_app_inkscape.bat) and keep its window open";
export const INSTALL_INKSCAPE_FIX = "install Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH";
const EPS_HEAD = "%!PS-Adobe";

interface Health {
  ok?: boolean;
  inkscape?: { found?: boolean; version?: string | null; fix?: string | null };
}

export const inkscapeConverter: EpsConverter = {
  id: "inkscape",
  label: "Inkscape CLI (local helper)",
  probe,
  convert,
};

async function probe(deps: ConverterDeps): Promise<ConverterState> {
  let health: Health;
  try {
    const res = await deps.fetch(`${deps.bridgeUrl}/health`, { method: "GET" });
    health = (await res.json()) as Health;
  } catch {
    return { ok: false, reason: unreachable(deps.bridgeUrl), fix: START_HELPER_FIX };
  }
  if (health.inkscape?.found === true) return { ok: true, version: health.inkscape.version ?? "unknown" };
  return { ok: false, reason: "the Inkscape helper is running but Inkscape was not found", fix: health.inkscape?.fix ?? INSTALL_INKSCAPE_FIX };
}

async function convert(input: EpsConvertInput, deps: ConverterDeps, signal?: AbortSignal): Promise<ConvertResult> {
  let res: Response;
  try {
    res = await deps.fetch(`${deps.bridgeUrl}/convert/eps`, {
      method: "POST", body: input.svg, headers: { "content-type": "image/svg+xml" }, ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    return { ok: false, reason: unreachable(deps.bridgeUrl), fix: START_HELPER_FIX };
  }
  const body = await res.text();
  if (!res.ok) return { ok: false, reason: reasonOf(body, res.status) };
  if (!body.startsWith(EPS_HEAD)) return { ok: false, reason: "the helper answered with something that is not an EPS" };
  return { ok: true, eps: body, writer: `inkscape-cli@${res.headers.get("x-inkscape-version") ?? "unknown"}`, fixes: [] };
}

function unreachable(url: string): string {
  return `the Inkscape helper is not reachable at ${url}`;
}

/** The helper's own `{ reason }` when it sent one, else the status. */
function reasonOf(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    if (typeof parsed.reason === "string") return parsed.reason;
  } catch { /* not JSON: fall through to the status */ }
  return `the Inkscape helper answered HTTP ${status}`;
}
