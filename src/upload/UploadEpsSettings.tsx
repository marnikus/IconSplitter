// UploadEpsSettings.tsx — the EPS converter drop list and the Inkscape helper
// row of the export settings dialog (2026-10-09, design D3). The list IS the
// registry table; choosing a converter never toggles EPS itself (RULE 10). The
// helper row shows the probe's live state — running + version, not reachable,
// or Inkscape not installed — each with its fix (RULE 4/24), and lets the
// user point the app at another helper URL (device config, RULE 13).

import { useCallback, useEffect, useState } from "react";
import { CONVERTERS, CONVERTER_IDS, parseConverterId } from "../lib/upload/epsconv/registry";
import { readBridgeUrl } from "../lib/upload/epsconv/bridgeconfig";
import type { ConverterState } from "../lib/upload/epsconv/types";
import { loadBridgeConfig, saveBridgeConfig } from "./configstore";
import { Marker, change, type SettingsFieldProps } from "./settingsfield";

/** The drop list, and the helper row when the Inkscape converter is chosen. */
export function ConverterSetting({ p, effective }: SettingsFieldProps) {
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">EPS converter<Marker p={p} field="epsConverter" testid="eps-converter" /></span>
      <select className="svg-input" data-testid="upload-set-eps-converter" aria-label="EPS converter"
        value={effective.epsConverter} onChange={(e) => change(p, "epsConverter", parseConverterId(e.target.value))}>
        {CONVERTER_IDS.map((id) => <option key={id} value={id}>{CONVERTERS[id].label}</option>)}
      </select>
      <small className="up-hint">who writes the EPS when "Also write EPS" is on — the built-in subset writer, or Inkscape on this machine</small>
      {effective.epsConverter === "inkscape" && <HelperRow />}
    </div>
  );
}

/** The helper's URL, a Check button and the live state line. */
function HelperRow() {
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
    <div className="up-helper" data-testid="upload-eps-helper">
      <div className="up-bg-row">
        <input className="svg-input" data-testid="upload-eps-helper-url" aria-label="Inkscape helper URL"
          value={url} onChange={(e) => onUrl(e.target.value)} />
        <button type="button" className="svg-btn tiny" data-testid="upload-eps-helper-check" onClick={() => void probe(url)}>Check</button>
      </div>
      <small className={`up-helper-state ${stateClass(state)}`} data-testid="upload-eps-helper-state">{stateLine(state)}</small>
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
