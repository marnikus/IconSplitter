// epshelper.tsx — the Inkscape helper row of ANY export settings sheet
// (2026-11-17): the helper's URL, a Check button and the live state line
// (running + version, not reachable, or Inkscape not installed — each with its
// fix, RULE 4/24), device config validated on write (RULE 13). One component,
// both flows: the SVG to upload dialog and the sheet builder show the same row
// under the same connector choice; `scope` is the dialog's test-id prefix.
import { useCallback, useEffect, useState } from "react";
import { CONVERTERS } from "../lib/upload/epsconv/registry";
import { readBridgeUrl } from "../lib/upload/epsconv/bridgeconfig";
import type { ConverterState } from "../lib/upload/epsconv/types";
import { loadBridgeConfig, saveBridgeConfig } from "../upload/configstore";

/** One helper row for the dialog whose test ids start with `scope` (`upload` / `bld`). */
export default function EpsHelperRow({ scope }: { scope: string }) {
  const [url, setUrl] = useState(() => loadBridgeConfig().url);
  const [state, setState] = useState<ConverterState | null>(null);
  const probe = useCallback(async (at: string) => {
    setState(null);
    const bridgeUrl = readBridgeUrl(at) ?? at;
    setState(await CONVERTERS.inkscape.probe({ bridgeUrl, fetch: (u, init) => globalThis.fetch(u, init) }));
  }, []);
  useEffect(() => { void probe(url); }, [probe, url]);
  const onUrl = (next: string) => {
    setUrl(next);
    const valid = readBridgeUrl(next);
    if (valid !== null) saveBridgeConfig({ url: valid });
  };
  return (
    <div className="up-helper" data-testid={`${scope}-eps-helper`}>
      <div className="up-bg-row">
        <input className="svg-input" data-testid={`${scope}-eps-helper-url`} aria-label="Inkscape helper URL"
          value={url} onChange={(e) => onUrl(e.target.value)} />
        <button type="button" className="svg-btn tiny" data-testid={`${scope}-eps-helper-check`} onClick={() => void probe(url)}>Check</button>
      </div>
      <small className={`up-helper-state ${stateClass(state)}`} data-testid={`${scope}-eps-helper-state`}>{stateLine(state)}</small>
    </div>
  );
}

function stateClass(state: ConverterState | null): string {
  if (state === null) return "checking";
  return state.ok ? "ok" : "warn";
}

/** One line: running + version, or the reason and its fix. */
export function stateLine(state: ConverterState | null): string {
  if (state === null) return "checking the helper…";
  if (state.ok) return `helper running · Inkscape ${state.version}`;
  return `${state.reason} — ${state.fix}`;
}
