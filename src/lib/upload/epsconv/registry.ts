// registry.ts — THE table of EPS converters (2026-10-09, RULE 10): the drop
// list, the EPS stage and the record parser all read it. Adding a converter is
// one file, one row here, one test — nothing else learns a new name.

import { builtinConverter } from "./builtin";
import { inkscapeConverter } from "./inkscape";
import type { EpsConverter, EpsConverterId } from "./types";

export const CONVERTERS: Record<EpsConverterId, EpsConverter> = {
  builtin: builtinConverter,
  inkscape: inkscapeConverter,
};

/** The drop list order. */
export const CONVERTER_IDS: EpsConverterId[] = ["builtin", "inkscape"];

export const DEFAULT_CONVERTER: EpsConverterId = "builtin";

export function converterOf(id: EpsConverterId): EpsConverter {
  return CONVERTERS[id];
}

/** A stored value → a converter id; anything unknown is the built-in (RULE 13). */
export function parseConverterId(raw: unknown): EpsConverterId {
  return typeof raw === "string" && raw in CONVERTERS ? raw as EpsConverterId : DEFAULT_CONVERTER;
}
