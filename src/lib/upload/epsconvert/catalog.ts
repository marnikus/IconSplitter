// catalog.ts — the EPS converters the dropdown lists (D1). One row here
// plus one module is how a third converter lands; no stub options.

import type { ConverterId, VerifyProfile } from "./types";

export interface ConverterInfo {
  id: ConverterId;
  writer: string;
  label: string;
  hint: string;
  needsHost: boolean;
  verifyProfile: VerifyProfile;
}

export const EPS_CONVERTERS: ConverterInfo[] = [
  {
    id: "builtin",
    writer: "builtin-subset-1",
    label: "Built-in (EPS 10 subset)",
    hint: "EPS 10 for the documented subset; anything else fails that stage honestly",
    needsHost: false,
    verifyProfile: "eps10",
  },
  {
    id: "inkscape",
    writer: "inkscape-cli",
    label: "Inkscape CLI",
    hint: "local Inkscape via the loopback helper (127.0.0.1:7788); start node tools/inkscape-host.mjs",
    needsHost: true,
    verifyProfile: "generic",
  },
];

export function converterOf(id: ConverterId): ConverterInfo {
  return EPS_CONVERTERS.find((c) => c.id === id) ?? EPS_CONVERTERS[0];
}

export function writerOf(id: ConverterId): string {
  return converterOf(id).writer;
}

/** The row's settings cell: whether EPS is on, and which converter. */
export function epsSettingLine(includeEps: boolean, id: ConverterId): string {
  return includeEps ? `eps on · ${id}` : "eps off";
}
