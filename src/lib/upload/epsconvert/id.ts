// id.ts — ConverterId read-back (RULE 13): unknown/missing → builtin.

import type { ConverterId } from "./types";

/** A stored converter id; junk becomes the documented default. */
export function readConverter(value: unknown): ConverterId {
  return value === "inkscape" ? "inkscape" : "builtin";
}
